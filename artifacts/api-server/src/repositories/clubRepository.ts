import { db } from "@workspace/db";
import { clubsTable, type InsertClub, type Club } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";

export async function upsertClub(club: InsertClub): Promise<Club> {
  const existing = await db.query.clubsTable.findFirst({
    where: (t) => and(eq(t.externalSource, club.externalSource), eq(t.externalId, club.externalId)),
  });

  if (existing) {
    const [updated] = await db
      .update(clubsTable)
      .set({ ...club, updatedAt: new Date() })
      .where(eq(clubsTable.id, existing.id))
      .returning();
    return updated!;
  }

  const [inserted] = await db.insert(clubsTable).values(club).returning();
  return inserted!;
}

export async function findClubByExternalId(externalSource: string, externalId: string): Promise<Club | null> {
  const found = await db.query.clubsTable.findFirst({
    where: (t) => and(eq(t.externalSource, externalSource), eq(t.externalId, externalId)),
  });
  return found ?? null;
}

export async function getAllClubs(): Promise<Club[]> {
  return db.query.clubsTable.findMany();
}
