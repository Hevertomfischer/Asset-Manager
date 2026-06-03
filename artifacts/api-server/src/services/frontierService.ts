/**
 * Frontier service — generates 3-5 ILP-optimal lineups at different risk levels.
 *
 * Each tier maximises Σ(expectedPoints_i · x_i) subject to all standard
 * constraints (formation, budget, club caps, opponent) PLUS an optional cap on
 * Σ(riskScore_i · x_i). The tiers span from "Conservador" (tight risk cap) to
 * "Arrojado" (no risk cap), tracing an efficient frontier in risk × return space.
 *
 * No lineup is saved to the database — this is a pure analysis endpoint.
 */

import { db } from "@workspace/db";
import { playerAvailabilityTable } from "@workspace/db/schema";
import { getProjectionsByRound } from "../repositories/projectionRepository";
import { getMatchesByRound } from "../repositories/matchRepository";
import { solveLineupILP, type IlpCandidate, type IlpSlot, CAPTAIN_MIN_GAMES } from "../optimizers/ilpSolver";
import { LINEUP_CONFIG } from "../config/projectionWeights";
import { createLogger } from "../lib/logger";

const log = createLogger("frontier-service");

// Captain position multiplier (mirrors lineupOptimizer)
const CAPTAIN_MULT: Record<string, number> = {
  ATA: 1.2,
  MEI: 1.1,
  LAT: 1.0,
  ZAG: 1.0,
  GOL: 0.95,
};

const UNAVAILABLE_STATUSES = new Set(["Suspenso", "Nulo", "Contundido"]);

// ── Public types ──────────────────────────────────────────────────────────────

export interface FrontierRequest {
  budgetLimit?: number;
  formation?: string;
}

export interface FrontierPlayer {
  id: number;
  name: string;
  nickname: string | null;
  position: string;
  clubId: number | null;
  price: number;
  expectedPoints: number;
  riskScore: number;
  isCaptain: boolean;
}

export interface FrontierTier {
  label: string;
  description: string;
  color: string;
  expectedPoints: number;
  totalRisk: number;
  totalCost: number;
  captainId: number | null;
  riskCap: number | null;
  players: FrontierPlayer[];
}

export interface FrontierResponse {
  round: number;
  formation: string;
  budgetLimit: number;
  tiers: FrontierTier[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSlots(formation: string): IlpSlot[] {
  const config =
    LINEUP_CONFIG.formations[formation] ??
    LINEUP_CONFIG.formations[LINEUP_CONFIG.defaultFormation]!;
  const slots: IlpSlot[] = [{ position: "GOL", count: 1 }];
  for (const pos of ["ZAG", "LAT", "ATA", "MEI"]) {
    const count = config[pos] ?? 0;
    if (count > 0) slots.push({ position: pos, count });
  }
  slots.push({ position: "TEC", count: 1 });
  return slots;
}

/**
 * Computes risk caps for 4 tiers (Conservador→Ousado) using percentile risk
 * scores per position.
 *
 * For each formation slot, we look at the sorted riskScores of eligible
 * candidates at that position and take the p25/p45/p65/p82 quantile value.
 * Summing across slots gives a realistic cap for each tier.
 */
function computeRiskCaps(
  candidates: IlpCandidate[],
  slots: IlpSlot[]
): [number, number, number, number] {
  const PERCENTILES = [0.25, 0.45, 0.65, 0.82] as const;

  return PERCENTILES.map((p) => {
    let totalCap = 0;
    for (const { position, count } of slots) {
      const posRisks = candidates
        .filter((c) => c.position === position)
        .map((c) => c.riskScore ?? 0)
        .sort((a, b) => a - b);

      if (posRisks.length === 0) continue;

      for (let i = 0; i < count; i++) {
        const idx = Math.min(Math.floor(posRisks.length * p), posRisks.length - 1);
        totalCap += posRisks[idx] ?? 0;
      }
    }
    return totalCap;
  }) as [number, number, number, number];
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateFrontier(
  request: FrontierRequest,
  round: number
): Promise<FrontierResponse> {
  const budgetLimit = request.budgetLimit ?? LINEUP_CONFIG.defaultBudget;
  const formation = request.formation ?? LINEUP_CONFIG.defaultFormation;
  const slots = getSlots(formation);

  // ── Load data ─────────────────────────────────────────────────────────────
  const [projections, players, availabilities, roundMatches] = await Promise.all([
    getProjectionsByRound(round),
    db.query.playersTable.findMany(),
    db.select().from(playerAvailabilityTable),
    getMatchesByRound(round),
  ]);

  if (projections.length === 0) {
    throw new Error(
      `Sem projeções para a rodada ${round}. Sincronize os dados primeiro.`
    );
  }

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const projMap = new Map(projections.map((p) => [p.playerId, p]));
  const availMap = new Map(availabilities.map((a) => [a.playerId, a.playProbability]));

  const opponentMap = new Map<number, number>();
  for (const match of roundMatches) {
    if (match.homeClubId && match.awayClubId) {
      opponentMap.set(match.homeClubId, match.awayClubId);
      opponentMap.set(match.awayClubId, match.homeClubId);
    }
  }

  // ── Build candidates (objective = expectedPoints, not strategy score) ──────
  const ilpCandidates: IlpCandidate[] = [];

  for (const proj of projections) {
    const player = playerMap.get(proj.playerId);
    if (!player) continue;

    let playProb = proj.playProbability;
    const avail = availMap.get(proj.playerId);
    if (avail != null) playProb = Math.min(playProb ?? 1, avail);
    if (player.status != null && UNAVAILABLE_STATUSES.has(player.status)) playProb = 0;
    if ((playProb ?? 0) <= 0.1) continue;

    const expectedPts = proj.expectedPoints ?? 0;

    ilpCandidates.push({
      id: player.id,
      position: player.position,
      clubId: player.clubId ?? 0,
      price: player.price ?? 0,
      score: expectedPts,
      captainScore: expectedPts * (CAPTAIN_MULT[player.position] ?? 1.0),
      gamesPlayed: player.gamesPlayed ?? 0,
      isFieldPlayer: player.position !== "TEC",
      riskScore: proj.riskScore ?? 0,
    });
  }

  log.info("Frontier candidates ready", { count: ilpCandidates.length, round, formation });

  // ── Compute risk caps from candidate distribution ──────────────────────────
  const [conservadorCap, moderadoCap, equilibradoCap, ousadoCap] =
    computeRiskCaps(ilpCandidates, slots);

  const TIER_DEFS = [
    {
      label: "Conservador",
      description: "Jogadores constantes, mínima variância",
      color: "#3B82F6",
      riskCap: conservadorCap,
    },
    {
      label: "Moderado",
      description: "Baixo risco com bom retorno esperado",
      color: "#06B6D4",
      riskCap: moderadoCap,
    },
    {
      label: "Equilibrado",
      description: "Balanço ideal entre risco e recompensa",
      color: "#22C55E",
      riskCap: equilibradoCap,
    },
    {
      label: "Ousado",
      description: "Alto potencial com maior variância",
      color: "#F59E0B",
      riskCap: ousadoCap,
    },
    {
      label: "Arrojado",
      description: "Máximo retorno esperado, risco total",
      color: "#EF4444",
      riskCap: undefined,
    },
  ];

  // ── Solve one ILP per tier ─────────────────────────────────────────────────
  const tiers: FrontierTier[] = [];
  const seenLineups = new Set<string>();

  for (const tierDef of TIER_DEFS) {
    const solution = solveLineupILP(ilpCandidates, {
      slots,
      budgetLimit,
      maxPlayersPerClub: LINEUP_CONFIG.maxPlayersPerClub,
      opponentMap,
      maxTotalRisk: tierDef.riskCap,
    });

    if (!solution.feasible) {
      log.info("Tier infeasible — skipping", {
        label: tierDef.label,
        riskCap: tierDef.riskCap?.toFixed(3),
      });
      continue;
    }

    // Deduplicate identical lineups (constraint not binding)
    const lineupKey = [...solution.selectedIds].sort((a, b) => a - b).join(",");
    if (seenLineups.has(lineupKey)) {
      log.debug("Duplicate lineup — skipping tier", { label: tierDef.label });
      continue;
    }
    seenLineups.add(lineupKey);

    // Build tier result
    let expectedPoints = 0;
    let totalRisk = 0;
    let totalCost = 0;
    const tierPlayers: FrontierPlayer[] = [];

    for (const id of solution.selectedIds) {
      const player = playerMap.get(id);
      const proj = projMap.get(id);
      if (!player || !proj) continue;

      const xp = proj.expectedPoints ?? 0;
      const risk = proj.riskScore ?? 0;
      const price = player.price ?? 0;

      expectedPoints += xp;
      totalRisk += risk;
      totalCost += price;

      tierPlayers.push({
        id: player.id,
        name: player.name ?? "Unknown",
        nickname: player.nickname ?? null,
        position: player.position,
        clubId: player.clubId ?? null,
        price,
        expectedPoints: xp,
        riskScore: risk,
        isCaptain: player.id === solution.captainId,
      });
    }

    tiers.push({
      label: tierDef.label,
      description: tierDef.description,
      color: tierDef.color,
      expectedPoints: Number(expectedPoints.toFixed(2)),
      totalRisk: Number(totalRisk.toFixed(3)),
      totalCost: Number(totalCost.toFixed(2)),
      captainId: solution.captainId,
      riskCap:
        tierDef.riskCap != null ? Number(tierDef.riskCap.toFixed(3)) : null,
      players: tierPlayers,
    });
  }

  log.info("Frontier complete", { tiersReturned: tiers.length, round });

  return { round, formation, budgetLimit, tiers };
}
