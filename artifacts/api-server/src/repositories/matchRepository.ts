import { db } from "@workspace/db";
import { matchesTable, type InsertMatch, type Match } from "@workspace/db/schema";
import { eq, and, lt, or } from "drizzle-orm";

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

export interface ClubStrength {
  avgGoalsScored: number;
  avgGoalsConceded: number;
  offensiveStrength: number;
  defensiveStrength: number;
  matchesAnalyzed: number;
}

/**
 * Compute a club's attack/defense strength from real match results stored in the DB.
 * Looks at all historical rounds before `currentRound` where goals were recorded.
 * Falls back to neutral (0.5/0.5) if no data is available.
 */
export async function getClubStrengthFromMatches(
  clubId: number,
  currentRound: number,
  maxRounds = 10
): Promise<ClubStrength> {
  const historicalMatches = await db.query.matchesTable.findMany({
    where: (t) =>
      and(
        lt(t.round, currentRound),
        or(eq(t.homeClubId, clubId), eq(t.awayClubId, clubId))
      ),
    orderBy: (t, { desc }) => [desc(t.round)],
    limit: maxRounds,
  });

  const completedMatches = historicalMatches.filter(
    (m) => m.homeScore !== null && m.awayScore !== null
  );

  if (completedMatches.length === 0) {
    return { avgGoalsScored: 0, avgGoalsConceded: 0, offensiveStrength: 0.5, defensiveStrength: 0.5, matchesAnalyzed: 0 };
  }

  let totalGoalsScored = 0;
  let totalGoalsConceded = 0;

  for (const m of completedMatches) {
    if (m.homeClubId === clubId) {
      totalGoalsScored += m.homeScore ?? 0;
      totalGoalsConceded += m.awayScore ?? 0;
    } else {
      totalGoalsScored += m.awayScore ?? 0;
      totalGoalsConceded += m.homeScore ?? 0;
    }
  }

  const n = completedMatches.length;
  const avgGoalsScored = totalGoalsScored / n;
  const avgGoalsConceded = totalGoalsConceded / n;

  const offensiveStrength = Math.min(1, avgGoalsScored / 2.5);
  const defensiveStrength = Math.max(0, 1 - avgGoalsConceded / 2.5);

  return { avgGoalsScored, avgGoalsConceded, offensiveStrength, defensiveStrength, matchesAnalyzed: n };
}
