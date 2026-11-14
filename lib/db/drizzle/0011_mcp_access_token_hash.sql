-- Apply to DEVELOPMENT only; managed production schema is applied by Publish.
-- Existing bearer tokens are intentionally invalidated. Never rename token to
-- token_hash in the Publish dialog: the plaintext column must be removed.
BEGIN;
ALTER TABLE "mcp_access_tokens" ADD COLUMN IF NOT EXISTS "token_hash" text;
DELETE FROM "mcp_access_tokens" WHERE "token_hash" IS NULL;
ALTER TABLE "mcp_access_tokens" ALTER COLUMN "token_hash" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_access_tokens_token_hash_unique"
  ON "mcp_access_tokens" ("token_hash");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'mcp_access_tokens'::regclass
      AND conname = 'mcp_access_tokens_token_hash_format'
  ) THEN
    ALTER TABLE "mcp_access_tokens"
      ADD CONSTRAINT "mcp_access_tokens_token_hash_format"
      CHECK ("token_hash" ~ '^[0-9a-f]{64}$');
  END IF;
END $$;
ALTER TABLE "mcp_access_tokens" DROP COLUMN IF EXISTS "token";
DELETE FROM "mcp_auth_codes" WHERE "code_challenge_method" <> 'S256';
COMMIT;
