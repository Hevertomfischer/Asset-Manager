CREATE TABLE IF NOT EXISTS "mcp_auth_codes" (
  "id" serial PRIMARY KEY,
  "code" text NOT NULL UNIQUE,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "code_challenge" text NOT NULL,
  "code_challenge_method" text NOT NULL DEFAULT 'S256',
  "redirect_uri" text NOT NULL,
  "state" text,
  "expires_at" timestamp NOT NULL,
  "used" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "mcp_access_tokens" (
  "id" serial PRIMARY KEY,
  "token" text NOT NULL UNIQUE,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
