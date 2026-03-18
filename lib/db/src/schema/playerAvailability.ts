import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { playersTable } from "./players";

export const playerAvailabilityTable = pgTable("player_availability", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").references(() => playersTable.id).notNull(),
  round: integer("round").notNull(),
  source: text("source").notNull(),
  probableStatus: text("probable_status"),
  playProbability: real("play_probability"),
  expectedMinutes: real("expected_minutes"),
  riskScore: real("risk_score"),
  injuryStatus: text("injury_status"),
  suspensionStatus: text("suspension_status"),
  note: text("note"),
  collectedAt: timestamp("collected_at").defaultNow().notNull(),
});

export const insertPlayerAvailabilitySchema = createInsertSchema(playerAvailabilityTable).omit({ id: true, collectedAt: true });
export type InsertPlayerAvailability = z.infer<typeof insertPlayerAvailabilitySchema>;
export type PlayerAvailability = typeof playerAvailabilityTable.$inferSelect;
