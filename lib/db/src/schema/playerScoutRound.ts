import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { playersTable } from "./players";

export const playerScoutRoundTable = pgTable("player_scout_round", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").references(() => playersTable.id).notNull(),
  round: integer("round").notNull(),
  source: text("source").notNull(),
  points: real("points"),
  minutesPlayed: integer("minutes_played"),
  goals: integer("goals"),
  assists: integer("assists"),
  shots: integer("shots"),
  shotsOnTarget: integer("shots_on_target"),
  tackles: integer("tackles"),
  interceptions: integer("interceptions"),
  foulsSuffered: integer("fouls_suffered"),
  foulsCommitted: integer("fouls_committed"),
  saves: integer("saves"),
  goalsConceded: integer("goals_conceded"),
  cleanSheet: integer("clean_sheet"),
  yellowCards: integer("yellow_cards"),
  redCards: integer("red_cards"),
  penaltyMissed: integer("penalty_missed"),
  penaltySaved: integer("penalty_saved"),
  ownGoals: integer("own_goals"),
  collectedAt: timestamp("collected_at").defaultNow().notNull(),
});

export const insertPlayerScoutRoundSchema = createInsertSchema(playerScoutRoundTable).omit({ id: true, collectedAt: true });
export type InsertPlayerScoutRound = z.infer<typeof insertPlayerScoutRoundSchema>;
export type PlayerScoutRound = typeof playerScoutRoundTable.$inferSelect;
