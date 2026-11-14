import { db } from "@workspace/db";
import { cleanPopularityExplanation } from "../lib/popularityRules";
import { getPopularityFeatureStatus } from "../services/popularityFeatureService";
import {
  playerProjectionTable,
  playerAvailabilityTable,
  playerScoutRoundTable,
  adminConfigTable,
  type InsertPlayerProjection,
  type InsertPlayerAvailability,
  type InsertPlayerScoutRound,
  type PlayerProjection,
  type PlayerAvailability,
  type PlayerScoutRound,
} from "@workspace/db/schema";
import { eq, and, desc, max, sql, isNull, lt, ne } from "drizzle-orm";

export async function upsertProjection(proj: InsertPlayerProjection): Promise<PlayerProjection | null> {
  return db.transaction(async (tx) => {
  // Same transaction-scoped fence as lockRoundProjections: a concurrent close
  // cannot be followed by a stale writer or an insertion for a new player.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(73501, ${proj.round})`);
  const existing = await tx.query.playerProjectionTable.findFirst({
    where: (t) => and(eq(t.playerId, proj.playerId), eq(t.round, proj.round)),
  });

  const fence = await tx.query.adminConfigTable.findFirst({
    where: (t) => eq(t.key, `projectionLockedRound:${proj.round}`),
  });
  if (existing?.lockedAt || fence) return existing ?? null;
  const { lockedAt: _ignored, ...values } = proj;
  if (existing) {
    const [updated] = await tx
      .update(playerProjectionTable)
      .set({ ...values, generatedAt: new Date() })
      .where(and(eq(playerProjectionTable.id, existing.id), isNull(playerProjectionTable.lockedAt)))
      .returning();
    return updated!;
  }

  const [inserted] = await tx.insert(playerProjectionTable).values(values).returning();
  return inserted!;
  });
}

export async function lockRoundProjections(round: number): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(73501, ${round})`);
    const lockedAt = new Date();
    await tx.insert(adminConfigTable).values({
      key: `projectionLockedRound:${round}`, value: lockedAt.toISOString(),
    }).onConflictDoNothing();
    const rows = await tx.update(playerProjectionTable).set({ lockedAt })
      .where(and(eq(playerProjectionTable.round, round), isNull(playerProjectionTable.lockedAt)))
      .returning({ id: playerProjectionTable.id });
    return rows.length;
  });
}

export async function getProjectionsByRound(round: number): Promise<PlayerProjection[]> {
  const { popularityFeaturesEnabled } = await getPopularityFeatureStatus();
  const projections = await db.query.playerProjectionTable.findMany({
    where: (t) => eq(t.round, round),
    orderBy: (t) => [desc(t.recommendationScore)],
  });
  return projections.map((p) => ({ ...p, explanationJson: cleanPopularityExplanation(p.explanationJson, popularityFeaturesEnabled) }));
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
  // Works during the two-stage rollout, before the global unique index exists.
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${scout.playerId}, ${scout.round})`);
    const existing = await tx.query.playerScoutRoundTable.findFirst({
      where: (t) => and(eq(t.playerId, scout.playerId), eq(t.round, scout.round)),
      orderBy: (t) => [sql`CASE WHEN ${t.source} = 'historical_cartola' THEN 0 ELSE 1 END`, desc(t.collectedAt), desc(t.id)],
    });
    if (!existing) {
      const [inserted] = await tx.insert(playerScoutRoundTable).values(scout).returning();
      return inserted!;
    }
    // CSV import must never replace canonical official final scores.
    if (existing.source === "historical_cartola" && scout.source !== "historical_cartola") return existing;
    // Consolidate first: older databases also have a unique (player,round,source)
    // constraint. Changing a live row's source before merging would violate it.
    await tx.delete(playerScoutRoundTable).where(and(
      eq(playerScoutRoundTable.playerId, scout.playerId), eq(playerScoutRoundTable.round, scout.round),
      ne(playerScoutRoundTable.id, existing.id),
    ));
    const [updated] = await tx.update(playerScoutRoundTable)
      .set({ ...scout, collectedAt: new Date() }).where(eq(playerScoutRoundTable.id, existing.id)).returning();
    return updated!;
  });
}

export async function getScoutsByPlayer(playerId: number, limit = 10, beforeRound?: number): Promise<PlayerScoutRound[]> {
  return db.query.playerScoutRoundTable.findMany({
    where: (t) => and(eq(t.playerId, playerId), ne(t.source, "cartola_api"),
      beforeRound === undefined ? undefined : lt(t.round, beforeRound)),
    orderBy: (t) => [desc(t.round)],
    limit,
  });
}

export async function getScoutsByRound(round: number): Promise<PlayerScoutRound[]> {
  return db.query.playerScoutRoundTable.findMany({
    where: (t) => eq(t.round, round),
  });
}
