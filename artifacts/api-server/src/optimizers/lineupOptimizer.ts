import { db } from "@workspace/db";
import { getProjectionsByRound } from "../repositories/projectionRepository";
import { insertLineupSuggestion } from "../repositories/lineupRepository";
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

function getScoringFn(
  strategy: StrategyType,
  popularityMap: Map<number, number>
): (pw: PlayerWithProjection) => number {
  switch (strategy) {
    case "safe":
      return (pw) =>
        (pw.projection.floorPoints ?? 0) * 0.6 +
        (pw.projection.expectedPoints ?? 0) * 0.4 -
        (pw.projection.riskScore ?? 0) * 5;
    case "aggressive":
      return (pw) =>
        (pw.projection.ceilingPoints ?? 0) * 0.7 +
        (pw.projection.expectedPoints ?? 0) * 0.3;
    case "cost-benefit":
      return (pw) =>
        (pw.projection.valueScore ?? 0) * 4 +
        (pw.projection.recommendationScore ?? 0) * 0.3;
    case "antimassa": {
      return (pw) => {
        const popNorm = popularityMap.get(pw.player.id) ?? 0.5;
        const expected = pw.projection.expectedPoints ?? 0;
        const value = pw.projection.valueScore ?? 0;
        const explanation = pw.projection.explanationJson as Record<string, unknown> | null;
        const differentialScore = (explanation?.differentialScore as number | undefined) ?? 0;
        const isTrap = (explanation?.isTrap as boolean | undefined) ?? false;
        const trapPenalty = isTrap ? 5 : 0;
        return expected * (1 - popNorm * 0.7) + value * 2 + differentialScore * 0.3 - trapPenalty;
      };
    }
  }
}

function getFormationRequirements(formation: string): Array<{ position: string; count: number }> {
  const config = LINEUP_CONFIG.formations[formation] ?? LINEUP_CONFIG.formations[LINEUP_CONFIG.defaultFormation]!;
  const slots: Array<{ position: string; count: number }> = [
    { position: "GOL", count: 1 },
  ];
  for (const [pos, count] of Object.entries(config)) {
    if (count > 0) slots.push({ position: pos, count });
  }
  slots.push({ position: "TEC", count: 1 });
  return slots;
}

function selectCaptain(
  fieldPlayers: PlayerWithProjection[],
  strategy: StrategyType,
  popularityMap: Map<number, number>
): PlayerWithProjection | undefined {
  if (fieldPlayers.length === 0) return undefined;
  return [...fieldPlayers].sort((a, b) => {
    if (strategy === "antimassa") {
      const popA = popularityMap.get(a.player.id) ?? 0.5;
      const popB = popularityMap.get(b.player.id) ?? 0.5;
      const scoreA = (a.projection.expectedPoints ?? 0) * (1 - popA * 0.5);
      const scoreB = (b.projection.expectedPoints ?? 0) * (1 - popB * 0.5);
      return scoreB - scoreA;
    }
    if (strategy === "safe") {
      return ((b.projection.floorPoints ?? 0) + (b.projection.expectedPoints ?? 0)) -
        ((a.projection.floorPoints ?? 0) + (a.projection.expectedPoints ?? 0));
    }
    if (strategy === "aggressive") {
      return (b.projection.ceilingPoints ?? 0) - (a.projection.ceilingPoints ?? 0);
    }
    return (b.projection.expectedPoints ?? 0) - (a.projection.expectedPoints ?? 0);
  })[0];
}

export async function generateLineup(request: LineupRequest): Promise<LineupResult> {
  const { round, strategy, formation = LINEUP_CONFIG.defaultFormation } = request;
  const budgetLimit = request.budgetLimit ?? LINEUP_CONFIG.defaultBudget;

  const projections = await getProjectionsByRound(round);
  const players = await db.query.playersTable.findMany();
  const playerMap = new Map(players.map((p) => [p.id, p]));

  if (projections.length === 0) {
    throw new Error(`No projections found for round ${round}. Please sync data first.`);
  }

  const allPlayerProjections: PlayerWithProjection[] = projections
    .map((proj) => {
      const player = playerMap.get(proj.playerId);
      if (!player) return null;
      return { player, projection: proj };
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
  let totalCost = 0;

  const minCostByPosition = new Map<string, number>();
  for (const { position } of slotRequirements) {
    const cheapest = playerProjections
      .filter((pw) => pw.player.position === position && (pw.projection.playProbability ?? 0) > 0.1)
      .map((pw) => pw.player.price ?? 0)
      .sort((a, b) => a - b)[0] ?? 0;
    minCostByPosition.set(position, cheapest);
  }

  for (let slotIdx = 0; slotIdx < slotRequirements.length; slotIdx++) {
    const { position, count } = slotRequirements[slotIdx]!;

    const candidates = playerProjections.filter((pw) => {
      const alreadySelected = selected.some((s) => s.player.id === pw.player.id);
      const clubId = pw.player.clubId ?? 0;
      const clubUsed = clubCount.get(clubId) ?? 0;
      const playProb = pw.projection.playProbability ?? 0;
      return (
        pw.player.position === position &&
        !alreadySelected &&
        clubUsed < LINEUP_CONFIG.maxPlayersPerClub &&
        playProb > 0.1
      );
    });

    let futureMinCost = 0;
    for (let futureIdx = slotIdx + 1; futureIdx < slotRequirements.length; futureIdx++) {
      const future = slotRequirements[futureIdx]!;
      futureMinCost += (minCostByPosition.get(future.position) ?? 0) * future.count;
    }

    let filled = 0;
    for (const candidate of candidates) {
      if (filled >= count) break;
      const price = candidate.player.price ?? 0;

      const currentPositionRemaining = count - filled - 1;
      const minCostCurrentPosition = (minCostByPosition.get(position) ?? 0) * currentPositionRemaining;

      const remainingBudget = budgetLimit - totalCost;
      const reserveNeeded = futureMinCost + minCostCurrentPosition;

      if (price > remainingBudget - reserveNeeded) continue;

      selected.push(candidate);
      totalCost += price;
      const clubId = candidate.player.clubId ?? 0;
      clubCount.set(clubId, (clubCount.get(clubId) ?? 0) + 1);
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
