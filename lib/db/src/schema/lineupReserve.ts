import { pgTable, serial, timestamp, integer, real, boolean, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { playersTable } from "./players";
import { lineupSuggestionTable } from "./lineupSuggestion";

export const lineupReserveTable = pgTable("lineup_reserve", {
  id: serial("id").primaryKey(),
  lineupSuggestionId: integer("lineup_suggestion_id")
    .references(() => lineupSuggestionTable.id)
    .notNull(),
  playerId: integer("player_id")
    .references(() => playersTable.id)
    .notNull(),
  position: text("position").notNull(),
  isLuxuryReserve: boolean("is_luxury_reserve").default(false).notNull(),
  expectedPoints: real("expected_points"),
  floorPoints: real("floor_points"),
  ceilingPoints: real("ceiling_points"),
  price: real("price"),
  orderIndex: integer("order_index").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const lineupSubstitutionTable = pgTable("lineup_substitution", {
  id: serial("id").primaryKey(),
  lineupSuggestionId: integer("lineup_suggestion_id")
    .references(() => lineupSuggestionTable.id)
    .notNull(),
  round: integer("round").notNull(),
  substitutionType: text("substitution_type").notNull(),
  outPlayerId: integer("out_player_id")
    .references(() => playersTable.id)
    .notNull(),
  inPlayerId: integer("in_player_id")
    .references(() => playersTable.id)
    .notNull(),
  position: text("position").notNull(),
  reason: text("reason"),
  pointsRemoved: real("points_removed"),
  pointsAdded: real("points_added"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLineupReserveSchema = createInsertSchema(lineupReserveTable).omit({
  id: true,
  createdAt: true,
});
export type InsertLineupReserve = z.infer<typeof insertLineupReserveSchema>;
export type LineupReserve = typeof lineupReserveTable.$inferSelect;

export const insertLineupSubstitutionSchema = createInsertSchema(lineupSubstitutionTable).omit({
  id: true,
  createdAt: true,
});
export type InsertLineupSubstitution = z.infer<typeof insertLineupSubstitutionSchema>;
export type LineupSubstitution = typeof lineupSubstitutionTable.$inferSelect;
