import { POSITION_SCOUT_WEIGHTS, SCOUT_SCORING } from "../config/projectionWeights";
import { CARTOLA_SCOUT_COLUMN_CODES, type CartolaScoutColumn } from "./mapCartolaScoutToColumns";

export type FormScout = Partial<Record<CartolaScoutColumn | "points" | "shots", number | null>>;

/** Keep the existing 70% points / 30% position-adjusted blend, using matching codes. */
export function positionFormScore(scouts: readonly FormScout[], position: string): number {
  if (scouts.length === 0) return 0;
  const weights = POSITION_SCOUT_WEIGHTS[position] ?? {};
  const multiplier = Object.keys(weights).length > 0 ? 0.3 : 0;
  let total = 0;
  for (const scout of scouts) {
    let adjustment = 0;
    for (const [column, code] of Object.entries(CARTOLA_SCOUT_COLUMN_CODES)) {
      const quantity = scout[column as CartolaScoutColumn] ?? 0;
      adjustment += quantity * (SCOUT_SCORING[code] ?? 0) * (weights[code] ?? 1);
    }
    // shots is the aggregate FD + FT + FF, not a separate scoring event.
    // Missing/inconsistent legacy totals must not invent shots on the post.
    const shotsOnPost = Math.max(0, (scout.shots ?? 0) - (scout.shotsOnTarget ?? 0) - (scout.ff ?? 0));
    adjustment += shotsOnPost * (SCOUT_SCORING["FT"] ?? 0) * (weights["FT"] ?? 1);
    // Preserve negative official points instead of silently turning them into zero.
    const base = scout.points ?? 0;
    total += base + multiplier * (adjustment - base);
  }
  return total / scouts.length;
}
