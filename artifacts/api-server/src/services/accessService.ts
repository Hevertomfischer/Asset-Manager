import { db } from "@workspace/db";
import { subscriptionsTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("access-service");

export type Plan = "free" | "pro";

/**
 * Data de corte da campanha Founder Access.
 *
 * Enquanto new Date() < FOUNDER_ACCESS_CUTOFF, isPro() retorna true para
 * qualquer usuário autenticado — sem consultar assinaturas.
 *
 * Para ajustar via variável de ambiente:
 *   FOUNDER_ACCESS_CUTOFF_DATE=2026-09-30T23:59:59Z
 *
 * REGRA: antes de alterar a data de fallback abaixo, registre aqui:
 *   Histórico de mudanças:
 *   (nenhuma alteração registrada — valor original de produção)
 */
export const FOUNDER_ACCESS_CUTOFF: Date = process.env["FOUNDER_ACCESS_CUTOFF_DATE"]
  ? new Date(process.env["FOUNDER_ACCESS_CUTOFF_DATE"])
  : new Date("2026-09-30T23:59:59Z");

/**
 * Retorna o plano REAL do usuário (free | pro), consultando subscriptionsTable.
 * Não é afetado pela campanha Founder Access — use para exibir "seu plano atual".
 */
export async function getUserPlan(userId: number): Promise<Plan> {
  try {
    const now = new Date();
    const [sub] = await db
      .select({ id: subscriptionsTable.id, plan: subscriptionsTable.plan })
      .from(subscriptionsTable)
      .where(
        and(
          eq(subscriptionsTable.userId, userId),
          eq(subscriptionsTable.status, "active"),
          gt(subscriptionsTable.currentPeriodEnd, now)
        )
      )
      .limit(1);

    if (sub && sub.plan === "pro") return "pro";
    return "free";
  } catch (err) {
    log.error("Erro ao consultar plano do usuário", { userId, error: err instanceof Error ? err.message : String(err) });
    return "free";
  }
}

/**
 * Retorna true se o usuário tem acesso a funcionalidades Pro.
 *
 * Durante a campanha Founder Access (new Date() < FOUNDER_ACCESS_CUTOFF),
 * retorna true para qualquer userId autenticado, sem consultar assinaturas.
 * Após a data de corte, consulta o plano real via getUserPlan().
 *
 * Use esta função para gating de features. Para exibir "seu plano atual"
 * na UI, use getUserPlan() diretamente.
 */
export async function isPro(userId: number): Promise<boolean> {
  const now = new Date();
  if (now < FOUNDER_ACCESS_CUTOFF) {
    log.debug("Founder Access: acesso Pro liberado por campanha", {
      userId,
      cutoff: FOUNDER_ACCESS_CUTOFF.toISOString(),
    });
    return true;
  }
  return (await getUserPlan(userId)) === "pro";
}
