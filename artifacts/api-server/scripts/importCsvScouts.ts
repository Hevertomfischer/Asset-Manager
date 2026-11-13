/**
 * One-shot import: cartola_2026_rodadas_1-20 CSV → player_scout_round (source='csv_2026')
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { mapCartolaScoutToColumns } from "../src/lib/mapCartolaScoutToColumns";

const CSV_PATH = path.resolve(
  fileURLToPath(import.meta.url),
  "../../../../attached_assets/cartola_2026_rodadas_1-20_1785252053293.csv"
);
const SOURCE = "csv_2026";

function toFloat(v: string): number | null {
  if (!v || v.trim() === "") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

async function main() {
  // 1. Build atleta_id → player_id map
  const players = await db.execute<{ id: number; external_id: string }>(
    sql`SELECT id, external_id FROM players WHERE external_source = 'cartola_api'`
  );
  const idMap = new Map(players.rows.map((p) => [p.external_id, p.id]));
  console.log(`Loaded ${idMap.size} player mappings`);

  // 2. Parse CSV
  const raw = fs.readFileSync(CSV_PATH, "utf8");
  const records: Record<string, string>[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  console.log(`Parsed ${records.length} CSV rows`);

  // 3. UPSERT in batches of 200 rows
  let inserted = 0;
  let skipped = 0;
  const BATCH = 200;

  const buildUpsert = (valueSets: string[], params: unknown[]) => {
    let pi = 1;
    const rowSql = valueSets
      .map((_) => {
        const placeholders = Array.from({ length: 25 }, () => `$${pi++}`).join(", ");
        return `(${placeholders})`;
      })
      .join(",\n");

    // rebuild with actual pi
    return `
      INSERT INTO player_scout_round (
        player_id, round, source, points,
        goals, assists, shots, shots_on_target,
        tackles, interceptions, fouls_suffered, fouls_committed,
        saves, goals_conceded, clean_sheet,
        yellow_cards, red_cards, penalty_missed, penalty_saved, own_goals,
        ff, v, pc, ps, collected_at
      ) VALUES ${rowSql}
      ON CONFLICT (player_id, round, source) DO UPDATE SET
        points          = EXCLUDED.points,
        goals           = EXCLUDED.goals,
        assists         = EXCLUDED.assists,
        shots           = EXCLUDED.shots,
        shots_on_target = EXCLUDED.shots_on_target,
        tackles         = EXCLUDED.tackles,
        interceptions   = EXCLUDED.interceptions,
        fouls_suffered  = EXCLUDED.fouls_suffered,
        fouls_committed = EXCLUDED.fouls_committed,
        saves           = EXCLUDED.saves,
        goals_conceded  = EXCLUDED.goals_conceded,
        clean_sheet     = EXCLUDED.clean_sheet,
        yellow_cards    = EXCLUDED.yellow_cards,
        red_cards       = EXCLUDED.red_cards,
        penalty_missed  = EXCLUDED.penalty_missed,
        penalty_saved   = EXCLUDED.penalty_saved,
        own_goals       = EXCLUDED.own_goals,
        ff              = EXCLUDED.ff,
        v               = EXCLUDED.v,
        pc              = EXCLUDED.pc,
        ps              = EXCLUDED.ps,
        collected_at    = now()
    `;
  };

  const flush = async (batch: unknown[][]) => {
    if (batch.length === 0) return;
    // flat params array
    const params = batch.flat();
    const dummySets = batch.map(() => "dummy");
    const querySql = buildUpsert(dummySets, params);
    await db.execute(sql.raw(querySql, params as never[]));
    inserted += batch.length;
    process.stdout.write(`\r  Upserted ${inserted}…`);
  };

  // drizzle's sql.raw doesn't support parameterized queries well for bulk —
  // use node-postgres client directly via db.$client
  // @ts-ignore — pool is available on drizzle-orm/node-postgres instance
  const pool = (db as any).$client as import("pg").Pool;

  const UPSERT_TPL = `
    INSERT INTO player_scout_round (
      player_id, round, source, points,
      goals, assists, shots, shots_on_target,
      tackles, interceptions, fouls_suffered, fouls_committed,
      saves, goals_conceded, clean_sheet,
      yellow_cards, red_cards, penalty_missed, penalty_saved, own_goals,
      ff, v, pc, ps, collected_at
    ) VALUES %ROWS%
    ON CONFLICT (player_id, round, source) DO UPDATE SET
      points          = EXCLUDED.points,
      goals           = EXCLUDED.goals,
      assists         = EXCLUDED.assists,
      shots           = EXCLUDED.shots,
      shots_on_target = EXCLUDED.shots_on_target,
      tackles         = EXCLUDED.tackles,
      interceptions   = EXCLUDED.interceptions,
      fouls_suffered  = EXCLUDED.fouls_suffered,
      fouls_committed = EXCLUDED.fouls_committed,
      saves           = EXCLUDED.saves,
      goals_conceded  = EXCLUDED.goals_conceded,
      clean_sheet     = EXCLUDED.clean_sheet,
      yellow_cards    = EXCLUDED.yellow_cards,
      red_cards       = EXCLUDED.red_cards,
      penalty_missed  = EXCLUDED.penalty_missed,
      penalty_saved   = EXCLUDED.penalty_saved,
      own_goals       = EXCLUDED.own_goals,
      ff              = EXCLUDED.ff,
      v               = EXCLUDED.v,
      pc              = EXCLUDED.pc,
      ps              = EXCLUDED.ps,
      collected_at    = now()
  `;

  let valueSets: string[] = [];
  let params: unknown[] = [];
  let pi = 1;

  const flushPool = async () => {
    if (valueSets.length === 0) return;
    const querySql = UPSERT_TPL.replace("%ROWS%", valueSets.join(",\n"));
    await pool.query(querySql, params);
    inserted += valueSets.length;
    process.stdout.write(`\r  Upserted ${inserted}…`);
    valueSets = [];
    params = [];
    pi = 1;
  };

  for (const r of records) {
    const playerId = idMap.get(r.atleta_id);
    if (!playerId) { skipped++; continue; }
    const scout = mapCartolaScoutToColumns(r);

    const vals: unknown[] = [
      playerId,               // player_id
      parseInt(r.rodada, 10), // round
      SOURCE,                 // source
      toFloat(r.pontuacao),  // points
      scout.goals, scout.assists, scout.shots, scout.shotsOnTarget,
      scout.tackles, scout.interceptions, scout.foulsSuffered, scout.foulsCommitted,
      scout.saves, scout.goalsConceded, scout.cleanSheet,
      scout.yellowCards, scout.redCards, scout.penaltyMissed, scout.penaltySaved, scout.ownGoals,
      scout.ff, scout.v, scout.pc, scout.ps,
      new Date(),
    ];

    const placeholders = vals.map(() => `$${pi++}`).join(", ");
    valueSets.push(`(${placeholders})`);
    params.push(...vals);

    if (valueSets.length >= BATCH) await flushPool();
  }
  await flushPool();

  console.log(`\nDone. Upserted: ${inserted}, skipped (no player mapping): ${skipped}`);

  // Spot-check Arias R20
  const check = await pool.query(
    `SELECT player_id, round, points, ff, v
     FROM player_scout_round
     WHERE player_id = (SELECT id FROM players WHERE external_id = '99815')
       AND round = 20 AND source = 'csv_2026'`
  );
  console.log("Spot-check Arias R20 (csv_2026):", check.rows[0]);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
