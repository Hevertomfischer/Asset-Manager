import { LINEUP_CONFIG } from "../config/projectionWeights";
import {
  calculateLineup, loadLineupSnapshot, LineupValidationError,
  type LineupRequest, type LineupSnapshot,
} from "../optimizers/lineupOptimizer";

export interface FormationEvaluation {
  formation: string;
  feasible: boolean;
  expectedPoints: number | null;
  totalCost: number | null;
  balance: number | null;
  differenceFromBest: number | null;
  reason: string | null;
}

/** All alternatives share the same data and objective; only formation changes. */
export function evaluateFormations(request: LineupRequest, snapshot: LineupSnapshot) {
  const results: FormationEvaluation[] = Object.keys(LINEUP_CONFIG.formations).map((formation) => {
    try {
      const result = calculateLineup({ ...request, formation }, snapshot);
      return {
        formation, feasible: true, expectedPoints: result.expectedPoints,
        totalCost: result.totalCost,
        balance: Number((result.budgetLimit - result.totalCost).toFixed(2)),
        differenceFromBest: null, reason: null,
      };
    } catch (error) {
      // Do not disguise database/solver bugs as user-correctable infeasibility.
      if (!(error instanceof LineupValidationError)) throw error;
      return {
        formation, feasible: false, expectedPoints: null, totalCost: null,
        balance: null, differenceFromBest: null, reason: error.message,
      };
    }
  });
  results.sort((a, b) =>
    Number(b.feasible) - Number(a.feasible) ||
    (b.expectedPoints ?? 0) - (a.expectedPoints ?? 0) ||
    a.formation.localeCompare(b.formation)
  );
  const best = results.find((r) => r.feasible);
  for (const result of results) {
    if (result.feasible && best) {
      result.differenceFromBest = Number((best.expectedPoints! - result.expectedPoints!).toFixed(2));
    }
  }
  return {
    round: request.round,
    strategy: request.strategy,
    budget: request.budgetLimit ?? LINEUP_CONFIG.defaultBudget,
    bestFormation: best?.formation ?? null,
    results,
  };
}

export async function compareFormations(request: LineupRequest) {
  return evaluateFormations(request, await loadLineupSnapshot(request.round));
}
