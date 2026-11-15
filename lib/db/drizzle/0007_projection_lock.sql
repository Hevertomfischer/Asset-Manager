-- Development only. Production schema is applied by Publish.
-- Never retroactively freeze legacy projections.
ALTER TABLE player_projection ADD COLUMN IF NOT EXISTS locked_at timestamp;
