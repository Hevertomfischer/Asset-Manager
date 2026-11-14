import { db } from "@workspace/db";
import { adminConfigTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("projection-calibration");
export async function calibrateProjectionWeights() {
  const { rows } = await db.execute<{ position: string; projected: number; actual: number; legacy: boolean }>(sql`
    SELECT p.position, pp.expected_points AS projected, psr.points AS actual,
           pp.locked_at IS NULL AS legacy
    FROM player_projection pp
    JOIN (SELECT DISTINCT ON (player_id, round) * FROM player_scout_round
          WHERE source = 'historical_cartola' AND points IS NOT NULL
          ORDER BY player_id, round, collected_at DESC, id DESC) psr
      ON psr.player_id = pp.player_id AND psr.round = pp.round
    JOIN players p ON p.id = pp.player_id
    WHERE pp.expected_points > 0.5 AND psr.points > 0 AND p.position != 'TEC'
  `);
  if (!rows.length) throw new Error("Sem pares oficiais finais para calibrar os pesos.");
  const groups = new Map<string, { projected: number[]; actual: number[] }>();
  for (const r of rows) {
    const g = groups.get(r.position) ?? { projected: [], actual: [] };
    g.projected.push(Number(r.projected)); g.actual.push(Number(r.actual)); groups.set(r.position, g);
  }
  const median = (values: number[]) => {
    const s = [...values].sort((a, b) => a - b), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
  };
  const positionMultipliers: Record<string, number> = {};
  const report: Record<string, { n: number; medianProjected: number; medianActual: number; multiplier: number }> = {};
  for (const [pos, g] of groups) {
    const projected = median(g.projected), actual = median(g.actual);
    const multiplier = Number(Math.max(0.5, Math.min(2, actual / projected)).toFixed(4));
    positionMultipliers[pos] = multiplier;
    report[pos] = { n: g.projected.length, medianProjected: projected, medianActual: actual, multiplier };
  }
  const calibration = {
    positionMultipliers, calibratedAt: new Date().toISOString(), totalPairs: rows.length,
    legacyTrainingPairs: rows.filter((r) => r.legacy).length,
    disclaimer: "Ajuste de treinamento; pares legados não constituem validação prospectiva.",
  };
  await db.insert(adminConfigTable).values({ key: "projection_calibration", value: JSON.stringify(calibration) })
    .onConflictDoUpdate({ target: adminConfigTable.key, set: { value: JSON.stringify(calibration), updatedAt: new Date() } });
  log.info("Pesos calibrados com pontuações finais oficiais", { pairs: rows.length, legacyPairs: calibration.legacyTrainingPairs });
  return { calibration, report };
}
