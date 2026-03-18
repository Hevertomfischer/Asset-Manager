import { pgTable, serial, timestamp, integer, text, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const roundSnapshotTable = pgTable("round_snapshot", {
  id: serial("id").primaryKey(),
  round: integer("round").notNull(),
  source: text("source").notNull(),
  payloadJson: jsonb("payload_json").notNull(),
  collectedAt: timestamp("collected_at").defaultNow().notNull(),
  hash: text("hash"),
});

export const insertRoundSnapshotSchema = createInsertSchema(roundSnapshotTable).omit({ id: true, collectedAt: true });
export type InsertRoundSnapshot = z.infer<typeof insertRoundSnapshotSchema>;
export type RoundSnapshot = typeof roundSnapshotTable.$inferSelect;
