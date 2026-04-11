import { db } from "@workspace/db";
import { playerAvailabilityTable } from "@workspace/db/schema";
import { getProjectionsByRound } from "../repositories/projectionRepository";
import { insertLineupSuggestion } from "../repositories/lineupRepository";
import { getMatchesByRound } from "../repositories/matchRepository";
import { LINEUP_CONFIG } from "../config/projectionWeights";
import type { PlayerProjection, Player } from "@workspace/db/schema";

export type StrategyType = "safe" | "aggressive" | "cost-benefit" | "antimassa";

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
  }
}

function getFormationRequirements(formation: string): Array<{ position: string; count: number }> {
  const config = LINEUP_CONFIG.formations[formation] ?? LINEUP_CONFIG.formations[LINEUP_CONFIG.defaultFormation]!;
  const slots: Array<{ position: string; count: number }> = [
    { position: "GOL", count: 1 },
  ];
  // Fill defensive/secondary positions first, then ATA before MEI.
  // This ensures premium ATA budget is allocated before MEI slots consume it,
  // preventing the pattern of 3 expensive MEIs leaving only garbage-tier ATAs.
  const FILL_ORDER = ["ZAG", "LAT", "ATA", "MEI"];
  for (const pos of FILL_ORDER) {
    const count = config[pos] ?? 0;
    if (count > 0) slots.push({ position: pos, count });
  }
  slots.push({ position: "TEC", count: 1 });
  return slots;
}

const MIN_GAMES_FOR_CAPTAIN = 3;

// Position multiplier for captain selection.
// ATA and MEI get a bonus so they are preferred when expected points are similar.
// A 1.20 multiplier means an ATA needs to be at most 17% worse than a defender
// to still be chosen — it won't override a clearly superior non-attacker.
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

function selectCaptain(
  fieldPlayers: PlayerWithProjection[],
  strategy: StrategyType,
  popularityMap: Map<number, number>
): PlayerWithProjection | undefined {
  if (fieldPlayers.length === 0) return undefined;

  // Only eligible players (minimum games played) can be captain.
  // Fall back to all field players if none meet the threshold.
  const eligible = fieldPlayers.filter(
    (pw) => (pw.player.gamesPlayed ?? 0) >= MIN_GAMES_FOR_CAPTAIN
  );
  const pool = eligible.length > 0 ? eligible : fieldPlayers;

  return [...pool].sort((a, b) => {
    const multA = captainPositionMultiplier(a.player.position);
    const multB = captainPositionMultiplier(b.player.position);

    if (strategy === "antimassa") {
      const popA = popularityMap.get(a.player.id) ?? 0.5;
      const popB = popularityMap.get(b.player.id) ?? 0.5;
      const scoreA = (a.projection.expectedPoints ?? 0) * (1 - popA * 0.5) * multA;
      const scoreB = (b.projection.expectedPoints ?? 0) * (1 - popB * 0.5) * multB;
      return scoreB - scoreA;
    }
    if (strategy === "safe") {
      const scoreA = ((a.projection.floorPoints ?? 0) + (a.projection.expectedPoints ?? 0)) * multA;
      const scoreB = ((b.projection.floorPoints ?? 0) + (b.projection.expectedPoints ?? 0)) * multB;
      return scoreB - scoreA;
    }
    if (strategy === "aggressive") {
      return (b.projection.ceilingPoints ?? 0) * multB - (a.projection.ceilingPoints ?? 0) * multA;
    }
    // cost-benefit and default: highest expected points, prefer attackers
    return (b.projection.expectedPoints ?? 0) * multB - (a.projection.expectedPoints ?? 0) * multA;
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

  // Map each clubId to its opponent's clubId for this round.
  // Used to prevent placing two players from opposing clubs in the same position.
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

      // Always take the most restrictive play_probability:
      // - Use latest availability record if it's lower than the stored projection value
      // - Hard-block suspended/nulo players regardless of what's stored in projections
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

  const playerProjections = [...allPlayerProjections].sort(
    (a, b) => scoringFn(b) - scoringFn(a)
  );

  const slotRequirements = getFormationRequirements(formation);
  const selected: PlayerWithProjection[] = [];
  const clubCount = new Map<number, number>();
  // Tracks how many players from each club are in each position.
  // Key: `${clubId}_${position}`. Max 1 per club per position.
  const clubPositionCount = new Map<string, number>();
  let totalCost = 0;

  // Returns the reserved cost needed to fill N future slots at a given position.
  // Uses a quality-filtered pool (top 75% by xPts) when enough players are available,
  // so the algorithm reserves budget for decent players — not rock-bottom garbage picks.
  // Falls back to cheapest-overall if the pool is too small to filter safely.
  const getMinSumForNSlots = (position: string, n: number, excludeIds: Set<number>): number => {
    const available = playerProjections.filter(
      (pw) =>
        pw.player.position === position &&
        !excludeIds.has(pw.player.id) &&
        (pw.projection.playProbability ?? 0) > 0.1
    );

    // Only filter when we have clearly more than needed (avoids over-restricting small pools)
    const minPoolForFilter = n + 4;
    if (available.length >= minPoolForFilter) {
      // Sort ascending by xPts → cut bottom 25% (garbage tier)
      const sorted = [...available].sort(
        (a, b) => (a.projection.expectedPoints ?? 0) - (b.projection.expectedPoints ?? 0)
      );
      const cutoff = Math.floor(available.length * 0.25);
      const qualityPool = sorted.slice(cutoff); // top 75% by quality
      const qualityPrices = qualityPool
        .map((pw) => pw.player.price ?? 0)
        .sort((a, b) => a - b)
        .slice(0, n);
      // Only use quality reservation if we got all N slots covered
      if (qualityPrices.length === n) {
        return qualityPrices.reduce((sum, p) => sum + p, 0);
      }
    }

    // Fallback: cheapest available (ensures we never block a valid lineup)
    return available
      .map((pw) => pw.player.price ?? 0)
      .sort((a, b) => a - b)
      .slice(0, n)
      .reduce((sum, p) => sum + p, 0);
  };

  for (let slotIdx = 0; slotIdx < slotRequirements.length; slotIdx++) {
    const { position, count } = slotRequirements[slotIdx]!;

    const candidates = playerProjections.filter((pw) => {
      const alreadySelected = selected.some((s) => s.player.id === pw.player.id);
      const clubId = pw.player.clubId ?? 0;
      const clubUsed = clubCount.get(clubId) ?? 0;
      const clubPosKey = `${clubId}_${position}`;
      const clubPosUsed = clubPositionCount.get(clubPosKey) ?? 0;
      // Opposing-clubs constraint: don't pick a player whose club is facing a club
      // that already has a player in this position.
      const opponentId = opponentMap.get(clubId);
      const opponentPosKey = opponentId ? `${opponentId}_${position}` : null;
      const opponentAlreadyInPos = opponentPosKey ? (clubPositionCount.get(opponentPosKey) ?? 0) > 0 : false;
      const playProb = pw.projection.playProbability ?? 0;
      return (
        pw.player.position === position &&
        !alreadySelected &&
        clubUsed < LINEUP_CONFIG.maxPlayersPerClub &&
        clubPosUsed < 1 &&
        !opponentAlreadyInPos &&
        playProb > 0.1
      );
    });

    let filled = 0;
    for (const candidate of candidates) {
      if (filled >= count) break;

      // Re-check constraints inside the loop: the candidates list was pre-filtered before
      // any selections in this slot, so constraints can become violated between iterations.
      const candidateClubId = candidate.player.clubId ?? 0;
      const candidateClubPosKey = `${candidateClubId}_${candidate.player.position}`;
      if ((clubPositionCount.get(candidateClubPosKey) ?? 0) >= 1) continue;
      // Opposing-clubs: if the candidate's opponent club already has a player in this position, skip.
      const candidateOpponentId = opponentMap.get(candidateClubId);
      const candidateOpponentPosKey = candidateOpponentId ? `${candidateOpponentId}_${candidate.player.position}` : null;
      if (candidateOpponentPosKey && (clubPositionCount.get(candidateOpponentPosKey) ?? 0) > 0) continue;

      const price = candidate.player.price ?? 0;

      const excludeIds = new Set(selected.map((s) => s.player.id));
      excludeIds.add(candidate.player.id);

      // Reserve the actual minimum cost to fill all future positions
      let futureMinCost = 0;
      for (let futureIdx = slotIdx + 1; futureIdx < slotRequirements.length; futureIdx++) {
        const future = slotRequirements[futureIdx]!;
        futureMinCost += getMinSumForNSlots(future.position, future.count, excludeIds);
      }

      // Also reserve for remaining slots at the current position (after this one)
      const currentPositionRemaining = count - filled - 1;
      const minCostCurrentPosition = currentPositionRemaining > 0
        ? getMinSumForNSlots(position, currentPositionRemaining, excludeIds)
        : 0;

      const remainingBudget = budgetLimit - totalCost;
      const reserveNeeded = futureMinCost + minCostCurrentPosition;

      if (price > remainingBudget - reserveNeeded) continue;

      selected.push(candidate);
      totalCost += price;
      const clubId = candidate.player.clubId ?? 0;
      clubCount.set(clubId, (clubCount.get(clubId) ?? 0) + 1);
      const clubPosKey = `${clubId}_${candidate.player.position}`;
      clubPositionCount.set(clubPosKey, (clubPositionCount.get(clubPosKey) ?? 0) + 1);
      filled++;
    }
  }

  const filledPositions: Record<string, number> = {};
  for (const pw of selected) {
    filledPositions[pw.player.position] = (filledPositions[pw.player.position] ?? 0) + 1;
  }
  const missingSlots: string[] = [];
  for (const { position, count } of slotRequirements) {
    const filled = filledPositions[position] ?? 0;
    if (filled < count) {
      missingSlots.push(`${position}: need ${count}, got ${filled}`);
    }
  }

  if (missingSlots.length > 0) {
    throw new Error(
      `Could not fill lineup with given budget ${budgetLimit} and formation ${formation}. Missing: ${missingSlots.join(", ")}. ` +
      `Try increasing budget or relaxing formation.`
    );
  }

  if (totalCost > budgetLimit) {
    throw new Error(
      `Generated lineup cost ${totalCost.toFixed(2)} exceeds budget ${budgetLimit}. ` +
      `Try increasing budget.`
    );
  }

  const fieldPlayers = selected.filter((pw) => pw.player.position !== "TEC");
  const captain = selectCaptain(fieldPlayers, strategy, popularityMap);
  const coach = selected.find((pw) => pw.player.position === "TEC") ?? null;

  const baseExpectedPoints = selected.reduce((sum, pw) => sum + (pw.projection.expectedPoints ?? 0), 0);
  const captainBonus = captain ? (captain.projection.expectedPoints ?? 0) : 0;
  const captainExpectedPointsDoubled = Number((baseExpectedPoints + captainBonus).toFixed(2));

  const avgRiskScore =
    selected.length > 0
      ? selected.reduce((sum, pw) => sum + (pw.projection.riskScore ?? 0), 0) / selected.length
      : 1;

  const lineupPlayers = selected.map((pw, idx) => ({
    playerId: pw.player.id,
    slot: `${pw.player.position}_${idx}`,
    position: pw.player.position,
    orderIndex: idx,
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
      captainPlayerId: captain?.player.id ?? null,
      coachPlayerId: coach?.player.id ?? null,
    },
    lineupPlayers
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
    captainPlayerId: captain?.player.id ?? null,
    coachPlayerId: coach?.player.id ?? null,
    players: selected.map((pw, idx) => ({
      playerId: pw.player.id,
      player: pw.player,
      projection: pw.projection,
      slot: `${pw.player.position}_${idx}`,
      position: pw.player.position,
      orderIndex: idx,
      isCaptain: pw.player.id === captain?.player.id,
    })),
  };
}
