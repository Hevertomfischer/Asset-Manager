import cron from "node-cron";
import { runCurrentRoundETL } from "../etl/etlPipeline";

let isSyncing = false;

const FULL_SYNC_CRON = process.env["CARTOLA_FULL_SYNC_CRON"] ?? "0 */6 * * *";
const MARKET_CHECK_CRON = process.env["CARTOLA_MARKET_CHECK_CRON"] ?? "0 */2 * * *";

export function startSyncJob(): void {
  console.log(`[syncJob] Scheduling full sync with cron: "${FULL_SYNC_CRON}"`);
  console.log(`[syncJob] Scheduling market check with cron: "${MARKET_CHECK_CRON}"`);

  if (!cron.validate(FULL_SYNC_CRON)) {
    console.error(`[syncJob] Invalid CARTOLA_FULL_SYNC_CRON: "${FULL_SYNC_CRON}". Falling back to "0 */6 * * *"`);
  }

  cron.schedule(cron.validate(FULL_SYNC_CRON) ? FULL_SYNC_CRON : "0 */6 * * *", async () => {
    if (isSyncing) {
      console.log("[syncJob] Sync already in progress, skipping");
      return;
    }
    isSyncing = true;
    console.log("[syncJob] Running scheduled round sync...");
    try {
      const result = await runCurrentRoundETL();
      console.log(
        `[syncJob] Sync complete for round ${result.round}. ` +
        `Players: ${result.playersUpserted}, Clubs: ${result.clubsUpserted}, ` +
        `Scouts: ${result.scoutsInserted}, Matches: ${result.matchesUpserted}, ` +
        `Errors: ${result.errors.length}`
      );
    } catch (error) {
      console.error("[syncJob] Scheduled sync failed:", error);
    } finally {
      isSyncing = false;
    }
  });

  const validMarketCheck = cron.validate(MARKET_CHECK_CRON) ? MARKET_CHECK_CRON : "0 */2 * * *";
  cron.schedule(validMarketCheck, async () => {
    console.log("[syncJob] Running lightweight market status check...");
    try {
      const axios = await import("axios");
      await axios.default.get("https://api.cartola.globo.com/mercado/status", { timeout: 5000 });
    } catch {
      console.warn("[syncJob] Market status check failed (non-critical)");
    }
  });
}
