import { pgTable, text, serial, timestamp, integer, real, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clubsTable } from "./clubs";

export const playersTable = pgTable("players", {
  id: serial("id").primaryKey(),
  externalSource: text("external_source").notNull(),
  externalId: text("external_id").notNull(),
  clubId: integer("club_id").references(() => clubsTable.id),
  name: text("name").notNull(),
  nickname: text("nickname"),
  position: text("position").notNull(),
  status: text("status"),
  price: real("price"),
  averagePoints: real("average_points"),
  popularity: real("popularity"),
  priceVariation: real("price_variation"),
  playedLastRound: boolean("played_last_round"),
  gamesPlayed: integer("games_played"),
  minimoParaValorizar: real("minimo_para_valorizar"),
  cumulativeScouts: jsonb("cumulative_scouts").$type<Record<string, number>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPlayerSchema = createInsertSchema(playersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;
