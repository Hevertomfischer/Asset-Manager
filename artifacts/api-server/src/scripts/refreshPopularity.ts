import { db, pool } from "@workspace/db";
import { playersTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { fetchMarket } from "../providers/cartolaApiProvider";
import { runProjectionEngine } from "../engines/projectionEngine";
import { createLogger } from "../lib/logger";

const log = createLogger("refresh-popularity");
async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Execute a atualização operacional pela API administrativa publicada.");
  const market = await fetchMarket();
  let updated = 0;
  for (const player of market.players) {
    const rows = await db.update(playersTable).set({
      popularity: player.popularity,
      popularityCount: player.popularityCount,
      popularityListed: player.popularityListed,
      updatedAt: new Date(),
    }).where(and(eq(playersTable.externalSource, player.externalSource), eq(playersTable.externalId, player.externalId)))
      .returning({ id: playersTable.id });
    updated += rows.length;
  }
  log.info("Popularidade normalizada", { round: market.round.roundNumber, updated });
  await runProjectionEngine(market.round.roundNumber);
  log.info("Recálculo concluído", { round: market.round.roundNumber });
}
main().catch((err) => {
  log.error("Falha na atualização", { error: err instanceof Error ? err.message : String(err) });
  process.exitCode = 1;
}).finally(() => pool.end());
