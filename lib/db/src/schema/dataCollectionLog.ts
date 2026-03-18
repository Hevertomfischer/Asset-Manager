import { pgTable, serial, timestamp, text, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dataCollectionLogTable = pgTable("data_collection_log", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  entityType: text("entity_type").notNull(),
  status: text("status").notNull(),
  message: text("message"),
  metadataJson: jsonb("metadata_json"),
  collectedAt: timestamp("collected_at").defaultNow().notNull(),
});

export const insertDataCollectionLogSchema = createInsertSchema(dataCollectionLogTable).omit({ id: true, collectedAt: true });
export type InsertDataCollectionLog = z.infer<typeof insertDataCollectionLogSchema>;
export type DataCollectionLog = typeof dataCollectionLogTable.$inferSelect;
