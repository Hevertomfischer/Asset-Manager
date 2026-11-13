ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_start timestamp;
-- Não deduzir datas de início de compras históricas sem registro do período.
