import { db } from "@workspace/db";
import { playersTable, type InsertPlayer, type Player } from "@workspace/db/schema";
import { eq, and, gte, lte, SQL, sql } from "drizzle-orm";

export async function upsertPlayer(player: InsertPlayer): Promise<Player> {
  const existing = await db.query.playersTable.findFirst({
    where: (t) => and(eq(t.externalSource, player.externalSource), eq(t.externalId, player.externalId)),
  });

  if (existing) {
    const [updated] = await db
      .update(playersTable)
      .set({ ...player, updatedAt: new Date() })
      .where(eq(playersTable.id, existing.id))
      .returning();
    return updated!;
  }

  const [inserted] = await db.insert(playersTable).values(player).returning();
  return inserted!;
}

export async function findPlayerByExternalId(externalSource: string, externalId: string): Promise<Player | null> {
  const found = await db.query.playersTable.findFirst({
    where: (t) => and(eq(t.externalSource, externalSource), eq(t.externalId, externalId)),
  });
  return found ?? null;
}

export interface PlayerFilter {
  position?: string;
  clubId?: number;
  minPrice?: number;
  maxPrice?: number;
}

export async function getPlayers(filter: PlayerFilter = {}): Promise<Player[]> {
  const conditions: SQL[] = [];

  if (filter.position) conditions.push(eq(playersTable.position, filter.position));
  if (filter.clubId) conditions.push(eq(playersTable.clubId, filter.clubId));
  if (filter.minPrice != null) conditions.push(gte(playersTable.price, filter.minPrice));
  if (filter.maxPrice != null) conditions.push(lte(playersTable.price, filter.maxPrice));

  if (conditions.length === 0) {
    return db.query.playersTable.findMany();
  }

  return db.select().from(playersTable).where(and(...conditions));
}

export async function getPlayerById(id: number): Promise<Player | null> {
  const found = await db.query.playersTable.findFirst({
    where: (t) => eq(t.id, id),
  });
  return found ?? null;
}

export async function countPlayers(): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)` }).from(playersTable);
  return Number(result[0]?.count ?? 0);
}
