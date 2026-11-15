-- SECOND publication stage only: first publish the repair code, force-sync
-- production closed rounds and consolidate duplicates through the admin API.
-- Apply this SQL to DEVELOPMENT only once production repair has been verified.
-- Publish then applies the unique index to the already-consolidated production DB.
BEGIN;
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY player_id, round
    ORDER BY CASE source WHEN 'historical_cartola' THEN 0
                         WHEN 'cartola_api' THEN 2 ELSE 1 END,
             collected_at DESC, id DESC
  ) AS n FROM player_scout_round
)
DELETE FROM player_scout_round WHERE id IN (SELECT id FROM ranked WHERE n > 1);
CREATE UNIQUE INDEX IF NOT EXISTS player_scout_round_player_round_unique
  ON player_scout_round (player_id, round);
COMMIT;
