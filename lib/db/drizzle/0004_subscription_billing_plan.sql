BEGIN;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_plan text
  CHECK (billing_plan IN ('pro_monthly', 'season_pass', 'grant', 'dev'));
UPDATE subscriptions SET billing_plan = 'grant' WHERE provider = 'admin' AND billing_plan IS NULL;
UPDATE subscriptions SET billing_plan = 'dev' WHERE provider = 'dev' AND billing_plan IS NULL;
-- Compras antigas permanecem NULL: o plano adquirido não pode ser inferido com segurança.
COMMIT;
