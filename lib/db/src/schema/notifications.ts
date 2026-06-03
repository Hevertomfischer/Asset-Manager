import { pgTable, serial, integer, text, timestamp, jsonb, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Stores in-app notifications.
 *
 * userId = NULL  → global alert shown to every authenticated user.
 * userId = N     → personal notification for that specific user.
 *
 * dedupeKey enforces idempotency: the job uses keys of the form
 *   "type:player:{playerId}:round:{round}"   — player events
 *   "type:round:{round}"                     — market events
 * Inserts with a duplicate dedupeKey are silently ignored (ON CONFLICT DO NOTHING).
 */
export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("notifications_dedupe_key_unique").on(t.dedupeKey)]
);

export type Notification = typeof notificationsTable.$inferSelect;
export type InsertNotification = typeof notificationsTable.$inferInsert;
export type NotificationType = "status_change" | "price" | "trap" | "market_open" | "market_close";
