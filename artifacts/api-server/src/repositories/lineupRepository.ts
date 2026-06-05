import { db } from "@workspace/db";
import {
  lineupSuggestionTable,
  lineupSuggestionPlayerTable,
  lineupReserveTable,
  lineupSubstitutionTable,
  type InsertLineupSuggestion,
  type InsertLineupSuggestionPlayer,
  type InsertLineupReserve,
  type InsertLineupSubstitution,
  type LineupSuggestion,
  type LineupSuggestionPlayer,
  type LineupReserve,
  type LineupSubstitution,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export async function insertLineupSuggestion(
  lineup: InsertLineupSuggestion,
  players: Omit<InsertLineupSuggestionPlayer, "lineupSuggestionId">[]
): Promise<LineupSuggestion & { players: LineupSuggestionPlayer[] }> {
  const [inserted] = await db.insert(lineupSuggestionTable).values(lineup).returning();
  const lineupSuggestion = inserted!;

  const playerRows = players.map((p) => ({ ...p, lineupSuggestionId: lineupSuggestion.id }));
  const insertedPlayers = await db.insert(lineupSuggestionPlayerTable).values(playerRows).returning();

  return { ...lineupSuggestion, players: insertedPlayers };
}

export async function insertLineupReserves(
  lineupSuggestionId: number,
  reserves: Omit<InsertLineupReserve, "lineupSuggestionId">[]
): Promise<LineupReserve[]> {
  if (reserves.length === 0) return [];
  const rows = reserves.map((r) => ({ ...r, lineupSuggestionId }));
  return db.insert(lineupReserveTable).values(rows).returning();
}

export async function getLineupReserves(lineupSuggestionId: number): Promise<LineupReserve[]> {
  return db.query.lineupReserveTable.findMany({
    where: (t) => eq(t.lineupSuggestionId, lineupSuggestionId),
    orderBy: (t) => [t.orderIndex],
  });
}

export async function insertLineupSubstitutions(
  subs: InsertLineupSubstitution[]
): Promise<LineupSubstitution[]> {
  if (subs.length === 0) return [];
  return db.insert(lineupSubstitutionTable).values(subs).returning();
}

export async function getLineupSubstitutions(lineupSuggestionId: number): Promise<LineupSubstitution[]> {
  return db.query.lineupSubstitutionTable.findMany({
    where: (t) => eq(t.lineupSuggestionId, lineupSuggestionId),
    orderBy: (t) => [t.createdAt],
  });
}

export async function getLineupSuggestionsByRound(round: number): Promise<LineupSuggestion[]> {
  return db.query.lineupSuggestionTable.findMany({
    where: (t) => eq(t.round, round),
  });
}

export async function getLineupPlayers(lineupId: number): Promise<LineupSuggestionPlayer[]> {
  return db.query.lineupSuggestionPlayerTable.findMany({
    where: (t) => eq(t.lineupSuggestionId, lineupId),
    orderBy: (t) => [t.orderIndex],
  });
}

export async function markLineupSaved(lineupId: number): Promise<LineupSuggestion | null> {
  const [updated] = await db
    .update(lineupSuggestionTable)
    .set({ savedAt: new Date() })
    .where(eq(lineupSuggestionTable.id, lineupId))
    .returning();
  return updated ?? null;
}
