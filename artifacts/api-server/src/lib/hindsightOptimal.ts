/**
 * Reusable hindsight-optimal helpers extracted from routes/history.ts.
 *
 * greedyHindsight   — picks the highest-actual-points team within a budget (greedy per slot).
 * computeEfficiency — runs greedyHindsight and returns the three efficiency metrics.
 *
 * The behaviour is identical to what /api/history/budget-optimal uses — do not change
 * SLOTS_BY_POSITION or SLOT_ORDER without also updating that endpoint.
 */

export interface HindsightCandidate {
  playerId: number;
  position: string;
  actualPoints: number;
  price: number;
  name: string;
  nickname: string | null;
  clubId: number | null;
}

export interface EfficiencyResult {
  optimalActualPoints: number;
  ourActualPoints: number;
  efficiencyPct: number;
}

const SLOTS_BY_POSITION: Record<string, number> = {
  GOL: 1, ZAG: 2, LAT: 2, MEI: 3, ATA: 3, TEC: 1,
};

const SLOT_ORDER = ["GOL", "ZAG", "LAT", "MEI", "ATA", "TEC"];

/**
 * Greedy hindsight: fill each position slot with the highest-actual-points player
 * that still fits within the remaining budget. If budget is too tight for any
 * remaining slot, falls back to the cheapest available player to guarantee a
 * full team.
 */
export function greedyHindsight(
  candidates: HindsightCandidate[],
  budgetLimit: number,
): HindsightCandidate[] {
  const selected: HindsightCandidate[] = [];
  let remaining = budgetLimit;

  for (const pos of SLOT_ORDER) {
    const slots = SLOTS_BY_POSITION[pos] ?? 0;
    const usedIds = new Set(selected.map((p) => p.playerId));
    const pool = candidates
      .filter((c) => c.position === pos && !usedIds.has(c.playerId))
      .sort((a, b) => b.actualPoints - a.actualPoints);

    let filled = 0;
    for (const p of pool) {
      if (filled >= slots) break;
      if (p.price <= remaining) {
        selected.push(p);
        remaining -= p.price;
        filled++;
      }
    }
    // fallback: grab cheapest available to fill the slot when budget is too tight
    if (filled < slots) {
      const usedIds2 = new Set(selected.map((p) => p.playerId));
      const cheapPool = candidates
        .filter((c) => c.position === pos && !usedIds2.has(c.playerId))
        .sort((a, b) => a.price - b.price);
      for (const p of cheapPool) {
        if (filled >= slots) break;
        selected.push(p);
        remaining -= p.price;
        filled++;
      }
    }
  }

  return selected;
}

/**
 * Given the full candidate pool, a budget, and the actual points our team scored,
 * returns the three efficiency metrics used by /api/history/budget-optimal and
 * /api/user-teams/:id/rounds.
 */
export function computeEfficiency(
  candidates: HindsightCandidate[],
  budgetLimit: number,
  ourActualPoints: number,
): EfficiencyResult {
  const optimal = greedyHindsight(candidates, budgetLimit);
  const optimalActualPoints = Number(
    optimal.reduce((s, p) => s + p.actualPoints, 0).toFixed(2),
  );
  const efficiencyPct =
    optimalActualPoints > 0
      ? Number(((ourActualPoints / optimalActualPoints) * 100).toFixed(1))
      : 0;

  return {
    optimalActualPoints,
    ourActualPoints: Number(ourActualPoints.toFixed(2)),
    efficiencyPct,
  };
}
