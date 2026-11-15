import { db } from "@workspace/db";
import { subscriptionsTable } from "@workspace/db/schema";
import { and, desc, eq, gt } from "drizzle-orm";
import { FOUNDER_ACCESS_CUTOFF } from "../accessService";
import { getPlanConfig, type BillingPlan, type PlanConfig } from "./planConfig";

export class ExpiredSeasonError extends Error {
  constructor() {
    super("Este passe de temporada já encerrou. Aguarde a atualização da temporada ou escolha o Pro Mensal.");
  }
}

export function calculatePeriodEnd(
  plan: BillingPlan,
  config: PlanConfig,
  currentPeriodEnd: Date | null,
  now = new Date(),
): Date {
  const start = calculatePeriodStart(currentPeriodEnd, now).getTime();
  if (plan === "pro_monthly") return new Date(start + 30 * 24 * 60 * 60 * 1000);
  const seasonEnd = new Date(config.seasonPassEndsAt).getTime();
  if (seasonEnd <= now.getTime()) throw new ExpiredSeasonError();
  // Uma compra não remove dias de campanha nem dias já adquiridos.
  return new Date(Math.max(start, seasonEnd));
}

export function calculatePeriodStart(currentPeriodEnd: Date | null, now = new Date()): Date {
  return new Date(Math.max(now.getTime(), FOUNDER_ACCESS_CUTOFF.getTime(), currentPeriodEnd?.getTime() ?? 0));
}

export async function computeBillingPeriod(
  plan: BillingPlan,
  userId: number,
  config?: PlanConfig,
  connection: Pick<typeof db, "select"> = db,
): Promise<{ start: Date; end: Date }> {
  const now = new Date();
  const [active] = await connection.select({ currentPeriodEnd: subscriptionsTable.currentPeriodEnd })
    .from(subscriptionsTable)
    .where(and(
      eq(subscriptionsTable.userId, userId),
      eq(subscriptionsTable.plan, "pro"),
      eq(subscriptionsTable.status, "active"),
      gt(subscriptionsTable.currentPeriodEnd, now),
    ))
    .orderBy(desc(subscriptionsTable.currentPeriodEnd)).limit(1);
  const previousEnd = active?.currentPeriodEnd ?? null;
  return {
    start: calculatePeriodStart(previousEnd, now),
    end: calculatePeriodEnd(plan, config ?? await getPlanConfig(now), previousEnd, now),
  };
}

export async function computePeriodEnd(plan: BillingPlan, userId: number, config?: PlanConfig): Promise<Date> {
  return (await computeBillingPeriod(plan, userId, config)).end;
}
