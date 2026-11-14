import { pgTable, serial, timestamp, integer, real, text, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { playersTable } from "./players";

export const playerProjectionTable = pgTable("player_projection", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").references(() => playersTable.id).notNull(),
  round: integer("round").notNull(),
  expectedPoints: real("expected_points"),
  floorPoints: real("floor_points"),
  ceilingPoints: real("ceiling_points"),
  riskScore: real("risk_score"),
  playProbability: real("play_probability"),
  expectedMinutes: real("expected_minutes"),
  matchupScore: real("matchup_score"),
  formScore: real("form_score"),
  valueScore: real("value_score"),
  cleanSheetProbability: real("clean_sheet_probability"),
  attackParticipationProbability: real("attack_participation_probability"),
  recommendationScore: real("recommendation_score"),
  strategyType: text("strategy_type"),
  explanationJson: jsonb("explanation_json"),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  lockedAt: timestamp("locked_at"),
});

export const insertPlayerProjectionSchema = createInsertSchema(playerProjectionTable).omit({ id: true, generatedAt: true });
export type InsertPlayerProjection = z.infer<typeof insertPlayerProjectionSchema>;
export type PlayerProjection = typeof playerProjectionTable.$inferSelect;
