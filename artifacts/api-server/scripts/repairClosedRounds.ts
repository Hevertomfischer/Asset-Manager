/**
 * DEVELOPMENT ONLY: official re-fetch, consolidation, calibration and sample
 * verification. Production must use the authenticated admin API after Publish.
 * Never applies schema migrations or targets another database connection.
 */
import { setTimeout as sleep } from "node:timers/promises";
import axios from "axios";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import { startHistoricalRepair, getHistoricalRepairProgress } from "../src/services/historicalRepairService";
import { createLogger } from "../src/lib/logger";

const log = createLogger("repair-development");
async function main() {
  if (process.env.REPLIT_DEPLOYMENT || process.env.NODE_ENV === "production") {
    throw new Error("Use a API administrativa autenticada para reparar produção.");
  }
  await startHistoricalRepair();
  let progress = await getHistoricalRepairProgress();
  while (progress?.status === "running") {
    await sleep(2000);
    progress = await getHistoricalRepairProgress();
  }
  if (progress?.status !== "completed") throw new Error(progress?.error ?? "Reparo não concluído.");
  let compared = 0, divergences = 0;
  for (let round = Math.max(1, progress.lastClosedRound - 4); round <= progress.lastClosedRound; round++) {
    const { data } = await axios.get(`https://api.cartola.globo.com/atletas/pontuados/${round}`, { timeout: 15000 });
    const sample = await db.execute<{ external_id: string; points: number }>(sql`
      SELECT p.external_id, s.points FROM player_scout_round s
      JOIN players p ON p.id = s.player_id
      WHERE s.round = ${round} AND s.source = 'historical_cartola' AND s.points IS NOT NULL
      ORDER BY random() LIMIT 30
    `);
    if (!sample.rows.length) throw new Error(`Sem amostra final para a rodada ${round}.`);
    let mismatches = 0;
    for (const row of sample.rows) {
      const official = data?.atletas?.[row.external_id]?.pontuacao;
      if (typeof official !== "number" || Math.round(official * 100) !== Math.round(row.points * 100)) mismatches++;
    }
    compared += sample.rows.length; divergences += mismatches;
    log.info("Amostra comparada diretamente com a fonte oficial", { round, sampled: sample.rows.length, mismatches });
  }
  log.info("Resultado do reparo de desenvolvimento", { ...progress, compared, divergences });
  if (divergences) throw new Error("A amostra ainda contém divergências com a fonte oficial.");
}
main().catch((e) => { log.error("Reparo falhou", { error: String(e) }); process.exitCode = 1; })
  .finally(() => pool.end());
