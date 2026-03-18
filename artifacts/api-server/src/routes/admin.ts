import { Router } from "express";
import { db } from "@workspace/db";
import { dataCollectionLogTable } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { runCurrentRoundETL } from "../etl/etlPipeline";
import { runProjectionEngine } from "../engines/projectionEngine";
import axios from "axios";

const router = Router();

let syncInProgress = false;
let recalcInProgress = false;

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
    res.json({
      success: result.success,
      round: result.round,
      clubsUpserted: result.clubsUpserted,
      playersUpserted: result.playersUpserted,
      availabilityProcessed: result.availabilityProcessed,
      projectionsGenerated: result.projectionsGenerated,
      errors: result.errors,
      warnings: result.warnings,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[admin/sync]", error);
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
    const sources = ["cartola_api", "ge_probables", "gato_mestre", "historical_cartola"];

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

        return {
          source,
          status,
          lastCollectedAt: latest?.collectedAt?.toISOString() ?? null,
          lastMessage: latest?.message ?? null,
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
