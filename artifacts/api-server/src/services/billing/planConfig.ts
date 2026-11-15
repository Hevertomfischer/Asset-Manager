import { z } from "zod";
import { db } from "@workspace/db";
import { adminConfigTable } from "@workspace/db/schema";
import { inArray } from "drizzle-orm";
import { FOUNDER_ACCESS_CUTOFF } from "../accessService";

const price = z.number().finite().positive().max(100_000).refine(
  (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7,
  "Use no máximo duas casas decimais",
);

export const planConfigSchema = z.object({
  seasonPassYear: z.number().int().min(2020).max(2100),
  seasonPassEndsAt: z.string().datetime({ offset: true }),
  proMonthlyPrice: price,
  seasonPassPrice: price,
  founderSeasonPassPrice: price.nullable().optional(),
}).strict();
export const planConfigPatchSchema = planConfigSchema.partial();
export type PlanConfig = z.infer<typeof planConfigSchema>;
export type BillingPlan = "pro_monthly" | "season_pass";
export const planConfigKeys = Object.keys(planConfigSchema.shape);

/** São Paulo (UTC−03): 31/12 às 23:59, independentemente do fuso do servidor. */
export function defaultSeasonEnd(year: number): string {
  return new Date(`${year}-12-31T23:59:00-03:00`).toISOString();
}

export function resolvePlanConfig(values: Record<string, unknown>, now = new Date()): PlanConfig {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "numeric",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")!.value);
  const month = Number(parts.find((part) => part.type === "month")!.value);
  const seasonPassYear = values.seasonPassYear ?? year + (month >= 11 ? 1 : 0);
  return planConfigSchema.parse({
    proMonthlyPrice: 19.9,
    seasonPassPrice: 99.9,
    ...values,
    seasonPassYear,
    seasonPassEndsAt: values.seasonPassEndsAt ?? defaultSeasonEnd(Number(seasonPassYear)),
  });
}

export async function getPlanConfig(now = new Date()): Promise<PlanConfig> {
  const rows = await db.select().from(adminConfigTable)
    .where(inArray(adminConfigTable.key, planConfigKeys));
  const values: Record<string, unknown> = {};
  for (const row of rows) {
    values[row.key] = row.key === "seasonPassEndsAt" ? row.value : JSON.parse(row.value);
  }
  return resolvePlanConfig(values, now);
}

export function seasonPrice(config: PlanConfig, now = new Date()): number {
  return now < FOUNDER_ACCESS_CUTOFF && config.founderSeasonPassPrice != null
    ? config.founderSeasonPassPrice : config.seasonPassPrice;
}

export function publicPlanConfig(config: PlanConfig, now = new Date()) {
  return {
    ...config,
    regularSeasonPassPrice: config.seasonPassPrice,
    seasonPassPrice: seasonPrice(config, now),
    founderSeasonPassPrice: now < FOUNDER_ACCESS_CUTOFF ? config.founderSeasonPassPrice ?? null : null,
    founderCutoff: FOUNDER_ACCESS_CUTOFF.toISOString(),
  };
}
