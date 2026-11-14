import axios from "axios";
import { db, pool } from "@workspace/db";
import { adminConfigTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { syncHistoricalRound } from "../etl/etlPipeline";
import { calibrateProjectionWeights } from "./projectionCalibrationService";
import { createLogger } from "../lib/logger";

const log = createLogger("historical-repair");
const KEY = "historicalRepair";
let running = false;
export const isHistoricalRepairRunning = () => running;
export interface RepairProgress {
  status: "running" | "completed" | "failed";
  startedAt: string;
  finishedAt?: string;
  lastClosedRound: number;
  completedRounds: number;
  upserted: number;
  missingPlayers: number;
  error?: string;
  calibration?: unknown;
}
export async function getHistoricalRepairProgress(): Promise<RepairProgress | null> {
  const row = await db.query.adminConfigTable.findFirst({ where: (t) => eq(t.key, KEY) });
  let progress: RepairProgress | null = row ? JSON.parse(row.value) : null;
  if (progress?.status !== "running" || running) return progress;
  // A session-scoped lease distinguishes another live worker from a crashed
  // process, so a restart cannot leave the admin button disabled forever.
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT pg_try_advisory_lock(73503, 1) AS acquired");
    if (rows[0]?.acquired) {
      try {
        const latest = await db.query.adminConfigTable.findFirst({ where: (t) => eq(t.key, KEY) });
        progress = latest ? JSON.parse(latest.value) : null;
        if (progress?.status === "running") {
          progress.status = "failed";
          progress.error = "O processo foi interrompido. Repita o reparo para concluir todas as rodadas.";
          progress.finishedAt = new Date().toISOString();
          await save(progress);
        }
      } finally { await client.query("SELECT pg_advisory_unlock(73503, 1)"); }
    }
  } finally { client.release(); }
  return progress;
}
async function save(progress: RepairProgress) {
  await db.insert(adminConfigTable).values({ key: KEY, value: JSON.stringify(progress) })
    .onConflictDoUpdate({ target: adminConfigTable.key, set: { value: JSON.stringify(progress), updatedAt: new Date() } });
}
export async function consolidateScoutDuplicates() {
  // DML only, invoked explicitly after official repair, never on startup.
  const result = await db.execute(sql`
    WITH ranked AS (
      SELECT id, row_number() OVER (
        PARTITION BY player_id, round
        ORDER BY CASE source WHEN 'historical_cartola' THEN 0
                             WHEN 'cartola_api' THEN 2 ELSE 1 END,
                 collected_at DESC, id DESC
      ) AS n FROM player_scout_round
    )
    DELETE FROM player_scout_round WHERE id IN (SELECT id FROM ranked WHERE n > 1)
  `);
  log.info("Duplicatas de scouts consolidadas", { removed: result.rowCount });
}
export async function startHistoricalRepair(): Promise<RepairProgress> {
  if (running) throw new Error("A ressincronização já está em andamento.");
  running = true;
  let releaseLease: (() => Promise<void>) | undefined;
  try {
    const client = await pool.connect();
    releaseLease = async () => {
      try { await client.query("SELECT pg_advisory_unlock(73503, 1)"); }
      finally { client.release(); }
    };
    const { rows } = await client.query("SELECT pg_try_advisory_lock(73503, 1) AS acquired");
    if (!rows[0]?.acquired) throw new Error("Há outro processo reparando o histórico. Aguarde.");
    const { data } = await axios.get("https://api.cartola.globo.com/mercado/status", { timeout: 10000 });
    if (!Number.isInteger(data?.rodada_atual) || data.rodada_atual < 2) {
      throw new Error("Não foi possível determinar as rodadas encerradas.");
    }
    const progress: RepairProgress = {
      status: "running", startedAt: new Date().toISOString(), lastClosedRound: data.rodada_atual - 1,
      completedRounds: 0, upserted: 0, missingPlayers: 0,
    };
    await save(progress);
    void (async () => {
      try {
        for (let round = 1; round <= progress.lastClosedRound; round++) {
          const result = await syncHistoricalRound(round, { force: true });
          progress.completedRounds = round;
          progress.upserted += result.upserted;
          progress.missingPlayers += result.missingPlayers;
          await save(progress);
        }
        await consolidateScoutDuplicates();
        progress.calibration = await calibrateProjectionWeights();
        progress.status = "completed";
        log.info("Todas as rodadas encerradas ressincronizadas e pesos calibrados", { rounds: progress.completedRounds });
      } catch (e) {
        progress.status = "failed";
        progress.error = e instanceof Error ? e.message : String(e);
        log.error("Reparo interrompido; pode ser repetido com segurança", { round: progress.completedRounds + 1, error: progress.error });
      } finally {
        progress.finishedAt = new Date().toISOString();
        await save(progress).catch((e) => log.error("Falha ao persistir resultado do reparo", { error: String(e) }));
        running = false;
        await releaseLease?.().catch((e) => log.error("Falha ao liberar trava de reparo", { error: String(e) }));
      }
    })();
    return { ...progress };
  } catch (e) {
    running = false;
    await releaseLease?.();
    throw e;
  }
}
