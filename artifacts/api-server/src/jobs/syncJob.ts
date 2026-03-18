import cron from "node-cron";
import { runCurrentRoundETL } from "../etl/etlPipeline";
import { createLogger } from "../lib/logger";

const log = createLogger("sync-job");

let isSyncing = false;

const FULL_SYNC_CRON = process.env["CARTOLA_FULL_SYNC_CRON"] ?? "0 */6 * * *";
const MARKET_CHECK_CRON = process.env["CARTOLA_MARKET_CHECK_CRON"] ?? "0 */2 * * *";

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
