BEGIN;
ALTER TABLE players ADD COLUMN IF NOT EXISTS popularity_count integer;
ALTER TABLE players ADD COLUMN IF NOT EXISTS popularity_listed boolean;
-- O denominador da coleta antiga não foi preservado. Não dividir por um total de outra rodada.
UPDATE players
SET popularity_count = CASE WHEN popularity >= 0 AND popularity <= 2147483647
  AND popularity = floor(popularity) THEN popularity::integer ELSE popularity_count END,
  popularity = NULL, popularity_listed = NULL
WHERE popularity_count IS NULL AND popularity_listed IS NULL AND popularity IS NOT NULL;
-- A publicação replica o schema, não este UPDATE. Não impor CHECK que bloqueie
-- a publicação enquanto a produção ainda guarda contagens legadas nessa coluna.
-- A leitura descarta valores legados; a próxima coleta grava frações válidas.
COMMIT;
