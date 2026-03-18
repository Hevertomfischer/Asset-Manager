import { Router } from "express";
import { db } from "@workspace/db";
import { dataCollectionLogTable } from "@workspace/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { runCurrentRoundETL } from "../etl/etlPipeline";
import { runProjectionEngine } from "../engines/projectionEngine";
import axios from "axios";

const router = Router();

let syncInProgress = false;
let recalcInProgress = false;

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
    console.error("[admin/sync]", error);
    res.status(500).json({ error: "Sync failed", details: error instanceof Error ? error.message : String(error) });
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
    let currentRound = 1;
    try {
      const r = await axios.get("https://api.cartola.globo.com/mercado/status", { timeout: 5000 });
      currentRound = (r.data as { rodada_atual?: number }).rodada_atual ?? 1;
    } catch {
      console.warn("[admin/recalculate] Could not fetch current round, using 1");
    }

    await runProjectionEngine(currentRound);

    res.json({
      success: true,
      round: currentRound,
      message: `Projections recalculated for round ${currentRound}`,
    });
  } catch (error) {
    console.error("[admin/recalculate]", error);
    res.status(500).json({ error: "Recalculation failed", details: error instanceof Error ? error.message : String(error) });
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

export default router;
