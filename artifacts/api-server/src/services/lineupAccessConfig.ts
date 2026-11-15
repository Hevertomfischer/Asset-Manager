import { z } from "zod";
import { db } from "@workspace/db";
import { adminConfigTable } from "@workspace/db/schema";
import { inArray } from "drizzle-orm";

export const lineupAccessConfigSchema = z.object({
  freeLineupsPerRound: z.number().int().min(0).max(1000),
  anonymousLineupMode: z.enum(["login_required", "allowed"]),
});
export const lineupAccessPatchSchema = lineupAccessConfigSchema.partial();

export async function getLineupAccessConfig() {
  const rows = await db.select().from(adminConfigTable)
    .where(inArray(adminConfigTable.key, ["freeLineupsPerRound", "anonymousLineupMode"]));
  const values: Record<string, unknown> = {};
  for (const row of rows) {
    values[row.key] = row.key === "freeLineupsPerRound" ? Number(row.value) : row.value;
  }
  // Missing keys use documented defaults; invalid stored policy fails closed.
  return lineupAccessConfigSchema.parse({ freeLineupsPerRound: 1, anonymousLineupMode: "login_required", ...values });
}
