import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { db } from "@workspace/db";
import { dataCollectionLogTable, adminConfigTable, analyticsEventsTable, usersTable, subscriptionsTable, feedbackTable } from "@workspace/db/schema";
import { desc, eq, gte, sql, and } from "drizzle-orm";
import { runCurrentRoundETL, syncHistoricalRound } from "../etl/etlPipeline";
import { applyMpvToDatabase } from "../services/mpvService";
import { runProjectionEngine } from "../engines/projectionEngine";
import { runAvailabilityEngine } from "../engines/availabilityEngine";
import { getLatestProjectionRound } from "../repositories/projectionRepository";
import { syncXgFromFootystats, XG_CLUBS_EXPECTED, XG_CLUBS_DEGRADED_THRESHOLD } from "../helpers/geXgHelper";
import { createLogger } from "../lib/logger";
import axios from "axios";
import { z } from "zod";
import { defaultSeasonEnd, getPlanConfig, planConfigPatchSchema, planConfigSchema } from "../services/billing/planConfig";
import { getLineupAccessConfig, lineupAccessPatchSchema } from "../services/lineupAccessConfig";
import { getHistoricalRepairProgress, isHistoricalRepairRunning, startHistoricalRepair } from "../services/historicalRepairService";
import { calibrateProjectionWeights } from "../services/projectionCalibrationService";
import { getIsSyncing } from "../jobs/syncJob";

const log = createLogger("admin");
const router = Router();

let syncInProgress = false;
let recalcInProgress = false;

const XG_STALE_DAYS_DEFAULT = 4;

async function getConfigValue(key: string, defaultValue: number): Promise<number> {
  try {
    const rows = await db.select().from(adminConfigTable).where(eq(adminConfigTable.key, key)).limit(1);
    if (rows.length === 0) return defaultValue;
    const parsed = parseInt(rows[0].value, 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  } catch {
    return defaultValue;
  }
}

const adminConfigPatchSchema = planConfigPatchSchema.merge(lineupAccessPatchSchema).extend({
  xgStaleDays: z.number().int().min(1).max(30).optional(),
}).strict().refine((patch) => Object.keys(patch).length > 0, "Informe ao menos uma configuração");

async function logAdminAction(source: string, status: string, message: string) {
  try {
    await db.insert(dataCollectionLogTable).values({ source, entityType: "admin_action", status, message });
  } catch (err) {
    log.error("Failed to write admin action log", { source, error: err instanceof Error ? err.message : String(err) });
  }
}

async function getCurrentRound(): Promise<number> {
  try {
    const r = await axios.get("https://api.cartola.globo.com/mercado/status", { timeout: 5000 });
    return (r.data as { rodada_atual?: number }).rodada_atual ?? 1;
  } catch {
    return 1;
  }
}

router.post("/admin/sync/full", async (_req, res) => {
  if (syncInProgress) {
    res.status(429).json({ error: "Sync already in progress" });
    return;
  }

  syncInProgress = true;
  try {
    const result = await runCurrentRoundETL();
    res.json({
      success: result.success,
      round: result.round,
      clubsUpserted: result.clubsUpserted,
      playersUpserted: result.playersUpserted,
      availabilityProcessed: result.availabilityProcessed,
      projectionsGenerated: result.projectionsGenerated,
      errors: result.errors,
      warnings: result.warnings,
      xgMatchesUpdated: result.xgMatchesUpdated,
      xgClubsMapped: result.xgClubsMapped,
      xgDegraded: result.xgDegraded,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Full sync failed", { error: msg });
    await logAdminAction("admin_full_sync", "error", `Full sync failed: ${msg}`);
    res.status(500).json({ error: "Sync failed", details: msg });
  } finally {
    syncInProgress = false;
  }
});

router.post("/admin/sync/market", async (_req, res) => {
  if (syncInProgress) {
    res.status(429).json({ error: "Sync already in progress" });
    return;
  }

  syncInProgress = true;
  try {
    const r = await axios.get("https://api.cartola.globo.com/mercado/status", { timeout: 10000 });
    const status = r.data as { rodada_atual?: number; status_mercado?: number };
    const round = status.rodada_atual ?? 1;
    await logAdminAction("admin_market_sync", "success", `Market sync completed for round ${round}`);
    res.json({ success: true, round, marketStatus: status.status_mercado });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Market sync failed", { error: msg });
    await logAdminAction("admin_market_sync", "error", `Market sync failed: ${msg}`);
    res.status(500).json({ error: "Market sync failed", details: msg });
  } finally {
    syncInProgress = false;
  }
});

router.post("/admin/sync/current-round", async (_req, res) => {
  if (syncInProgress) {
    res.status(429).json({ error: "Sync already in progress" });
    return;
  }

  syncInProgress = true;
  try {
    const result = await runCurrentRoundETL();
    await logAdminAction(
      "admin_current_round_sync",
      result.success ? "success" : "error",
      `Current round sync ${result.success ? "completed" : "completed with errors"} for round ${result.round}` +
        (result.errors.length > 0 ? `: ${result.errors.join("; ")}` : "")
    );
    res.json({
      success: result.success,
      round: result.round,
      clubsUpserted: result.clubsUpserted,
      playersUpserted: result.playersUpserted,
      availabilityProcessed: result.availabilityProcessed,
      projectionsGenerated: result.projectionsGenerated,
      errors: result.errors,
      warnings: result.warnings,
      xgMatchesUpdated: result.xgMatchesUpdated,
      xgClubsMapped: result.xgClubsMapped,
      xgDegraded: result.xgDegraded,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Current round sync failed", { error: msg });
    await logAdminAction("admin_current_round_sync", "error", `Current round sync failed: ${msg}`);
    res.status(500).json({ error: "Sync failed", details: msg });
  } finally {
    syncInProgress = false;
  }
});

router.post("/admin/recalc-mpv", async (req, res) => {
  const overwrite = req.query.overwrite === "true";
  try {
    const updated = await applyMpvToDatabase(overwrite);
    await logAdminAction("admin_recalc_mpv", "success", `MPV recalculated for ${updated} players (overwrite=${overwrite})`);
    res.json({ success: true, updated, overwrite });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("MPV recalculation failed", { error: msg });
    await logAdminAction("admin_recalc_mpv", "error", `MPV recalculation failed: ${msg}`);
    res.status(500).json({ error: "MPV recalculation failed", details: msg });
  }
});

router.post("/admin/recalculate-projections", async (_req, res) => {
  if (recalcInProgress) {
    res.status(429).json({ error: "Recalculation already in progress" });
    return;
  }

  recalcInProgress = true;
  try {
    const currentRound = await getCurrentRound();
    await runAvailabilityEngine(currentRound, []);
    await runProjectionEngine(currentRound);
    await logAdminAction("admin_recalculate", "success", `Projections recalculated for round ${currentRound}`);
    res.json({ success: true, round: currentRound, message: `Projections recalculated for round ${currentRound}` });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Recalculation failed", { error: msg });
    await logAdminAction("admin_recalculate", "error", `Recalculation failed: ${msg}`);
    res.status(500).json({ error: "Recalculation failed", details: msg });
  } finally {
    recalcInProgress = false;
  }
});

router.get("/admin/providers/status", async (_req, res) => {
  try {
    const sources = ["cartola_api", "cartola_status", "ge_probables", "footystats_xg", "historical_cartola"];

    const statusResults = await Promise.all(
      sources.map(async (source) => {
        const logs = await db
          .select()
          .from(dataCollectionLogTable)
          .where(eq(dataCollectionLogTable.source, source))
          .orderBy(desc(dataCollectionLogTable.collectedAt))
          .limit(5);

        const latest = logs[0];
        const errorCount = logs.filter((l) => l.status === "error").length;
        const isDegraded = logs.some((l) => l.status === "degraded");

        const status = !latest
          ? "never_synced"
          : latest.status === "error"
          ? "error"
          : isDegraded
          ? "degraded"
          : "ok";

        let clubsMapped: number | null = null;
        if (source === "footystats_xg") {
          for (const log of logs) {
            const match = log.message?.match(/(\d+)\/\d+ clubs matched/);
            if (match) {
              clubsMapped = parseInt(match[1], 10);
              break;
            }
          }
        }

        return {
          source,
          status,
          lastCollectedAt: latest?.collectedAt?.toISOString() ?? null,
          lastMessage: latest?.message ?? null,
          clubsMapped,
          recentErrorCount: errorCount,
          recentLogs: logs.map((l) => ({
            status: l.status,
            message: l.message,
            entityType: l.entityType,
            collectedAt: l.collectedAt.toISOString(),
          })),
        };
      })
    );

    const overallHealthy = statusResults.every((s) => s.status === "ok" || s.status === "never_synced");

    res.json({
      providers: statusResults,
      overall: overallHealthy ? "healthy" : "degraded",
      syncInProgress,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Failed to fetch provider status", { error: msg });
    res.status(500).json({ error: "Failed to fetch provider status" });
  }
});

router.get("/admin/projection-weights", async (_req, res) => {
  try {
    const { PROJECTION_WEIGHTS } = await import("../config/projectionWeights");
    res.json({ weights: PROJECTION_WEIGHTS.weights });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Failed to fetch projection weights", { error: msg });
    res.status(500).json({ error: "Failed to fetch projection weights" });
  }
});

router.post("/admin/projection-weights", async (req, res) => {
  try {
    const body = req.body as Record<string, number>;
    const { PROJECTION_WEIGHTS } = await import("../config/projectionWeights");

    const allowedKeys: Array<keyof typeof PROJECTION_WEIGHTS.weights> = [
      "overallAverage", "recentForm", "matchup", "playProbability", "homeAdvantage",
    ];

    let updated = 0;
    for (const key of allowedKeys) {
      if (typeof body[key] === "number" && body[key] >= 0 && body[key] <= 1) {
        PROJECTION_WEIGHTS.weights[key] = body[key]!;
        updated++;
      }
    }

    await logAdminAction("admin_weights", "success", `Updated ${updated} projection weights`);
    res.json({ success: true, weights: PROJECTION_WEIGHTS.weights, updated });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Failed to update projection weights", { error: msg });
    res.status(500).json({ error: "Failed to update projection weights" });
  }
});

// NOTE: This handler MUST log to source "footystats_xg" — the same key that
// GET /admin/providers/status queries. Changing either without updating the
// other will cause the status panel to show "Nunca sincronizado" after syncs.
router.post("/admin/sync/xg", async (req, res) => {
  try {
    const body = req.body as { round?: number };

    const round = typeof body.round === "number"
      ? body.round
      : await getCurrentRound();

    await logAdminAction("footystats_xg", "info", `Starting xG sync for round ${round} via footystats.org`);

    const result = await syncXgFromFootystats(round);

    const logStatus =
      result.matchesUpdated === 0
        ? "degraded"
        : result.degraded
        ? "degraded"
        : "success";

    await logAdminAction(
      "footystats_xg",
      logStatus,
      `xG sync round ${round}: ${result.matchesUpdated} matches updated, ${result.clubsMapped}/${XG_CLUBS_EXPECTED} clubs matched` +
        (result.degraded ? ` ⚠️ degraded — only ${result.clubsMapped} clubs matched (expected ≥${XG_CLUBS_DEGRADED_THRESHOLD})` : "")
    );

    res.json({ success: true, round, ...result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("xG sync failed", { error: msg });
    await logAdminAction("footystats_xg", "error", `xG sync failed: ${msg}`);
    res.status(500).json({ error: "xG sync failed", details: msg });
  }
});

router.get("/admin/sync/closed-rounds", async (_req, res) => {
  res.json({ progress: await getHistoricalRepairProgress() });
});

router.post("/admin/sync/closed-rounds", async (_req, res) => {
  if (getIsSyncing() || syncInProgress || isHistoricalRepairRunning()) {
    res.status(409).json({ error: "Já existe uma sincronização em andamento. Aguarde e tente novamente." });
    return;
  }
  try {
    const progress = await startHistoricalRepair();
    res.status(202).json({ progress });
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.post("/admin/sync/historical-round", async (req, res) => {
  const parsed = z.object({ round: z.number().int().min(1).max(38), force: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Informe uma rodada inteira de 1 a 38 e force booleano." }); return; }
  if (isHistoricalRepairRunning()) { res.status(409).json({ error: "Reparo de histórico em andamento." }); return; }
  const roundNum = parsed.data.round;

  try {
    await logAdminAction("admin_historical_sync", "info", `Starting historical sync for round ${roundNum}`);
    const { data: market } = await axios.get("https://api.cartola.globo.com/mercado/status", { timeout: 10000 });
    if (!Number.isInteger(market?.rodada_atual) || roundNum >= market.rodada_atual) {
      res.status(409).json({ error: "Aguarde a rodada encerrar e o mercado avançar para sincronizar pontuações finais." });
      return;
    }
    const result = await syncHistoricalRound(roundNum, { force: parsed.data.force });
    await logAdminAction("admin_historical_sync", "success", `Historical sync completed for round ${roundNum}`);
    res.json({ success: true, round: roundNum, ...result, message: `Pontos reais da rodada ${roundNum} sincronizados com sucesso.` });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Historical sync failed", { round: roundNum, error: msg });
    await logAdminAction("admin_historical_sync", "error", `Historical sync failed for round ${roundNum}: ${msg}`);
    res.status(500).json({ error: "Historical sync failed", details: msg });
  }
});

router.get("/admin/config", async (_req, res) => {
  try {
    const xgStaleDays = await getConfigValue("xgStaleDays", XG_STALE_DAYS_DEFAULT);
    res.json({ xgStaleDays, ...await getPlanConfig(), ...await getLineupAccessConfig() });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Failed to fetch config", { error: msg });
    res.status(500).json({ error: "Failed to fetch config" });
  }
});

router.post("/admin/config", async (req, res) => {
  try {
    const result = adminConfigPatchSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: "Configuração inválida", details: result.error.issues });
      return;
    }
    const { xgStaleDays, freeLineupsPerRound, anonymousLineupMode, ...patch } = result.data;
    const accessPatch = {
      ...(freeLineupsPerRound === undefined ? {} : { freeLineupsPerRound }),
      ...(anonymousLineupMode === undefined ? {} : { anonymousLineupMode }),
    };
    // Mudar somente o ano também atualiza o vencimento, sem conservar um ano anterior.
    if (patch.seasonPassYear !== undefined && patch.seasonPassEndsAt === undefined) {
      patch.seasonPassEndsAt = defaultSeasonEnd(patch.seasonPassYear);
    }
    const effective = planConfigSchema.parse({ ...await getPlanConfig(), ...patch });
    const entries = Object.entries({ ...patch, ...accessPatch, ...(xgStaleDays === undefined ? {} : { xgStaleDays }) });
    await db.transaction(async (tx) => {
      for (const [key, raw] of entries) {
        const value = String(raw);
        await tx.insert(adminConfigTable).values({ key, value })
          .onConflictDoUpdate({ target: adminConfigTable.key, set: { value, updatedAt: new Date() } });
      }
    });
    await logAdminAction("admin_config", "success", `Configurações atualizadas: ${entries.map(([key]) => key).join(", ")}`);
    res.json({ ...effective, ...await getLineupAccessConfig(), xgStaleDays: xgStaleDays ?? await getConfigValue("xgStaleDays", XG_STALE_DAYS_DEFAULT) });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Failed to update config", { error: msg });
    res.status(500).json({ error: "Failed to update config" });
  }
});

router.get("/admin/logs", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query["limit"]) || 20, 100);
    const logs = await db
      .select()
      .from(dataCollectionLogTable)
      .orderBy(desc(dataCollectionLogTable.collectedAt))
      .limit(limit);

    res.json({
      logs: logs.map((l) => ({
        id: l.id,
        source: l.source,
        entityType: l.entityType,
        status: l.status,
        message: l.message,
        collectedAt: l.collectedAt.toISOString(),
      })),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Failed to fetch logs", { error: msg });
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

// ── GET /admin/funnel ─────────────────────────────────────────────────────────
/**
 * Returns event counts for the conversion funnel over the last N days.
 * Query param: days (default 30, max 90)
 *
 * Response:
 *   { days, since, events: [{ event, count, uniqueUsers }] }
 *
 * Ordered by count descending so the funnel top is first.
 */
/**
 * POST /admin/calibrate-projection-weights
 *
 * Analyses historical player_projection vs player_scout_round pairs to compute
 * per-position bias-correction multipliers and the optimal PRICE_VARIATION_FACTOR.
 *
 * Algorithm:
 *   1. Fetch all (projected, actual) pairs for players who actually scored (> 0).
 *   2. Per position: compute median(actual) / median(projected) → correction factor.
 *      TEC is excluded (no scout data in DB — handled by dedicated formula).
 *   3. Store result in admin_config["projection_calibration"] as JSON.
 *   4. Next runProjectionEngine() run will automatically apply these multipliers.
 */
router.post("/admin/calibrate-projection-weights", async (_req, res) => {
  try {
    if (isHistoricalRepairRunning()) {
      res.status(409).json({ error: "Aguarde o reparo; os pesos serão calibrados automaticamente ao final." });
      return;
    }
    const { calibration, report } = await calibrateProjectionWeights();
    await logAdminAction(
      "calibrate_projection_weights",
      "success",
      `Calibrated ${Object.keys(calibration.positionMultipliers).length} positions from ${calibration.totalPairs} pairs`
    );

    res.json({ success: true, calibration, report });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Calibration failed", { error: msg });
    res.status(500).json({ error: "Calibration failed", details: msg });
  }
});

router.get("/admin/funnel", async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query["days"]) || 30, 1), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [eventRows, feedbackRows, activeUsersRows] = await Promise.all([
      // ── All events: count + unique users per event name ──────────────────
      db
        .select({
          event: analyticsEventsTable.event,
          count: sql<number>`count(*)::int`,
          uniqueUsers: sql<number>`count(distinct ${analyticsEventsTable.userId})::int`,
        })
        .from(analyticsEventsTable)
        .where(gte(analyticsEventsTable.createdAt, since))
        .groupBy(analyticsEventsTable.event)
        .orderBy(sql`count(*) desc`),

      // ── feedback_submitted: count by type × day ───────────────────────────
      db
        .select({
          type: sql<string>`${analyticsEventsTable.props}->>'type'`,
          day:  sql<string>`(${analyticsEventsTable.createdAt}::date)::text`,
          count: sql<number>`count(*)::int`,
        })
        .from(analyticsEventsTable)
        .where(
          and(
            eq(analyticsEventsTable.event, "feedback_submitted"),
            gte(analyticsEventsTable.createdAt, since)
          )
        )
        .groupBy(
          sql`${analyticsEventsTable.props}->>'type'`,
          sql`${analyticsEventsTable.createdAt}::date`
        )
        .orderBy(
          sql`${analyticsEventsTable.createdAt}::date desc`,
          sql`count(*) desc`
        ),

      // ── Active users: distinct authenticated users in the period ──────────
      db
        .select({
          activeUsers: sql<number>`count(distinct ${analyticsEventsTable.userId}) filter (where ${analyticsEventsTable.userId} is not null)::int`,
        })
        .from(analyticsEventsTable)
        .where(gte(analyticsEventsTable.createdAt, since)),
    ]);

    // ── Computed conversion metrics ───────────────────────────────────────────
    const eventMap = new Map(eventRows.map((r) => [r.event, r]));
    const landingViewed    = eventMap.get("landing_viewed")?.count    ?? 0;
    const signups          = eventMap.get("signup")?.count            ?? 0;
    const shareCompleted   = eventMap.get("share_completed")?.count   ?? 0;
    const activeUsers      = activeUsersRows[0]?.activeUsers          ?? 0;

    // landing_viewed → signup conversion rate (%)
    const conversionRate =
      landingViewed > 0
        ? Number(((signups / landingViewed) * 100).toFixed(1))
        : null;

    // share_completed per active authenticated user (virality coefficient)
    const shareCoeff =
      activeUsers > 0
        ? Number((shareCompleted / activeUsers).toFixed(3))
        : null;

    log.info(
      `funnel days=${days} landing=${landingViewed} signups=${signups} ` +
      `conversionRate=${conversionRate}% shareCompleted=${shareCompleted} ` +
      `activeUsers=${activeUsers} shareCoeff=${shareCoeff}`
    );

    res.json({
      days,
      since: since.toISOString(),
      events: eventRows,
      feedbackByTypeAndDay: feedbackRows,
      metrics: {
        landingViewed,
        signups,
        conversionRate,
        shareCompleted,
        activeUsers,
        shareCoeff,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Failed to fetch funnel data", { error: msg });
    res.status(500).json({ error: "Failed to fetch funnel data" });
  }
});

router.post("/admin/users/grant-pro", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) return res.status(400).json({ error: "email required" });

  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });

  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

  const [sub] = await db.insert(subscriptionsTable).values({
    userId: user.id,
    plan: "pro",
    status: "active",
    provider: "admin",
    billingPlan: "grant",
    externalId: `admin-${user.id}`,
    currentPeriodEnd: oneYearFromNow,
  }).returning();

  log.info("Granted pro manually", { email, userId: user.id, subId: sub.id });
  return res.json({ ok: true, subscription: sub });
});

// ── Feedback admin endpoints ─────────────────────────────────────────────────

const FEEDBACK_VALID_STATUSES = ["novo", "em_analise", "resolvido", "arquivado"] as const;

router.get("/admin/feedback", async (req, res) => {
  try {
    const { status, type, limit: limitQ, offset: offsetQ } = req.query as Record<string, string>;
    const limit = Math.min(Math.max(Number(limitQ) || 20, 1), 100);
    const offset = Math.max(Number(offsetQ) || 0, 0);

    const conditions: ReturnType<typeof eq>[] = [];
    if (status && FEEDBACK_VALID_STATUSES.includes(status as typeof FEEDBACK_VALID_STATUSES[number])) {
      conditions.push(eq(feedbackTable.status, status));
    }
    if (type && ["bug", "ideia", "elogio", "duvida"].includes(type)) {
      conditions.push(eq(feedbackTable.type, type));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countResult] = await Promise.all([
      db.select().from(feedbackTable)
        .where(where)
        .orderBy(desc(feedbackTable.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ total: sql<number>`count(*)::int` }).from(feedbackTable).where(where),
    ]);

    res.json({ items: rows, total: countResult[0]?.total ?? 0, limit, offset });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Failed to fetch feedback", { error: msg });
    res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

router.get("/admin/feedback/new-count", async (_req, res) => {
  try {
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(feedbackTable)
      .where(eq(feedbackTable.status, "novo"));
    res.json({ count: result?.count ?? 0 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Failed to fetch feedback new count", { error: msg });
    res.status(500).json({ error: "Failed to fetch feedback new count" });
  }
});

router.patch("/admin/feedback/:id", async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id inválido" });

    const { status } = req.body as { status?: string };
    if (!status || !FEEDBACK_VALID_STATUSES.includes(status as typeof FEEDBACK_VALID_STATUSES[number])) {
      return res.status(400).json({ error: `status deve ser um de: ${FEEDBACK_VALID_STATUSES.join(", ")}` });
    }

    const [updated] = await db
      .update(feedbackTable)
      .set({ status })
      .where(eq(feedbackTable.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "feedback não encontrado" });
    return res.json(updated);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Failed to patch feedback", { error: msg });
    return res.status(500).json({ error: "Failed to update feedback" });
  }
});

// ── Users admin endpoints ─────────────────────────────────────────────────────

router.post("/admin/users/set-role", async (req, res) => {
  const { email, role } = req.body as { email?: string; role?: string };
  if (!email) return res.status(400).json({ error: "email required" });
  const VALID_ROLES = ["user", "admin"] as const;
  type ValidRole = typeof VALID_ROLES[number];
  if (!role || !VALID_ROLES.includes(role as ValidRole)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(", ")}` });
  }
  const [user] = await db
    .update(usersTable)
    .set({ role, updatedAt: new Date() })
    .where(eq(usersTable.email, email))
    .returning({ id: usersTable.id, email: usersTable.email, role: usersTable.role });
  if (!user) return res.status(404).json({ error: "User not found" });
  log.info("Set user role", { email, role, userId: user.id });
  return res.json({ ok: true, user });
});

router.get("/admin/users", async (req, res) => {
  try {
    const { search, limit: limitQ, offset: offsetQ } = req.query as Record<string, string>;
    const limit = Math.min(Math.max(Number(limitQ) || 20, 1), 100);
    const offset = Math.max(Number(offsetQ) || 0, 0);

    const now = new Date();

    // Subquery: latest active subscription per user
    const activeSub = db
      .select({
        userId: subscriptionsTable.userId,
        plan: subscriptionsTable.plan,
        status: subscriptionsTable.status,
        currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
      })
      .from(subscriptionsTable)
      .where(
        and(
          eq(subscriptionsTable.status, "active"),
          sql`${subscriptionsTable.currentPeriodEnd} > ${now}`
        )
      )
      .as("active_sub");

    const searchCondition = search?.trim()
      ? sql`(${usersTable.email} ilike ${"%" + search.trim() + "%"} or ${usersTable.name} ilike ${"%" + search.trim() + "%"})`
      : undefined;

    const [rows, countResult] = await Promise.all([
      db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          name: usersTable.name,
          provider: usersTable.provider,
          role: usersTable.role,
          createdAt: usersTable.createdAt,
          plan: activeSub.plan,
          subscriptionEnd: activeSub.currentPeriodEnd,
        })
        .from(usersTable)
        .leftJoin(activeSub, eq(usersTable.id, activeSub.userId))
        .where(searchCondition)
        .orderBy(desc(usersTable.createdAt))
        .limit(limit)
        .offset(offset),

      db
        .select({ total: sql<number>`count(*)::int` })
        .from(usersTable)
        .where(searchCondition),
    ]);

    res.json({ items: rows, total: countResult[0]?.total ?? 0, limit, offset });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Failed to fetch admin users", { error: msg });
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// ── POST /admin/import-csv-scouts ────────────────────────────────────────────
/**
 * One-shot import of the cartola_2026 CSV into player_scout_round (source='csv_2026').
 * Reads the file from <cwd>/attached_assets/. Works in both dev (tsx) and production
 * (node dist/index.cjs) because node is launched from the workspace root in both cases.
 *
 * Returns { inserted, skipped, total } and is idempotent (ON CONFLICT DO UPDATE).
 */
let csvImportInProgress = false;

router.post("/admin/import-csv-scouts", async (_req, res) => {
  if (csvImportInProgress) {
    res.status(429).json({ error: "CSV import already in progress" });
    return;
  }

  const CSV_FILENAME = "cartola_2026_rodadas_1-20_1785252053293.csv";
  // Try CWD (prod, run from workspace root) then two levels up (dev, CWD=artifacts/api-server)
  const candidatePaths = [
    path.join(process.cwd(), "attached_assets", CSV_FILENAME),
    path.join(process.cwd(), "..", "..", "attached_assets", CSV_FILENAME),
  ];
  const csvPath = candidatePaths.find((p) => fs.existsSync(p)) ?? "";

  if (!csvPath) {
    res.status(404).json({ error: "CSV file not found", candidatePaths });
    return;
  }

  csvImportInProgress = true;
  try {
    const { parse } = await import("csv-parse/sync");

    // 1. Build atleta_id → player_id map
    const playersRows = await db.execute<{ id: number; external_id: string }>(
      sql`SELECT id, external_id FROM players WHERE external_source = 'cartola_api'`
    );
    const idMap = new Map(playersRows.rows.map((p) => [p.external_id, p.id]));

    // 2. Parse CSV
    const raw = fs.readFileSync(csvPath, "utf8");
    const records: Record<string, string>[] = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const toInt = (v: string): number | null => {
      if (!v || v.trim() === "") return null;
      const n = parseInt(v, 10);
      return isNaN(n) ? null : n;
    };
    const toFloat = (v: string): number | null => {
      if (!v || v.trim() === "") return null;
      const n = parseFloat(v);
      return isNaN(n) ? null : n;
    };

    // 3. Batch upsert via pg pool
    // @ts-ignore — $client is the underlying Pool on drizzle-orm/node-postgres
    const pool = (db as any).$client as import("pg").Pool;

    const UPSERT_TPL = `
      INSERT INTO player_scout_round (
        player_id, round, source, points,
        goals, assists, shots, shots_on_target,
        tackles, interceptions, fouls_suffered, fouls_committed,
        saves, goals_conceded, clean_sheet,
        yellow_cards, red_cards, penalty_missed, penalty_saved, own_goals,
        ff, v, pc, ps, collected_at
      ) VALUES %ROWS%
      ON CONFLICT (player_id, round, source) DO UPDATE SET
        points          = EXCLUDED.points,
        goals           = EXCLUDED.goals,
        assists         = EXCLUDED.assists,
        shots           = EXCLUDED.shots,
        shots_on_target = EXCLUDED.shots_on_target,
        tackles         = EXCLUDED.tackles,
        interceptions   = EXCLUDED.interceptions,
        fouls_suffered  = EXCLUDED.fouls_suffered,
        fouls_committed = EXCLUDED.fouls_committed,
        saves           = EXCLUDED.saves,
        goals_conceded  = EXCLUDED.goals_conceded,
        clean_sheet     = EXCLUDED.clean_sheet,
        yellow_cards    = EXCLUDED.yellow_cards,
        red_cards       = EXCLUDED.red_cards,
        penalty_missed  = EXCLUDED.penalty_missed,
        penalty_saved   = EXCLUDED.penalty_saved,
        own_goals       = EXCLUDED.own_goals,
        ff              = EXCLUDED.ff,
        v               = EXCLUDED.v,
        pc              = EXCLUDED.pc,
        ps              = EXCLUDED.ps,
        collected_at    = now()
    `;

    const BATCH = 200;
    let valueSets: string[] = [];
    let params: unknown[] = [];
    let pi = 1;
    let inserted = 0;
    let skipped = 0;

    const flushPool = async () => {
      if (valueSets.length === 0) return;
      const querySql = UPSERT_TPL.replace("%ROWS%", valueSets.join(",\n"));
      await pool.query(querySql, params);
      inserted += valueSets.length;
      valueSets = [];
      params = [];
      pi = 1;
    };

    for (const r of records) {
      const playerId = idMap.get(r.atleta_id);
      if (!playerId) { skipped++; continue; }

      const vals: unknown[] = [
        playerId,
        parseInt(r.rodada, 10),
        "csv_2026",
        toFloat(r.pontuacao),
        toInt(r.G),  toInt(r.A),  toInt(r.FT), toInt(r.FD),
        toInt(r.DS), toInt(r.I),  toInt(r.FS), toInt(r.FC),
        toInt(r.DE), toInt(r.GS), toInt(r.SG),
        toInt(r.CA), toInt(r.CV), toInt(r.PP), toInt(r.DP), toInt(r.GC),
        toInt(r.FF), toInt(r.V),  toInt(r.PC), toInt(r.PS),
        new Date(),
      ];

      const placeholders = vals.map(() => `$${pi++}`).join(", ");
      valueSets.push(`(${placeholders})`);
      params.push(...vals);

      if (valueSets.length >= BATCH) await flushPool();
    }
    await flushPool();

    // Recalculate MPV now that csv_2026 data is in the DB
    const mpvUpdated = await applyMpvToDatabase(true);
    log.info("CSV scouts import: MPV recalculated", { mpvUpdated });

    // Recalculate projections immediately so the new scout data is reflected
    const projRound = await getLatestProjectionRound();
    if (projRound) {
      await runProjectionEngine(projRound);
      log.info("CSV scouts import: projections recalculated", { round: projRound });
    }

    await logAdminAction(
      "admin_import_csv_scouts",
      "success",
      `CSV import complete: ${inserted} rows upserted, ${skipped} skipped. MPV updated for ${mpvUpdated} players. Source=csv_2026, file=${CSV_FILENAME}`
    );

    log.info("CSV scouts import complete", { inserted, skipped, total: records.length, mpvUpdated, projRound });
    res.json({ success: true, inserted, skipped, total: records.length, mpvUpdated, projRound });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("CSV scouts import failed", { error: msg });
    await logAdminAction("admin_import_csv_scouts", "error", `CSV import failed: ${msg}`);
    res.status(500).json({ error: "CSV import failed", details: msg });
  } finally {
    csvImportInProgress = false;
  }
});

export default router;
