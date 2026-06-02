import { db } from "@workspace/db";
import { subscriptionsTable } from "@workspace/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("access-service");

export type Plan = "free" | "pro";

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

export async function isPro(userId: number): Promise<boolean> {
  return (await getUserPlan(userId)) === "pro";
}
