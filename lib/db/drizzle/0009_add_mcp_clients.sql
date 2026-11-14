-- Development migration; managed production schema changes are applied by Publish.
CREATE TABLE IF NOT EXISTS "mcp_clients" (
  "id" serial PRIMARY KEY,
  "client_id" text NOT NULL,
  "client_name" text,
  "redirect_uris" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "mcp_clients_client_id_unique" UNIQUE ("client_id")
);
