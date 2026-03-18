import { db } from "@workspace/db";
import {
  lineupSuggestionTable,
  lineupSuggestionPlayerTable,
  type InsertLineupSuggestion,
  type InsertLineupSuggestionPlayer,
  type LineupSuggestion,
  type LineupSuggestionPlayer,
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
