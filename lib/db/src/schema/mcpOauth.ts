import { pgTable, text, serial, integer, timestamp, boolean, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

/**
 * Authorization codes emitidos pelo OAuth AS do MCP.
 * Expiram em 5 minutos e são de uso único.
 */
export const mcpAuthCodesTable = pgTable("mcp_auth_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  codeChallenge: text("code_challenge").notNull(),
  codeChallengeMethod: text("code_challenge_method").notNull().default("S256"),
  redirectUri: text("redirect_uri").notNull(),
  clientId: text("client_id"),
  state: text("state"),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type McpAuthCode = typeof mcpAuthCodesTable.$inferSelect;

/**
 * SHA-256 dos access tokens emitidos ao final do fluxo OAuth (nunca o bearer).
 * Expiram em 1 hora (TTL configurável via MCP_TOKEN_TTL_SECONDS).
 */
export const mcpAccessTokensTable = pgTable("mcp_access_tokens", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("mcp_access_tokens_token_hash_unique").on(table.tokenHash),
  check("mcp_access_tokens_token_hash_format", sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`),
]);

export type McpAccessToken = typeof mcpAccessTokensTable.$inferSelect;

/**
 * Clientes OAuth registrados dinamicamente (RFC 7591 — Dynamic Client Registration).
 * Clientes públicos (PKCE, sem client_secret). redirect_uris armazenados como JSON.
 */
export const mcpClientsTable = pgTable("mcp_clients", {
  id: serial("id").primaryKey(),
  clientId: text("client_id").notNull().unique(),
  clientName: text("client_name"),
  redirectUris: text("redirect_uris").notNull(), // JSON array de URIs
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type McpClient = typeof mcpClientsTable.$inferSelect;
