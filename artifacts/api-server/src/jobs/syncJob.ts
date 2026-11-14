import cron from "node-cron";
import { db } from "@workspace/db";
import { adminConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { runCurrentRoundETL, syncHistoricalRound } from "../etl/etlPipeline";
import { createLogger } from "../lib/logger";
import { observeProjectionMarket } from "../services/projectionLockService";
import { isHistoricalRepairRunning } from "../services/historicalRepairService";
import { generateEtlNotifications, createMarketNotification, generateRoundResultNotifications } from "../services/notificationService";

const log = createLogger("sync-job");

let isSyncing = false;

export function getIsSyncing(): boolean {
  return isSyncing;
}

const FULL_SYNC_CRON = process.env["CARTOLA_FULL_SYNC_CRON"] ?? "0 * * * *";
const MARKET_CHECK_CRON = process.env["CARTOLA_MARKET_CHECK_CRON"] ?? "*/30 * * * *";

const LAST_FULL_SYNC_AT_KEY = "lastFullSyncAt";
const STALE_THRESHOLD_MS = 55 * 60 * 1000;

const LAST_KNOWN_ROUND_KEY = "lastKnownRound";
/** adminConfigTable key that stores the last observed market status ("open" | "closed"). */
const MARKET_STATUS_KEY = "marketStatus";

async function getLastKnownRound(): Promise<number | null> {
  try {
    const rows = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.key, LAST_KNOWN_ROUND_KEY))
      .limit(1);
    if (rows.length === 0) return null;
    const parsed = parseInt(rows[0].value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function setLastKnownRound(round: number): Promise<void> {
  try {
    await db
      .insert(adminConfigTable)
      .values({ key: LAST_KNOWN_ROUND_KEY, value: String(round) })
      .onConflictDoUpdate({
        target: adminConfigTable.key,
        set: { value: String(round), updatedAt: new Date() },
      });
  } catch (e) {
    log.warn("Failed to persist lastKnownRound", { error: e instanceof Error ? e.message : String(e) });
  }
}

/** Returns the last stored market status, or null on first run. */
async function getStoredMarketStatus(): Promise<string | null> {
  try {
    const rows = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.key, MARKET_STATUS_KEY))
      .limit(1);
    return rows.length > 0 ? rows[0].value : null;
  } catch {
    return null;
  }
}

async function setStoredMarketStatus(status: string): Promise<void> {
  try {
    await db
      .insert(adminConfigTable)
      .values({ key: MARKET_STATUS_KEY, value: status })
      .onConflictDoUpdate({
        target: adminConfigTable.key,
        set: { value: status, updatedAt: new Date() },
      });
  } catch (e) {
    log.warn("Failed to persist marketStatus", { error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Detect when a round has advanced and automatically persist the final scores
 * for every closed round.
 *
 * Scores are saved via syncHistoricalRound(), which writes records with
 * source = "historical_cartola". This source is already trusted by all backtest
 * queries in history.ts (which filter for ["cartola_api", "historical_cartola"]),
 * making it the canonical authoritative source for final round scores.
 *
 * The round pointer (lastKnownRound in adminConfigTable) is advanced one round
 * at a time, only AFTER each individual round syncs successfully. If a round
 * fails, the loop breaks so the same round is retried on the next cron tick —
 * no closed round is silently skipped due to a transient error.
 */
async function autoSyncClosedRounds(currentRound: number): Promise<void> {
  const lastKnown = await getLastKnownRound();

  if (lastKnown === null) {
    // First run: no tracking record exists yet.
    // Attempt to sync the previous round in case it closed recently and
    // the server was just deployed (or restarted) without seeing the transition.
    if (currentRound > 1) {
      try {
        log.info(`Bootstrap: attempting to sync just-closed round ${currentRound - 1}...`);
        await syncHistoricalRound(currentRound - 1);
        log.info(`Bootstrap: round ${currentRound - 1} sync complete`);
      } catch (error) {
        log.warn(`Bootstrap: round ${currentRound - 1} sync failed (non-fatal, will retry next run)`, {
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
    }
    log.info(`Initialising lastKnownRound to ${currentRound}`);
    // On failure leave the pointer unset so bootstrap retries.
    await setLastKnownRound(currentRound);
    return;
  }

  if (currentRound <= lastKnown) {
    log.debug(`Round unchanged (${currentRound}), no closed-round sync needed`);
    return;
  }

  log.info(`Round advanced from ${lastKnown} to ${currentRound} — syncing ${currentRound - lastKnown} closed round(s)`);

  // Advance the pointer one round at a time, persisting only after each success.
  // If a round fails, break and leave the pointer where it is so the next cron
  // run retries from the same position.
  for (let closedRound = lastKnown; closedRound < currentRound; closedRound++) {
    try {
      log.info(`Auto-syncing final scores for closed round ${closedRound}...`);
      await syncHistoricalRound(closedRound);
      log.info(`Auto-sync complete for round ${closedRound}`);
      // Advance pointer only after confirmed success for this round
      await setLastKnownRound(closedRound + 1);
      // Notify users whose teams have data for this closed round (non-fatal)
      try {
        await generateRoundResultNotifications(closedRound);
      } catch (notifErr) {
        log.warn(`generateRoundResultNotifications failed for round ${closedRound} (non-fatal)`, {
          error: notifErr instanceof Error ? notifErr.message : String(notifErr),
        });
      }
    } catch (error) {
      log.error(`Auto-sync failed for closed round ${closedRound} — will retry on next cron run`, {
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }
}

/**
 * Check the Cartola market status endpoint and emit a global notification
 * whenever it transitions between open ↔ closed.
 *
 * Cartola market status codes (status_mercado field):
 *   1 = open (mercado aberto)
 *   2 = maintenance
 *   4 = closed during round
 *   6 = closed between rounds
 * We treat only code 1 as "open"; all other codes are "closed".
 */
async function checkMarketStatus(): Promise<void> {
  log.debug("Running lightweight market status check...");
  try {
    const axios = await import("axios");
    const resp = await axios.default.get<{ status_mercado?: number; rodada_atual?: number; fechamento?: { timestamp?: number } }>(
      "https://api.cartola.globo.com/mercado/status",
      { timeout: 5000 }
    );

    const statusCode = resp.data?.status_mercado;
    const round = resp.data?.rodada_atual;

    if (typeof statusCode !== "number") {
      log.debug("Market status check OK (no parseable status code)");
      return;
    }

    // Freeze even on first observation after a restart or a missed transition.
    // Persisting the notification status must never happen before this fence.
    if (typeof round === "number") await observeProjectionMarket(statusCode, round, resp.data.fechamento?.timestamp);
    // Cartola code 1 = open; everything else = closed
    const currentStatus = statusCode === 1 ? "open" : "closed";
    const storedStatus = await getStoredMarketStatus();

    log.debug("Market status check OK", { statusCode, currentStatus, storedStatus, round });

    if (storedStatus !== null && storedStatus !== currentStatus && typeof round === "number") {
      // Status changed → emit notification
      const type = currentStatus === "open" ? "market_open" : "market_close";
      log.info(`Market status changed: ${storedStatus} → ${currentStatus}`, { round });
      await createMarketNotification(type, round);
    }

    // Always persist the latest status
    await setStoredMarketStatus(currentStatus);
  } catch {
    log.warn("Market status check failed (non-critical)");
  }
}

async function persistLastFullSyncAt(): Promise<void> {
  try {
    const now = new Date().toISOString();
    await db
      .insert(adminConfigTable)
      .values({ key: LAST_FULL_SYNC_AT_KEY, value: now })
      .onConflictDoUpdate({
        target: adminConfigTable.key,
        set: { value: now, updatedAt: new Date() },
      });
  } catch (e) {
    log.warn("Failed to persist lastFullSyncAt", { error: e instanceof Error ? e.message : String(e) });
  }
}

async function getLastFullSyncAt(): Promise<Date | null> {
  try {
    const rows = await db
      .select()
      .from(adminConfigTable)
      .where(eq(adminConfigTable.key, LAST_FULL_SYNC_AT_KEY))
      .limit(1);
    if (rows.length === 0) return null;
    const d = new Date(rows[0].value);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Exported for use by the auth route: triggers a full sync in background
 * if data is stale (last sync > STALE_THRESHOLD_MS ago). Does not block the
 * caller — fires-and-forgets.
 */
export function triggerFullSyncIfStale(): void {
  if (isSyncing || isHistoricalRepairRunning()) {
    log.debug("triggerFullSyncIfStale: sync already in progress, skipping");
    return;
  }

  // Run the staleness check and conditional sync in the background
  void (async () => {
    try {
      const lastSync = await getLastFullSyncAt();
      const ageMs = lastSync ? Date.now() - lastSync.getTime() : Infinity;
      if (ageMs < STALE_THRESHOLD_MS) {
        log.debug("triggerFullSyncIfStale: data is fresh, skipping", { ageMinutes: Math.round(ageMs / 60000) });
        return;
      }
      if (isSyncing || isHistoricalRepairRunning()) return;
      isSyncing = true;
      log.info("triggerFullSyncIfStale: data is stale, running background sync", { ageMinutes: Math.round(ageMs / 60000) });
      try {
        const result = await runCurrentRoundETL();
        await persistLastFullSyncAt();
        log.info("triggerFullSyncIfStale: sync complete", { round: result.round, errors: result.errors.length });
        await autoSyncClosedRounds(result.round);
        try {
          await generateEtlNotifications(result.round);
        } catch (notifError) {
          log.warn("triggerFullSyncIfStale: generateEtlNotifications failed (non-fatal)", {
            error: notifError instanceof Error ? notifError.message : String(notifError),
          });
        }
      } catch (error) {
        log.error("triggerFullSyncIfStale: sync failed", { error: error instanceof Error ? error.message : String(error) });
      } finally {
        isSyncing = false;
      }
    } catch (outer) {
      log.warn("triggerFullSyncIfStale: staleness check failed", { error: outer instanceof Error ? outer.message : String(outer) });
    }
  })();
}

export function startSyncJob(): void {
  log.info(`Scheduling full sync with cron: "${FULL_SYNC_CRON}"`);
  log.info(`Scheduling market check with cron: "${MARKET_CHECK_CRON}"`);

  if (!cron.validate(FULL_SYNC_CRON)) {
    log.error(`Invalid CARTOLA_FULL_SYNC_CRON: "${FULL_SYNC_CRON}". Falling back to "0 * * * *"`);
  }

  cron.schedule(cron.validate(FULL_SYNC_CRON) ? FULL_SYNC_CRON : "0 * * * *", async () => {
    if (isSyncing || isHistoricalRepairRunning()) {
      log.warn("Sync already in progress, skipping");
      return;
    }
    isSyncing = true;
    log.info("Running scheduled round sync...");
    try {
      const result = await runCurrentRoundETL();
      await persistLastFullSyncAt();
      log.info(
        `Sync complete for round ${result.round}. ` +
        `Players: ${result.playersUpserted}, Clubs: ${result.clubsUpserted}, ` +
        `Scouts: ${result.scoutsInserted}, Matches: ${result.matchesUpserted}, ` +
        `Errors: ${result.errors.length}`
      );
      if (result.errors.length > 0) {
        log.warn("Sync completed with errors", { errors: result.errors });
      }

      await autoSyncClosedRounds(result.round);

      // Generate player-event notifications after a successful ETL run.
      // Non-fatal: a failure here must not prevent future syncs.
      try {
        await generateEtlNotifications(result.round);
      } catch (notifError) {
        log.warn("generateEtlNotifications failed (non-fatal)", {
          round: result.round,
          error: notifError instanceof Error ? notifError.message : String(notifError),
        });
      }
    } catch (error) {
      log.error("Scheduled sync failed", { error: error instanceof Error ? error.message : String(error) });
    } finally {
      isSyncing = false;
    }
  });

  const validMarketCheck = cron.validate(MARKET_CHECK_CRON) ? MARKET_CHECK_CRON : "*/30 * * * *";
  cron.schedule(validMarketCheck, checkMarketStatus);
  void checkMarketStatus();
}
