import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clubsTable } from "./clubs";

export const matchesTable = pgTable("matches", {
  id: serial("id").primaryKey(),
  externalSource: text("external_source").notNull(),
  externalId: text("external_id").notNull(),
  round: integer("round").notNull(),
  homeClubId: integer("home_club_id").references(() => clubsTable.id),
  awayClubId: integer("away_club_id").references(() => clubsTable.id),
  matchDate: timestamp("match_date"),
  stadium: text("stadium"),
  status: text("status"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertMatchSchema = createInsertSchema(matchesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matchesTable.$inferSelect;
