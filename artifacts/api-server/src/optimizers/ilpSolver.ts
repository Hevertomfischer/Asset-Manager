/**
 * ILP Optimizer for Cartola FC lineup generation.
 *
 * Library: javascript-lp-solver (pure JS branch-and-bound MIP solver)
 * Justification: sem WASM/dependências nativas; para ≤30 candidatos/posição
 * (~200 variáveis binárias) resolve em <200 ms. Python/PuLP adicionaria
 * latência de processo externo desnecessária nessa escala.
 *
 * Model:
 *   Variables:
 *     x_i ∈ {0,1}  — player i is in the lineup
 *     c_i ∈ {0,1}  — player i is captain (field players only)
 *
 *   Objective (maximize):
 *     Σ(score_i · x_i) + CAPTAIN_EPSILON · Σ((captainScore_i + eligibilityBonus_i) · c_i)
 *
 *     CAPTAIN_EPSILON = 1e-3 keeps captain choice secondary to team selection.
 *     eligibilityBonus = 1_000_000 for players with gamesPlayed ≥ MIN_GAMES,
 *     ensuring eligible players are always preferred as captain.
 *
 *   Constraints:
 *     Formation    : Σ(x_i | pos=p) = required_p            for each position p
 *     Budget       : Σ(price_i · x_i) ≤ budgetLimit
 *     Max/club     : Σ(x_i | club=k) ≤ maxPlayersPerClub    for each club k
 *     1/club-pos   : Σ(x_i | club=k, pos=p) ≤ 1            for each (k,p)
 *     Opponent     : Σ(x_i | club ∈ {A,B}, pos=p) ≤ 1      for each match (A vs B) × position p
 *     Captain count: Σ(c_i) = 1
 *     Captain bound: c_i ≤ x_i                              for each field player i
 */

import { createRequire } from "module";
import { createLogger } from "../lib/logger";

interface LpSolverLib {
  Solve(model: LpModel): LpResult;
}
interface LpModel {
  optimize: string;
  opType: "max" | "min";
  constraints: Record<string, { min?: number; max?: number }>;
  variables: Record<string, Record<string, number>>;
  ints?: Record<string, 1>;
}
interface LpResult {
  feasible: boolean;
  result: number;
  bounded?: boolean;
  [varName: string]: number | boolean | undefined;
}

const _require = createRequire(import.meta.url);
const lpSolver = _require("javascript-lp-solver") as LpSolverLib;

const log = createLogger("ilp-solver");

const TOP_BY_SCORE = 25;
const CHEAP_BUFFER = 5;

const CAPTAIN_EPSILON = 1e-3;
const CAPTAIN_ELIGIBILITY_BONUS = 1_000_000;
export const CAPTAIN_MIN_GAMES = 3;

// ── Public types ──────────────────────────────────────────────────────────────

export interface IlpCandidate {
  id: number;
  position: string;
  clubId: number;
  price: number;
  /** Strategy-specific objective score from getScoringFn. */
  score: number;
  /** Strategy-specific captain preference weight (mirrors selectCaptain criteria). */
  captainScore: number;
  gamesPlayed: number;
  isFieldPlayer: boolean; // false for TEC
  /**
   * Per-player risk score (from PlayerProjection.riskScore).
   * Used when IlpConstraints.maxTotalRisk is set to add a
   * Σ(riskScore_i · x_i) ≤ maxTotalRisk constraint.
   */
  riskScore?: number;
}

export interface IlpSlot {
  position: string;
  count: number;
}

export interface IlpConstraints {
  slots: IlpSlot[];
  budgetLimit: number;
  maxPlayersPerClub: number;
  /** clubId → opponentClubId for this round. */
  opponentMap: Map<number, number>;
  /**
   * Optional cap on total team risk: Σ(riskScore_i · x_i) ≤ maxTotalRisk.
   * Used by the frontier service to generate risk-tiered lineups.
   * Requires IlpCandidate.riskScore to be populated.
   */
  maxTotalRisk?: number;
}

export interface IlpSolution {
  feasible: boolean;
  selectedIds: Set<number>;
  captainId: number | null;
  /** Sum of strategy scores for selected players — used in tests to compare vs greedy. */
  totalScore: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function deduplicateById(arr: IlpCandidate[]): IlpCandidate[] {
  const seen = new Set<number>();
  return arr.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}

function prefilter(candidates: IlpCandidate[]): IlpCandidate[] {
  const byPos = new Map<string, IlpCandidate[]>();
  for (const c of candidates) {
    const g = byPos.get(c.position) ?? [];
    g.push(c);
    byPos.set(c.position, g);
  }

  const result: IlpCandidate[] = [];
  for (const [, group] of byPos) {
    const byScore = [...group].sort((a, b) => b.score - a.score);
    const byCheap = [...group].sort((a, b) => a.price - b.price);
    result.push(
      ...deduplicateById([
        ...byScore.slice(0, TOP_BY_SCORE),
        ...byCheap.slice(0, CHEAP_BUFFER),
      ])
    );
  }
  return result;
}

// ── Main solver ───────────────────────────────────────────────────────────────

export function solveLineupILP(
  candidates: IlpCandidate[],
  constraints: IlpConstraints
): IlpSolution {
  const { slots, budgetLimit, maxPlayersPerClub, opponentMap } = constraints;

  const filtered = prefilter(candidates);
  log.debug("Pre-filtered candidates", { from: candidates.length, to: filtered.length });

  const fieldCandidates = filtered.filter((c) => c.isFieldPlayer);
  const hasEligible = fieldCandidates.some((c) => c.gamesPlayed >= CAPTAIN_MIN_GAMES);

  // ── Constraints ───────────────────────────────────────────────────────────
  const modelConstraints: Record<string, { min?: number; max?: number }> = {};

  // Formation (equality via min+max)
  for (const { position, count } of slots) {
    modelConstraints[`pos_${position}`] = { min: count, max: count };
  }

  // Budget ceiling always applied.
  // 80% utilization floor only when there is no risk cap — a tight risk cap may
  // require cheap/safe players that genuinely cannot fill 80% of the budget.
  modelConstraints["budget"] = {
    ...(constraints.maxTotalRisk == null ? { min: budgetLimit * 0.80 } : {}),
    max: budgetLimit,
  };

  // Optional risk cap: Σ(riskScore_i · x_i) ≤ maxTotalRisk
  if (constraints.maxTotalRisk != null) {
    modelConstraints["total_risk"] = { max: constraints.maxTotalRisk };
  }

  // Exactly one captain
  modelConstraints["n_captain"] = { min: 1, max: 1 };

  // Per-club max
  for (const c of filtered) {
    const key = `club_${c.clubId}`;
    if (!modelConstraints[key]) modelConstraints[key] = { max: maxPlayersPerClub };
  }

  // One per (club, position)
  for (const c of filtered) {
    const key = `clubpos_${c.clubId}_${c.position}`;
    if (!modelConstraints[key]) modelConstraints[key] = { max: 1 };
  }

  // Opponent: at most 1 player per position per match
  const seenPairs = new Set<string>();
  for (const [clubA, clubB] of opponentMap) {
    const pairKey = `${Math.min(clubA, clubB)}_${Math.max(clubA, clubB)}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    const posSet = new Set(
      filtered.filter((c) => c.clubId === clubA || c.clubId === clubB).map((c) => c.position)
    );
    for (const pos of posSet) {
      modelConstraints[`opp_${pairKey}_${pos}`] = { max: 1 };
    }
  }

  // ── Variables ─────────────────────────────────────────────────────────────
  const variables: Record<string, Record<string, number>> = {};
  const ints: Record<string, 1> = {};

  for (const c of filtered) {
    const xKey = `x_${c.id}`;
    const varX: Record<string, number> = {
      obj: c.score,
      budget: c.price,
      [`pos_${c.position}`]: 1,
      [`club_${c.clubId}`]: 1,
      [`clubpos_${c.clubId}_${c.position}`]: 1,
    };

    // Risk constraint contribution
    if (constraints.maxTotalRisk != null && c.riskScore != null) {
      varX["total_risk"] = c.riskScore;
    }

    // Opponent contribution
    const oppId = opponentMap.get(c.clubId);
    if (oppId !== undefined) {
      const pairKey = `${Math.min(c.clubId, oppId)}_${Math.max(c.clubId, oppId)}`;
      const oppKey = `opp_${pairKey}_${c.position}`;
      if (modelConstraints[oppKey]) varX[oppKey] = 1;
    }

    // c_i ≤ x_i encoded as c_i − x_i ≤ 0 via shared row `cx_{id}`
    if (c.isFieldPlayer) {
      varX[`cx_${c.id}`] = -1;
      modelConstraints[`cx_${c.id}`] = { max: 0 };
    }

    variables[xKey] = varX;
    ints[xKey] = 1;

    // Captain variable (field players only)
    if (c.isFieldPlayer) {
      const eligBonus =
        !hasEligible || c.gamesPlayed >= CAPTAIN_MIN_GAMES ? CAPTAIN_ELIGIBILITY_BONUS : 0;

      variables[`c_${c.id}`] = {
        obj: (c.captainScore + eligBonus) * CAPTAIN_EPSILON,
        n_captain: 1,
        [`cx_${c.id}`]: 1,
      };
      ints[`c_${c.id}`] = 1;
    }
  }

  // ── Solve ─────────────────────────────────────────────────────────────────
  const t0 = Date.now();
  const result = lpSolver.Solve({
    optimize: "obj",
    opType: "max",
    constraints: modelConstraints,
    variables,
    ints,
  });
  const elapsedMs = Date.now() - t0;

  log.info("ILP solver finished", {
    feasible: result.feasible,
    objectiveValue: result.result,
    elapsedMs,
    xVars: filtered.length,
    cVars: fieldCandidates.length,
  });

  if (!result.feasible) {
    log.warn("ILP infeasible", { budgetLimit, slotCount: slots.length });
    return { feasible: false, selectedIds: new Set(), captainId: null, totalScore: 0 };
  }

  // ── Extract solution ──────────────────────────────────────────────────────
  const selectedIds = new Set<number>();
  let captainId: number | null = null;

  for (const c of filtered) {
    if ((result[`x_${c.id}`] as number | undefined) === 1) selectedIds.add(c.id);
    if (c.isFieldPlayer && (result[`c_${c.id}`] as number | undefined) === 1) {
      captainId = c.id;
    }
  }

  const totalScore = filtered
    .filter((c) => selectedIds.has(c.id))
    .reduce((s, c) => s + c.score, 0);

  return { feasible: true, selectedIds, captainId, totalScore };
}
