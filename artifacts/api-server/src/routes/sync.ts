import { Router } from "express";
import { db } from "@workspace/db";
import { adminConfigTable, dataCollectionLogTable } from "@workspace/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { getIsSyncing } from "../jobs/syncJob";
import { createLogger } from "../lib/logger";
import { getPopularityFeatureStatus } from "../services/popularityFeatureService";

const router = Router();
const log = createLogger("sync-status");
const PROVIDER_SOURCES = ["cartola_api", "cartola_status", "ge_probables", "footystats_xg", "historical_cartola"];

router.get("/sync/status", async (_req, res) => {
  try {
    const [rows, providerStates] = await Promise.all([
      db
      .select()
      .from(adminConfigTable)
      .where(inArray(adminConfigTable.key, ["lastFullSyncAt", "marketStatus"])),
      Promise.all(PROVIDER_SOURCES.map(async (source) => {
        const logs = await db.select({ status: dataCollectionLogTable.status })
          .from(dataCollectionLogTable)
          .where(eq(dataCollectionLogTable.source, source))
          .orderBy(desc(dataCollectionLogTable.collectedAt))
          .limit(5);
        // Same recent-health rule as the private provider details endpoint.
        return logs[0]?.status === "error" || logs.some((entry) => entry.status === "degraded");
      })),
    ]);
    const syncRow = rows.find((row) => row.key === "lastFullSyncAt");
    const marketRow = rows.find((row) => row.key === "marketStatus");
    const lastSyncAt = syncRow?.value ?? null;
    const marketStatus = marketRow?.value ?? null;
    // The scheduler updates this row after every successful market observation.
    const lastMarketCheckAt = marketRow?.updatedAt?.toISOString() ?? null;
    const isRunning = getIsSyncing();
    const { popularityFeaturesEnabled, ...popularity } = await getPopularityFeatureStatus();

    res.set("Cache-Control", "no-store");
    res.json({ lastSyncAt, isRunning, marketStatus, providersDegraded: providerStates.some(Boolean), lastMarketCheckAt, popularityFeaturesEnabled, popularity });
  } catch (error) {
    log.error("Failed to read public sync status", { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: "Falha ao buscar status de sincronização" });
  }
});

export default router;
