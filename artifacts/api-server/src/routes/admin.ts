import { Router } from "express";
import { db } from "@workspace/db";
import { dataCollectionLogTable, adminConfigTable } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { runCurrentRoundETL, syncHistoricalRound } from "../etl/etlPipeline";
import { runProjectionEngine } from "../engines/projectionEngine";
import { syncXgFromFootystats, XG_CLUBS_EXPECTED, XG_CLUBS_DEGRADED_THRESHOLD } from "../helpers/geXgHelper";
import axios from "axios";

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

async function setConfigValue(key: string, value: string): Promise<void> {
  await db
    .insert(adminConfigTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: adminConfigTable.key, set: { value, updatedAt: new Date() } });
}

async function logAdminAction(source: string, status: string, message: string) {
  try {
    await db.insert(dataCollectionLogTable).values({ source, entityType: "admin_action", status, message });
  } catch {
    console.error(`[admin] Failed to write log for ${source}`);
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
    console.error("[admin/sync/full]", error);
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
    console.error("[admin/sync/market]", error);
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
    console.error("[admin/sync]", error);
    await logAdminAction("admin_current_round_sync", "error", `Current round sync failed: ${msg}`);
    res.status(500).json({ error: "Sync failed", details: msg });
  } finally {
    syncInProgress = false;
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

    await runProjectionEngine(currentRound);

    await logAdminAction("admin_recalculate", "success", `Projections recalculated for round ${currentRound}`);

    res.json({
      success: true,
      round: currentRound,
      message: `Projections recalculated for round ${currentRound}`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[admin/recalculate]", error);
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
    console.error("[admin/providers/status]", error);
    res.status(500).json({ error: "Failed to fetch provider status" });
  }
});

router.get("/admin/projection-weights", async (_req, res) => {
  try {
    const { PROJECTION_WEIGHTS } = await import("../config/projectionWeights");
    res.json({ weights: PROJECTION_WEIGHTS.weights });
  } catch (error) {
    console.error("[admin/projection-weights]", error);
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
    console.error("[admin/projection-weights POST]", error);
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

    res.json({
      success: true,
      round,
      ...result,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[admin/sync/xg]", error);
    await logAdminAction("footystats_xg", "error", `xG sync failed: ${msg}`);
    res.status(500).json({ error: "xG sync failed", details: msg });
  }
});

router.post("/admin/sync/historical-round", async (req, res) => {
  const body = req.body as { round?: number };
  const roundNum = typeof body.round === "number" ? body.round : null;

  if (!roundNum) {
    res.status(400).json({ error: "Missing 'round' in request body" });
    return;
  }

  try {
    await logAdminAction("admin_historical_sync", "info", `Starting historical sync for round ${roundNum}`);
    await syncHistoricalRound(roundNum);
    await logAdminAction("admin_historical_sync", "success", `Historical sync completed for round ${roundNum}`);
    res.json({ success: true, round: roundNum, message: `Pontos reais da rodada ${roundNum} sincronizados com sucesso.` });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[admin/sync/historical-round]", error);
    await logAdminAction("admin_historical_sync", "error", `Historical sync failed for round ${roundNum}: ${msg}`);
    res.status(500).json({ error: "Historical sync failed", details: msg });
  }
});

router.get("/admin/config", async (_req, res) => {
  try {
    const xgStaleDays = await getConfigValue("xgStaleDays", XG_STALE_DAYS_DEFAULT);
    res.json({ xgStaleDays });
  } catch (error) {
    console.error("[admin/config GET]", error);
    res.status(500).json({ error: "Failed to fetch config" });
  }
});

router.post("/admin/config", async (req, res) => {
  try {
    const body = req.body as { xgStaleDays?: unknown };
    const raw = body.xgStaleDays;
    const parsed = typeof raw === "number" ? Math.round(raw) : typeof raw === "string" ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 30) {
      res.status(400).json({ error: "xgStaleDays must be an integer between 1 and 30" });
      return;
    }
    await setConfigValue("xgStaleDays", String(parsed));
    await logAdminAction("admin_config", "success", `Updated xgStaleDays to ${parsed}`);
    res.json({ xgStaleDays: parsed });
  } catch (error) {
    console.error("[admin/config POST]", error);
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
    console.error("[admin/logs]", error);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

export default router;
