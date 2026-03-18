import cron from "node-cron";
import { runCurrentRoundETL } from "../etl/etlPipeline";

let isSyncing = false;

export function startSyncJob(): void {
  console.log("[syncJob] Scheduling automatic sync every 6 hours");

  cron.schedule("0 */6 * * *", async () => {
    if (isSyncing) {
      console.log("[syncJob] Sync already in progress, skipping");
      return;
    }
    isSyncing = true;
    console.log("[syncJob] Running scheduled round sync...");
    try {
      const result = await runCurrentRoundETL();
      console.log(`[syncJob] Sync complete for round ${result.round}. Players: ${result.playersUpserted}, Errors: ${result.errors.length}`);
    } catch (error) {
      console.error("[syncJob] Scheduled sync failed:", error);
    } finally {
      isSyncing = false;
    }
  });

  cron.schedule("0 */2 * * *", async () => {
    console.log("[syncJob] Running lightweight market status check...");
    try {
      const axios = await import("axios");
      await axios.default.get("https://api.cartola.globo.com/mercado/status", { timeout: 5000 });
    } catch {
      console.warn("[syncJob] Market status check failed (non-critical)");
    }
  });
}
