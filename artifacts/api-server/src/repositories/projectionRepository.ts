import { db } from "@workspace/db";
import { cleanPopularityExplanation } from "../lib/popularityRules";
import {
  playerProjectionTable,
  playerAvailabilityTable,
  playerScoutRoundTable,
  type InsertPlayerProjection,
  type InsertPlayerAvailability,
  type InsertPlayerScoutRound,
  type PlayerProjection,
  type PlayerAvailability,
  type PlayerScoutRound,
} from "@workspace/db/schema";
import { eq, and, desc, max } from "drizzle-orm";

export async function upsertProjection(proj: InsertPlayerProjection): Promise<PlayerProjection> {
  const existing = await db.query.playerProjectionTable.findFirst({
    where: (t) => and(eq(t.playerId, proj.playerId), eq(t.round, proj.round)),
  });

  if (existing) {
    const [updated] = await db
      .update(playerProjectionTable)
      .set({ ...proj, generatedAt: new Date() })
      .where(eq(playerProjectionTable.id, existing.id))
      .returning();
    return updated!;
  }

  const [inserted] = await db.insert(playerProjectionTable).values(proj).returning();
  return inserted!;
}

export async function getProjectionsByRound(round: number): Promise<PlayerProjection[]> {
  const projections = await db.query.playerProjectionTable.findMany({
    where: (t) => eq(t.round, round),
    orderBy: (t) => [desc(t.recommendationScore)],
  });
  return projections.map((p) => ({ ...p, explanationJson: cleanPopularityExplanation(p.explanationJson) }));
}

export async function getLatestProjectionRound(): Promise<number | null> {
  const result = await db
    .select({ maxRound: max(playerProjectionTable.round) })
    .from(playerProjectionTable);
  return result[0]?.maxRound ?? null;
}

export async function upsertAvailability(avail: InsertPlayerAvailability): Promise<PlayerAvailability> {
  const existing = await db.query.playerAvailabilityTable.findFirst({
    where: (t) => and(eq(t.playerId, avail.playerId), eq(t.round, avail.round)),
  });

  if (existing) {
    const [updated] = await db
      .update(playerAvailabilityTable)
      .set({ ...avail, collectedAt: new Date() })
      .where(eq(playerAvailabilityTable.id, existing.id))
      .returning();
    return updated!;
  }

  const [inserted] = await db.insert(playerAvailabilityTable).values(avail).returning();
  return inserted!;
}

export async function getAvailabilityByRound(round: number): Promise<PlayerAvailability[]> {
  return db.query.playerAvailabilityTable.findMany({
    where: (t) => eq(t.round, round),
  });
}

export async function insertScoutRound(scout: InsertPlayerScoutRound): Promise<PlayerScoutRound> {
  const [inserted] = await db.insert(playerScoutRoundTable).values(scout).returning();
  return inserted!;
}

export async function getScoutsByPlayer(playerId: number, limit = 10): Promise<PlayerScoutRound[]> {
  return db.query.playerScoutRoundTable.findMany({
    where: (t) => eq(t.playerId, playerId),
    orderBy: (t) => [desc(t.round)],
    limit,
  });
}

export async function getScoutsByRound(round: number): Promise<PlayerScoutRound[]> {
  return db.query.playerScoutRoundTable.findMany({
    where: (t) => eq(t.round, round),
  });
}
