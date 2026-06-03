import { db } from "@workspace/db";
import { playerAvailabilityTable } from "@workspace/db/schema";
import { getProjectionsByRound } from "../repositories/projectionRepository";
import { insertLineupSuggestion, insertLineupReserves } from "../repositories/lineupRepository";
import { getMatchesByRound } from "../repositories/matchRepository";
import { selectReserves, type ReservePlayer } from "../services/reserveService";
import { LINEUP_CONFIG } from "../config/projectionWeights";
import { createLogger } from "../lib/logger";
import type { PlayerProjection, Player } from "@workspace/db/schema";
import { solveLineupILP, type IlpCandidate, CAPTAIN_MIN_GAMES } from "./ilpSolver";

const log = createLogger("lineup-optimizer");

export type StrategyType = "safe" | "aggressive" | "cost-benefit" | "antimassa" | "valorizacao";

export interface LineupRequest {
  round: number;
  budgetLimit?: number;
  formation?: string;
  strategy: StrategyType;
}

interface PlayerWithProjection {
  player: Player;
  projection: PlayerProjection;
}

interface LineupResult {
  id: number;
  round: number;
  strategyType: string;
  formation: string;
  budgetLimit: number;
  totalCost: number;
  expectedPoints: number;
  captainExpectedPointsDoubled: number;
  riskScore: number;
  captainPlayerId: number | null;
  coachPlayerId: number | null;
  players: Array<{
    playerId: number;
    player: Player;
    projection: PlayerProjection;
    slot: string;
    position: string;
    orderIndex: number;
    isCaptain: boolean;
  }>;
  reserves: ReservePlayer[];
}

function normalizePopularity(players: PlayerWithProjection[]): Map<number, number> {
  const popularities = players
    .map((pw) => pw.player.popularity ?? 0)
    .filter((p) => p > 0);
  const maxPop = Math.max(...popularities, 1);
  return new Map(players.map((pw) => [pw.player.id, (pw.player.popularity ?? 0) / maxPop]));
}

// Penalises players with too few games played (small sample = unreliable average)
function samplePenalty(pw: PlayerWithProjection): number {
  const games = pw.player.gamesPlayed ?? 0;
  if (games === 0) return 6;
  if (games < 3) return (3 - games) * 2; // -4 for 1 game, -2 for 2 games
  return 0;
}

function getScoringFn(
  strategy: StrategyType,
  popularityMap: Map<number, number>
): (pw: PlayerWithProjection) => number {
  switch (strategy) {
    case "safe":
      // Blend floor (consistency), expected points (quality) AND value (cost-efficiency).
      // This prevents overspending on a single premium position at the expense of others.
      return (pw) =>
        (pw.projection.floorPoints ?? 0) * 0.3 +
        (pw.projection.expectedPoints ?? 0) * 0.3 +
        (pw.projection.valueScore ?? 0) * 8 -
        (pw.projection.riskScore ?? 0) * 5 -
        samplePenalty(pw);
    case "aggressive":
      return (pw) =>
        (pw.projection.ceilingPoints ?? 0) * 0.7 +
        (pw.projection.expectedPoints ?? 0) * 0.3 -
        samplePenalty(pw) * 0.5;
    case "cost-benefit":
      return (pw) =>
        (pw.projection.valueScore ?? 0) * 4 +
        (pw.projection.recommendationScore ?? 0) * 0.3 -
        samplePenalty(pw);
    case "antimassa": {
      return (pw) => {
        const popNorm = popularityMap.get(pw.player.id) ?? 0.5;
        const expected = pw.projection.expectedPoints ?? 0;
        const value = pw.projection.valueScore ?? 0;
        const explanation = pw.projection.explanationJson as Record<string, unknown> | null;
        const differentialScore = (explanation?.differentialScore as number | undefined) ?? 0;
        const isTrap = (explanation?.isTrap as boolean | undefined) ?? false;
        const trapPenalty = isTrap ? 5 : 0;
        return expected * (1 - popNorm * 0.7) + value * 2 + differentialScore * 0.3 - trapPenalty - samplePenalty(pw);
      };
    }
    case "valorizacao": {
      return (pw) => {
        const explanation = pw.projection.explanationJson as Record<string, unknown> | null;
        const priceVariation = (explanation?.priceVariation as number | undefined) ?? (pw.player.priceVariation ?? 0);
        const formTrend = (explanation?.formTrend as number | undefined) ?? 0;
        const shortAvg = (explanation?.shortAvg as number | undefined) ?? 0;
        const mediumAvg = (explanation?.mediumAvg as number | undefined) ?? 0;
        const expected = pw.projection.expectedPoints ?? 0;
        const isTrap = (explanation?.isTrap as boolean | undefined) ?? false;

        const variationSignal = priceVariation * 3;
        const momentumSignal = shortAvg > 0 && mediumAvg > 0
          ? ((shortAvg - mediumAvg) / Math.max(mediumAvg, 1)) * 8
          : 0;
        const formTrendBonus = formTrend * 4;
        const trapPenalty = isTrap ? 6 : 0;

        return (
          variationSignal +
          momentumSignal +
          formTrendBonus +
          expected * 0.25 +
          (pw.projection.valueScore ?? 0) * 2 -
          trapPenalty -
          samplePenalty(pw)
        );
      };
    }
  }
}

function getFormationRequirements(formation: string): Array<{ position: string; count: number }> {
  const config = LINEUP_CONFIG.formations[formation] ?? LINEUP_CONFIG.formations[LINEUP_CONFIG.defaultFormation]!;
  const slots: Array<{ position: string; count: number }> = [
    { position: "GOL", count: 1 },
  ];
  const FILL_ORDER = ["ZAG", "LAT", "ATA", "MEI"];
  for (const pos of FILL_ORDER) {
    const count = config[pos] ?? 0;
    if (count > 0) slots.push({ position: pos, count });
  }
  slots.push({ position: "TEC", count: 1 });
  return slots;
}

const CAPTAIN_POSITION_MULTIPLIER: Record<string, number> = {
  ATA: 1.20,
  MEI: 1.10,
  LAT: 1.00,
  ZAG: 1.00,
  GOL: 0.95,
};

function captainPositionMultiplier(position: string): number {
  return CAPTAIN_POSITION_MULTIPLIER[position] ?? 1.0;
}

/**
 * Strategy-specific captain preference score — mirrors the sort key used in
 * selectCaptain so the ILP captain variable chooses the same player that
 * selectCaptain would have chosen post-hoc.
 */
function computeCaptainScore(
  pw: PlayerWithProjection,
  strategy: StrategyType,
  popularityMap: Map<number, number>
): number {
  const mult = captainPositionMultiplier(pw.player.position);
  switch (strategy) {
    case "safe":
      return ((pw.projection.floorPoints ?? 0) + (pw.projection.expectedPoints ?? 0)) * mult;
    case "aggressive":
      return (pw.projection.ceilingPoints ?? 0) * mult;
    case "antimassa": {
      const popNorm = popularityMap.get(pw.player.id) ?? 0.5;
      return (pw.projection.expectedPoints ?? 0) * (1 - popNorm * 0.5) * mult;
    }
    default:
      return (pw.projection.expectedPoints ?? 0) * mult;
  }
}

/**
 * Fallback captain selector — used only when the ILP does not return a captain
 * variable (should not happen in normal operation).
 */
function selectCaptain(
  fieldPlayers: PlayerWithProjection[],
  strategy: StrategyType,
  popularityMap: Map<number, number>
): PlayerWithProjection | undefined {
  if (fieldPlayers.length === 0) return undefined;

  const eligible = fieldPlayers.filter(
    (pw) => (pw.player.gamesPlayed ?? 0) >= CAPTAIN_MIN_GAMES
  );
  const pool = eligible.length > 0 ? eligible : fieldPlayers;

  return [...pool].sort((a, b) => {
    const scoreA = computeCaptainScore(a, strategy, popularityMap);
    const scoreB = computeCaptainScore(b, strategy, popularityMap);
    return scoreB - scoreA;
  })[0];
}

export async function generateLineup(request: LineupRequest): Promise<LineupResult> {
  const { round, strategy, formation = LINEUP_CONFIG.defaultFormation } = request;
  const budgetLimit = request.budgetLimit ?? LINEUP_CONFIG.defaultBudget;

  const [projections, players, availabilities, roundMatches] = await Promise.all([
    getProjectionsByRound(round),
    db.query.playersTable.findMany(),
    db.select().from(playerAvailabilityTable),
    getMatchesByRound(round),
  ]);

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const availMap = new Map(availabilities.map((a) => [a.playerId, a.playProbability]));

  const opponentMap = new Map<number, number>();
  for (const match of roundMatches) {
    if (match.homeClubId && match.awayClubId) {
      opponentMap.set(match.homeClubId, match.awayClubId);
      opponentMap.set(match.awayClubId, match.homeClubId);
    }
  }

  if (projections.length === 0) {
    throw new Error(`No projections found for round ${round}. Please sync data first.`);
  }

  const UNAVAILABLE_STATUSES = new Set(["Suspenso", "Nulo", "Contundido"]);

  const allPlayerProjections: PlayerWithProjection[] = projections
    .map((proj) => {
      const player = playerMap.get(proj.playerId);
      if (!player) return null;

      const availPlayProb = availMap.get(proj.playerId);
      let finalPlayProb: number | null = proj.playProbability;
      if (availPlayProb != null) {
        finalPlayProb = Math.min(proj.playProbability ?? 1, availPlayProb);
      }
      if (player.status != null && UNAVAILABLE_STATUSES.has(player.status)) {
        finalPlayProb = 0;
      }

      return {
        player,
        projection: { ...proj, playProbability: finalPlayProb } as typeof proj,
      };
    })
    .filter((x): x is PlayerWithProjection => x !== null);

  const popularityMap = normalizePopularity(allPlayerProjections);
  const scoringFn = getScoringFn(strategy, popularityMap);
  const slotRequirements = getFormationRequirements(formation);

  // ── Build ILP candidate list ───────────────────────────────────────────────
  const ilpCandidates: IlpCandidate[] = allPlayerProjections
    .filter((pw) => (pw.projection.playProbability ?? 0) > 0.1)
    .map((pw) => ({
      id: pw.player.id,
      position: pw.player.position,
      clubId: pw.player.clubId ?? 0,
      price: pw.player.price ?? 0,
      score: scoringFn(pw),
      captainScore:
        pw.player.position !== "TEC"
          ? computeCaptainScore(pw, strategy, popularityMap)
          : 0,
      gamesPlayed: pw.player.gamesPlayed ?? 0,
      isFieldPlayer: pw.player.position !== "TEC",
    }));

  log.info("Running ILP optimizer", {
    round,
    strategy,
    formation,
    budgetLimit,
    candidatePool: ilpCandidates.length,
  });

  // ── Solve with ILP ─────────────────────────────────────────────────────────
  const solution = solveLineupILP(ilpCandidates, {
    slots: slotRequirements,
    budgetLimit,
    maxPlayersPerClub: LINEUP_CONFIG.maxPlayersPerClub,
    opponentMap,
  });

  if (!solution.feasible) {
    throw new Error(
      `Could not fill lineup with given budget ${budgetLimit} and formation ${formation}. ` +
        `Try increasing budget or relaxing formation.`
    );
  }

  // ── Map selectedIds back to PlayerWithProjection[], ordered by formation ───
  const projectionMap = new Map(allPlayerProjections.map((pw) => [pw.player.id, pw]));
  const selected: PlayerWithProjection[] = [];

  for (const { position } of slotRequirements) {
    const posPlayers = [...solution.selectedIds]
      .map((id) => projectionMap.get(id))
      .filter((pw): pw is PlayerWithProjection => pw != null && pw.player.position === position)
      .sort((a, b) => scoringFn(b) - scoringFn(a)); // stable descending order within position
    selected.push(...posPlayers);
  }

  // Sanity check — ILP guarantees this, but guard against edge cases
  const filledPositions: Record<string, number> = {};
  for (const pw of selected) {
    filledPositions[pw.player.position] = (filledPositions[pw.player.position] ?? 0) + 1;
  }
  const missingSlots: string[] = [];
  for (const { position, count } of slotRequirements) {
    const filled = filledPositions[position] ?? 0;
    if (filled < count) missingSlots.push(`${position}: need ${count}, got ${filled}`);
  }
  if (missingSlots.length > 0) {
    throw new Error(
      `ILP produced incomplete lineup for budget ${budgetLimit} / formation ${formation}. ` +
        `Missing: ${missingSlots.join(", ")}.`
    );
  }

  const totalCost = selected.reduce((sum, pw) => sum + (pw.player.price ?? 0), 0);
  if (totalCost > budgetLimit) {
    throw new Error(
      `ILP lineup cost ${totalCost.toFixed(2)} exceeds budget ${budgetLimit}.`
    );
  }

  // ── Captain selection ──────────────────────────────────────────────────────
  const fieldPlayers = selected.filter((pw) => pw.player.position !== "TEC");
  const captainPw =
    solution.captainId != null
      ? (projectionMap.get(solution.captainId) ?? selectCaptain(fieldPlayers, strategy, popularityMap))
      : selectCaptain(fieldPlayers, strategy, popularityMap);

  const coach = selected.find((pw) => pw.player.position === "TEC") ?? null;

  // ── Expected points ────────────────────────────────────────────────────────
  const baseExpectedPoints = selected.reduce(
    (sum, pw) => sum + (pw.projection.expectedPoints ?? 0),
    0
  );
  const captainBonus = captainPw ? (captainPw.projection.expectedPoints ?? 0) : 0;
  const captainExpectedPointsDoubled = Number((baseExpectedPoints + captainBonus).toFixed(2));

  const avgRiskScore =
    selected.length > 0
      ? selected.reduce((sum, pw) => sum + (pw.projection.riskScore ?? 0), 0) / selected.length
      : 1;

  log.info("Lineup generated", {
    round,
    strategy,
    formation,
    totalCost: totalCost.toFixed(2),
    expectedPoints: captainExpectedPointsDoubled,
    captainId: captainPw?.player.id ?? null,
    ilpScore: solution.totalScore.toFixed(3),
  });

  // ── Persist ────────────────────────────────────────────────────────────────
  const lineupPlayers = selected.map((pw, idx) => ({
    playerId: pw.player.id,
    slot: `${pw.player.position}_${idx}`,
    position: pw.player.position,
    orderIndex: idx,
    projectedPoints: pw.projection.expectedPoints ?? null,
  }));

  const saved = await insertLineupSuggestion(
    {
      round,
      strategyType: strategy,
      formation,
      budgetLimit,
      totalCost: Number(totalCost.toFixed(2)),
      expectedPoints: Number(captainExpectedPointsDoubled.toFixed(2)),
      riskScore: Number(avgRiskScore.toFixed(3)),
      captainPlayerId: captainPw?.player.id ?? null,
      coachPlayerId: coach?.player.id ?? null,
    },
    lineupPlayers
  );

  const mainLineupIds = new Set(selected.map((pw) => pw.player.id));
  const formationPositions = slotRequirements.map((s) => s.position);
  const rawProjectionsForReserves = allPlayerProjections.map((pw) => ({
    playerId: pw.player.id,
    playerName: pw.player.name ?? "Unknown",
    playerNickname: pw.player.nickname ?? null,
    position: pw.player.position,
    clubId: pw.player.clubId ?? null,
    expectedPoints: pw.projection.expectedPoints ?? 0,
    floorPoints: pw.projection.floorPoints ?? 0,
    ceilingPoints: pw.projection.ceilingPoints ?? 0,
    price: pw.player.price ?? 0,
    playProbability: pw.projection.playProbability ?? 0,
  }));

  const reserves = selectReserves(rawProjectionsForReserves, mainLineupIds, formationPositions);

  await insertLineupReserves(
    saved.id,
    reserves.map((r) => ({
      playerId: r.playerId,
      position: r.position,
      isLuxuryReserve: r.isLuxuryReserve,
      expectedPoints: r.expectedPoints,
      floorPoints: r.floorPoints,
      ceilingPoints: r.ceilingPoints,
      price: r.price,
      orderIndex: r.orderIndex,
    }))
  );

  return {
    id: saved.id,
    round,
    strategyType: strategy,
    formation,
    budgetLimit,
    totalCost: Number(totalCost.toFixed(2)),
    expectedPoints: Number(captainExpectedPointsDoubled.toFixed(2)),
    captainExpectedPointsDoubled,
    riskScore: Number(avgRiskScore.toFixed(3)),
    captainPlayerId: captainPw?.player.id ?? null,
    coachPlayerId: coach?.player.id ?? null,
    players: selected.map((pw, idx) => ({
      playerId: pw.player.id,
      player: pw.player,
      projection: pw.projection,
      slot: `${pw.player.position}_${idx}`,
      position: pw.player.position,
      orderIndex: idx,
      isCaptain: pw.player.id === captainPw?.player.id,
    })),
    reserves,
  };
}
