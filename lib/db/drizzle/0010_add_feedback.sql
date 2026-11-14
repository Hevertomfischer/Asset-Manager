-- Development migration; managed production schema changes are applied by Publish.
CREATE TABLE IF NOT EXISTS "feedback" (
  "id" serial PRIMARY KEY,
  "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "page" text DEFAULT '' NOT NULL,
  "type" text NOT NULL,
  "message" text NOT NULL,
  "status" text DEFAULT 'novo' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
