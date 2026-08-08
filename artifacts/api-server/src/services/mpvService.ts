/**
 * MPV (Mínimo Para Valorizar) calculation service.
 *
 * Formula validated against 103 real Cartola PRO values (R²=0.91, mean error 0.44 pt):
 *   MPV = 0.282 × price + 0.675 × lastScore − 0.633
 *
 * "lastScore" heuristic:
 *  - Find the most recent round in player_scout_round where the player has
 *    any scout activity (at least one non-null, non-zero scout column).
 *  - If the very latest round has NO scout activity, look 4 rounds back:
 *      • ≥ 2 of those 4 rounds have scouts  → player missed ONE isolated round
 *        → use the points from the last round that DID have scouts.
 *      • Otherwise (absent for multiple rounds) → use 0.
 *  - If no scout history at all → use 0.
 */

import { db } from "@workspace/db";
import { playersTable, playerScoutRoundTable } from "@workspace/db/schema";
import { isNull, sql, eq, not } from "drizzle-orm";

// ── constants ─────────────────────────────────────────────────────────────────
const COEF_PRICE  = 0.282;
const COEF_SCORE  = 0.675;
const INTERCEPT   = -0.633;
const LOOKBACK    = 4;   // rounds to inspect when player missed latest round
const MIN_ACTIVE  = 2;   // minimum active rounds in lookback window to be "regular"

// SQL expression: "did the player have any scout activity in this row?"
// Covers all columns that the ETL populates from scout keys.
const hasScoutActivity = sql<boolean>`(
  coalesce(${playerScoutRoundTable.goals},         0) +
  coalesce(${playerScoutRoundTable.assists},        0) +
  coalesce(${playerScoutRoundTable.shots},          0) +
  coalesce(${playerScoutRoundTable.shotsOnTarget},  0) +
  coalesce(${playerScoutRoundTable.tackles},        0) +
  coalesce(${playerScoutRoundTable.interceptions},  0) +
  coalesce(${playerScoutRoundTable.foulsSuffered},  0) +
  coalesce(${playerScoutRoundTable.foulsCommitted}, 0) +
  coalesce(${playerScoutRoundTable.saves},          0) +
  coalesce(${playerScoutRoundTable.goalsConceded},  0) +
  coalesce(${playerScoutRoundTable.cleanSheet},     0) +
  coalesce(${playerScoutRoundTable.yellowCards},    0) +
  coalesce(${playerScoutRoundTable.redCards},       0) +
  coalesce(${playerScoutRoundTable.penaltyMissed},  0) +
  coalesce(${playerScoutRoundTable.penaltySaved},   0) +
  coalesce(${playerScoutRoundTable.ownGoals},       0)
) > 0`;

// ── types ─────────────────────────────────────────────────────────────────────
interface ScoutRow {
  round: number;
  points: number | null;
  active: boolean; // has any scout activity
}

interface MpvEntry {
  playerId: number;
  mpv: number;
}

// ── core ──────────────────────────────────────────────────────────────────────

function applyFormula(price: number, lastScore: number): number {
  const raw = COEF_PRICE * price + COEF_SCORE * lastScore + INTERCEPT;
  return Math.round(raw * 100) / 100;
}

function resolveLastScore(history: ScoutRow[]): number {
  if (history.length === 0) return 0;

  const latest = history[0]!;

  if (latest.active) {
    // Player participated in the most recent round — use its points directly
    return latest.points ?? 0;
  }

  // Latest round: no scout activity → check if this is an isolated absence
  const lookback = history.slice(1, 1 + LOOKBACK);
  const activeInLookback = lookback.filter((r) => r.active).length;

  if (activeInLookback >= MIN_ACTIVE) {
    // Regular player who simply missed one round → use last real performance
    const lastActive = lookback.find((r) => r.active);
    return lastActive?.points ?? 0;
  }

  // Long-term absence (injured, reserve) → formula handles it well with 0
  return 0;
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Compute MPV for all players that have a non-null price.
 * Returns a list of { playerId, mpv } ready for DB update.
 */
export async function computeMpvForAllPlayers(): Promise<MpvEntry[]> {
  // 1. Load players with a price
  const players = await db
    .select({ id: playersTable.id, price: playersTable.price })
    .from(playersTable)
    .where(not(isNull(playersTable.price)));

  if (players.length === 0) return [];

  // 2. Load the last (LOOKBACK+1) scout rounds per player in a single query.
  //    When multiple sources exist for the same (player_id, round), prefer
  //    'csv_2026' (authoritative, includes FF/V/PC/PS) over API snapshots.
  //    We deduplicate via DISTINCT ON ordered by source priority descending.
  const rows = await db.execute<{
    player_id: number;
    round: number;
    points: number | null;
    active: boolean;
  }>(sql`
    SELECT player_id, round, points, active
    FROM (
      SELECT DISTINCT ON (player_id, round)
        player_id,
        round,
        points,
        (
          COALESCE(goals,          0) +
          COALESCE(assists,        0) +
          COALESCE(shots,          0) +
          COALESCE(shots_on_target,0) +
          COALESCE(tackles,        0) +
          COALESCE(interceptions,  0) +
          COALESCE(fouls_suffered, 0) +
          COALESCE(fouls_committed,0) +
          COALESCE(saves,          0) +
          COALESCE(goals_conceded, 0) +
          COALESCE(clean_sheet,    0) +
          COALESCE(yellow_cards,   0) +
          COALESCE(red_cards,      0) +
          COALESCE(penalty_missed, 0) +
          COALESCE(penalty_saved,  0) +
          COALESCE(own_goals,      0) +
          COALESCE(ff,             0) +
          COALESCE(v,              0)
        ) > 0 AS active
      FROM player_scout_round
      WHERE player_id IN (${sql.join(players.map((p) => sql`${p.id}`), sql`, `)})
        AND round IN (
          SELECT DISTINCT round FROM player_scout_round
          ORDER BY round DESC
          LIMIT ${LOOKBACK + 1}
        )
      ORDER BY
        player_id,
        round,
        -- Prefer rows with confirmed non-zero points FIRST, so that a live
        -- cartola_api snapshot (points=0 captured during a match) never
        -- shadows historical_cartola which has the final confirmed score.
        -- Use <> 0 (not > 0) so valid negative Cartola scores are also preferred.
        CASE WHEN points <> 0 THEN 0 ELSE 1 END,
        -- source priority: csv_2026 authoritative; historical data beats
        -- live API snapshots that may carry partial/zero points mid-round
        CASE source
          WHEN 'csv_2026'           THEN 1
          WHEN 'historical_cartola' THEN 2
          WHEN 'cartola_api'        THEN 3
          WHEN 'cartola_api_scouts' THEN 4
          ELSE                           5
        END
    ) deduped
    ORDER BY player_id, round DESC
  `);

  // reshape to match the original structure
  const reshapedRows = rows.rows.map((r) => ({
    playerId: r.player_id,
    round:    r.round,
    points:   r.points,
    active:   Boolean(r.active),
  }));

  // 3. Group rows by player_id (already ordered DESC by round)
  const byPlayer = new Map<number, ScoutRow[]>();
  for (const row of reshapedRows) {
    const list = byPlayer.get(row.playerId) ?? [];
    list.push({ round: row.round, points: row.points, active: row.active });
    byPlayer.set(row.playerId, list);
  }

  // 4. Apply formula for each player
  const results: MpvEntry[] = [];
  for (const player of players) {
    const price = player.price!;
    const history = byPlayer.get(player.id) ?? [];
    const lastScore = resolveLastScore(history);
    const mpv = applyFormula(price, lastScore);
    results.push({ playerId: player.id, mpv });
  }

  return results;
}

/**
 * Compute and persist MPV values into players.minimo_para_valorizar.
 *
 * @param overwrite  When false (default), only fills NULL values — preserving
 *                   any official value already fetched from the Cartola API.
 *                   When true, overwrites all values.
 * @returns          Number of players updated.
 */
export async function applyMpvToDatabase(overwrite = false): Promise<number> {
  const entries = await computeMpvForAllPlayers();
  if (entries.length === 0) return 0;

  let updated = 0;
  // Batch updates: update each player individually (small N, no batch-update API in drizzle)
  for (const { playerId, mpv } of entries) {
    const query = db
      .update(playersTable)
      .set({ minimoParaValorizar: mpv, updatedAt: new Date() })
      .where(
        overwrite
          ? eq(playersTable.id, playerId)
          : sql`${playersTable.id} = ${playerId} AND ${playersTable.minimoParaValorizar} IS NULL`
      );

    const result = await query.returning({ id: playersTable.id });
    if (result.length > 0) updated++;
  }

  return updated;
}
