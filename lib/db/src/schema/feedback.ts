import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Stores user-submitted feedback.
 *
 * userId = NULL  → anonymous submission (user not logged in).
 * userId = N     → authenticated user.
 *
 * type values: 'bug' | 'ideia' | 'elogio' | 'duvida'
 * status values: 'novo' | 'em_analise' | 'resolvido' | 'arquivado'
 */
export const feedbackTable = pgTable("feedback", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  page: text("page").notNull().default(""),
  type: text("type").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("novo"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Feedback = typeof feedbackTable.$inferSelect;
export type InsertFeedback = typeof feedbackTable.$inferInsert;
export type FeedbackType = "bug" | "ideia" | "elogio" | "duvida";
export type FeedbackStatus = "novo" | "em_analise" | "resolvido" | "arquivado";
