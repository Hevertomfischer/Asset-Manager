import axios from "axios";
import { lockRoundProjections } from "../repositories/projectionRepository";
import { createLogger } from "../lib/logger";
import { db } from "@workspace/db";
import { eq } from "drizzle-orm";

const log = createLogger("projection-lock");

export async function observeProjectionMarket(
  status: number, round: number, closingTimestamp?: number,
): Promise<boolean> {
  if (!Number.isInteger(round) || round < 1) throw new Error("Rodada inválida no status do mercado.");
  if (status === 1) return true;
  const locked = await lockRoundProjections(round);
  if (locked > 0) {
    const delayMs = closingTimestamp ? Math.max(0, Date.now() - closingTimestamp * 1000) : null;
    log.warn("Projeções congeladas ao detectar mercado fechado; detecção pode ter ocorrido com atraso", {
      round, locked, delayMs,
    });
  }
  return false;
}

// Every entry point (including direct/admin engine calls) fails closed if the
// current market cannot be verified. Never use an old market snapshot to write.
export async function canGenerateProjections(round: number): Promise<boolean> {
  const { data } = await axios.get("https://api.cartola.globo.com/mercado/status", { timeout: 10000 });
  if (!Number.isInteger(data?.status_mercado) || !Number.isInteger(data?.rodada_atual)) {
    throw new Error("Não foi possível verificar o estado atual do mercado.");
  }
  if (data.rodada_atual !== round) return false;
  if (!await observeProjectionMarket(data.status_mercado, round, data.fechamento?.timestamp)) return false;
  const repair = await db.query.adminConfigTable.findFirst({ where: (t) => eq(t.key, "historicalRepair") });
  if (repair && JSON.parse(repair.value).status === "running") {
    log.warn("Projeções adiadas até concluir o reparo de histórico", { round });
    return false;
  }
  return true;
}
