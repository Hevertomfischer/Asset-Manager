/**
 * ogStats — dados mínimos para injeção de OG tags.
 *
 * Faz uma query SQL direta (mais leve que o endpoint completo de performance)
 * retornando apenas: MAE da temporada, número da última rodada e MAE dela.
 * Cache de 30 min — muda só quando fecha uma rodada.
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("og-stats");

export interface OgStatsResult {
  seasonMae: number | null;
  lastRound: number | null;
  lastRoundMae: number | null;
  totalRounds: number;
}

const EMPTY: OgStatsResult = {
  seasonMae: null,
  lastRound: null,
  lastRoundMae: null,
  totalRounds: 0,
};

interface CacheEntry {
  data: OgStatsResult;
  expiry: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000;

export function invalidateOgStatsCache() {
  cache = null;
}

export async function getOgStats(): Promise<OgStatsResult> {
  if (cache && Date.now() < cache.expiry) return cache.data;

  try {
    type Row = {
      season_mae: string | null;
      last_round: string | null;
      last_round_mae: string | null;
      total_rounds: string;
    };
    const result = await db.execute<Row>(sql`
      WITH
        scores AS (
          SELECT DISTINCT ON (player_id, round)
            player_id, round, points
          FROM player_scout_round
          WHERE points IS NOT NULL
            AND source IN ('cartola_api', 'historical_cartola')
          ORDER BY player_id, round,
            CASE source WHEN 'historical_cartola' THEN 0 ELSE 1 END
        ),
        paired AS (
          SELECT
            pp.round,
            ABS(pp.expected_points - s.points) AS abs_error
          FROM player_projection pp
          JOIN scores s
            ON  s.player_id = pp.player_id
            AND s.round     = pp.round
          WHERE pp.expected_points IS NOT NULL
        ),
        last_r AS (SELECT MAX(round) AS round FROM paired)
      SELECT
        ROUND(AVG(abs_error)::numeric, 2)   AS season_mae,
        (SELECT round FROM last_r)          AS last_round,
        (
          SELECT ROUND(AVG(abs_error)::numeric, 2)
          FROM   paired p2
          WHERE  p2.round = (SELECT round FROM last_r)
        )                                   AS last_round_mae,
        COUNT(DISTINCT round)::int          AS total_rounds
      FROM paired
    `);

    const row = result.rows[0];

    if (!row) {
      log.warn("OG stats query returned no rows");
      return EMPTY;
    }

    const data: OgStatsResult = {
      seasonMae:    row.season_mae    ? Number(row.season_mae)    : null,
      lastRound:    row.last_round    ? Number(row.last_round)    : null,
      lastRoundMae: row.last_round_mae ? Number(row.last_round_mae) : null,
      totalRounds:  Number(row.total_rounds ?? 0),
    };

    cache = { data, expiry: Date.now() + CACHE_TTL_MS };
    log.info("OG stats cached", { ...data });
    return data;
  } catch (err) {
    log.error("Failed to compute OG stats", {
      error: err instanceof Error ? err.message : String(err),
    });
    return EMPTY;
  }
}
