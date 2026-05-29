import cron from "node-cron";
import { db } from "@workspace/db";
import { adminConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { runCurrentRoundETL, syncHistoricalRound } from "../etl/etlPipeline";
import { createLogger } from "../lib/logger";

const log = createLogger("sync-job");

let isSyncing = false;

const FULL_SYNC_CRON = process.env["CARTOLA_FULL_SYNC_CRON"] ?? "0 */6 * * *";
const MARKET_CHECK_CRON = process.env["CARTOLA_MARKET_CHECK_CRON"] ?? "0 */2 * * *";

const LAST_KNOWN_ROUND_KEY = "lastKnownRound";

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
      }
    }
    log.info(`Initialising lastKnownRound to ${currentRound}`);
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
    } catch (error) {
      log.error(`Auto-sync failed for closed round ${closedRound} — will retry on next cron run`, {
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }
}

export function startSyncJob(): void {
  log.info(`Scheduling full sync with cron: "${FULL_SYNC_CRON}"`);
  log.info(`Scheduling market check with cron: "${MARKET_CHECK_CRON}"`);

  if (!cron.validate(FULL_SYNC_CRON)) {
    log.error(`Invalid CARTOLA_FULL_SYNC_CRON: "${FULL_SYNC_CRON}". Falling back to "0 */6 * * *"`);
  }

  cron.schedule(cron.validate(FULL_SYNC_CRON) ? FULL_SYNC_CRON : "0 */6 * * *", async () => {
    if (isSyncing) {
      log.warn("Sync already in progress, skipping");
      return;
    }
    isSyncing = true;
    log.info("Running scheduled round sync...");
    try {
      const result = await runCurrentRoundETL();
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
    } catch (error) {
      log.error("Scheduled sync failed", { error: error instanceof Error ? error.message : String(error) });
    } finally {
      isSyncing = false;
    }
  });

  const validMarketCheck = cron.validate(MARKET_CHECK_CRON) ? MARKET_CHECK_CRON : "0 */2 * * *";
  cron.schedule(validMarketCheck, async () => {
    log.debug("Running lightweight market status check...");
    try {
      const axios = await import("axios");
      await axios.default.get("https://api.cartola.globo.com/mercado/status", { timeout: 5000 });
      log.debug("Market status check OK");
    } catch {
      log.warn("Market status check failed (non-critical)");
    }
  });
}
