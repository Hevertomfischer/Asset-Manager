import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clubsTable = pgTable("clubs", {
  id: serial("id").primaryKey(),
  externalSource: text("external_source").notNull(),
  externalId: text("external_id").notNull(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  abbreviation: text("abbreviation"),
  badgeUrl: text("badge_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertClubSchema = createInsertSchema(clubsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClub = z.infer<typeof insertClubSchema>;
export type Club = typeof clubsTable.$inferSelect;
