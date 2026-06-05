import { pgTable, serial, timestamp, integer, real, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { playersTable } from "./players";
import { usersTable } from "./users";

export const lineupSuggestionTable = pgTable("lineup_suggestion", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  round: integer("round").notNull(),
  strategyType: text("strategy_type").notNull(),
  formation: text("formation").notNull(),
  budgetLimit: real("budget_limit"),
  totalCost: real("total_cost"),
  expectedPoints: real("expected_points"),
  riskScore: real("risk_score"),
  captainPlayerId: integer("captain_player_id").references(() => playersTable.id),
  coachPlayerId: integer("coach_player_id").references(() => playersTable.id),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  savedAt: timestamp("saved_at"),
});

export const lineupSuggestionPlayerTable = pgTable("lineup_suggestion_player", {
  id: serial("id").primaryKey(),
  lineupSuggestionId: integer("lineup_suggestion_id").references(() => lineupSuggestionTable.id).notNull(),
  playerId: integer("player_id").references(() => playersTable.id).notNull(),
  slot: text("slot"),
  position: text("position"),
  orderIndex: integer("order_index"),
  projectedPoints: real("projected_points"),
  price: real("price"),
});

export const insertLineupSuggestionSchema = createInsertSchema(lineupSuggestionTable).omit({ id: true, generatedAt: true });
export type InsertLineupSuggestion = z.infer<typeof insertLineupSuggestionSchema>;
export type LineupSuggestion = typeof lineupSuggestionTable.$inferSelect;

export const insertLineupSuggestionPlayerSchema = createInsertSchema(lineupSuggestionPlayerTable).omit({ id: true });
export type InsertLineupSuggestionPlayer = z.infer<typeof insertLineupSuggestionPlayerSchema>;
export type LineupSuggestionPlayer = typeof lineupSuggestionPlayerTable.$inferSelect;
