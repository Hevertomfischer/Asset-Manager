import { db } from "@workspace/db";
import { matchesTable, type InsertMatch, type Match } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

export async function upsertMatch(match: InsertMatch): Promise<Match> {
  const existing = await db.query.matchesTable.findFirst({
    where: (t) => and(eq(t.externalSource, match.externalSource), eq(t.externalId, match.externalId)),
  });

  if (existing) {
    const [updated] = await db
      .update(matchesTable)
      .set({ ...match, updatedAt: new Date() })
      .where(eq(matchesTable.id, existing.id))
      .returning();
    return updated!;
  }

  const [inserted] = await db.insert(matchesTable).values(match).returning();
  return inserted!;
}

export async function getMatchesByRound(round: number): Promise<Match[]> {
  return db.query.matchesTable.findMany({
    where: (t) => eq(t.round, round),
  });
}
