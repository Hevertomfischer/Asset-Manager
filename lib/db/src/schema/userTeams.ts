import { pgTable, serial, integer, real, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { playersTable } from "./players";
import { lineupSuggestionTable } from "./lineupSuggestion";

export const userTeamsTable = pgTable("user_teams", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userTeamRoundsTable = pgTable("user_team_rounds", {
  id: serial("id").primaryKey(),
  userTeamId: integer("user_team_id").references(() => userTeamsTable.id).notNull(),
  round: integer("round").notNull(),
  budgetUsed: real("budget_used"),
  captainPlayerId: integer("captain_player_id").references(() => playersTable.id),
  coachPlayerId: integer("coach_player_id").references(() => playersTable.id),
  source: text("source").notNull(),
  lineupSuggestionId: integer("lineup_suggestion_id").references(() => lineupSuggestionTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userTeamRoundPlayersTable = pgTable("user_team_round_players", {
  id: serial("id").primaryKey(),
  userTeamRoundId: integer("user_team_round_id").references(() => userTeamRoundsTable.id).notNull(),
  playerId: integer("player_id").references(() => playersTable.id).notNull(),
  position: text("position"),
  price: real("price"),
});

export const insertUserTeamSchema = createInsertSchema(userTeamsTable).omit({ id: true, createdAt: true });
export type InsertUserTeam = z.infer<typeof insertUserTeamSchema>;
export type UserTeam = typeof userTeamsTable.$inferSelect;

export const insertUserTeamRoundSchema = createInsertSchema(userTeamRoundsTable).omit({ id: true, createdAt: true });
export type InsertUserTeamRound = z.infer<typeof insertUserTeamRoundSchema>;
export type UserTeamRound = typeof userTeamRoundsTable.$inferSelect;

export const insertUserTeamRoundPlayerSchema = createInsertSchema(userTeamRoundPlayersTable).omit({ id: true });
export type InsertUserTeamRoundPlayer = z.infer<typeof insertUserTeamRoundPlayerSchema>;
export type UserTeamRoundPlayer = typeof userTeamRoundPlayersTable.$inferSelect;
