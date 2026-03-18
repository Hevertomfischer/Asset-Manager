import { db } from "@workspace/db";
import { getProjectionsByRound } from "../repositories/projectionRepository";
import { insertLineupSuggestion } from "../repositories/lineupRepository";
import { LINEUP_CONFIG } from "../config/projectionWeights";
import type { PlayerProjection, Player } from "@workspace/db/schema";

export type StrategyType = "safe" | "aggressive" | "cost-benefit";

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

function getScoringFn(strategy: StrategyType): (proj: PlayerProjection) => number {
  switch (strategy) {
    case "safe":
      return (p) => (p.floorPoints ?? 0) * 0.6 + (p.expectedPoints ?? 0) * 0.4 - (p.riskScore ?? 0) * 5;
    case "aggressive":
      return (p) => (p.ceilingPoints ?? 0) * 0.7 + (p.expectedPoints ?? 0) * 0.3;
    case "cost-benefit":
      return (p) => (p.valueScore ?? 0) * 4 + (p.recommendationScore ?? 0) * 0.3;
  }
}

function getFormationRequirements(formation: string): Record<string, number> {
  const config = LINEUP_CONFIG.formations[formation] ?? LINEUP_CONFIG.formations[LINEUP_CONFIG.defaultFormation]!;
  return { ...config, GOL: 1, TEC: 1 };
}

export async function generateLineup(request: LineupRequest): Promise<LineupResult> {
  const { round, strategy, formation = LINEUP_CONFIG.defaultFormation } = request;
  const budgetLimit = request.budgetLimit ?? LINEUP_CONFIG.defaultBudget;

  const projections = await getProjectionsByRound(round);
  const players = await db.query.playersTable.findMany();
  const playerMap = new Map(players.map((p) => [p.id, p]));

  const scoringFn = getScoringFn(strategy);

  const playerProjections: PlayerWithProjection[] = projections
    .map((proj) => {
      const player = playerMap.get(proj.playerId);
      if (!player) return null;
      return { player, projection: proj };
    })
    .filter((x): x is PlayerWithProjection => x !== null)
    .sort((a, b) => scoringFn(b.projection) - scoringFn(a.projection));

  const requirements = getFormationRequirements(formation);
  const selected: PlayerWithProjection[] = [];
  const clubCount = new Map<number, number>();
  const positionCount: Record<string, number> = {};
  let totalCost = 0;

  const available = playerProjections.filter((pw) => {
    const playProb = pw.projection.playProbability ?? 0;
    return playProb > 0.1 && (pw.player.price ?? 0) <= budgetLimit;
  });

  const fieldPositions = Object.entries(requirements).filter(([pos]) => pos !== "TEC");
  const coachPositions = [["TEC", 1]];

  const allPositionGroups = [...fieldPositions, ...coachPositions];

  for (const [position, count] of allPositionGroups) {
    positionCount[position] = 0;
    const needed = count as number;

    const candidates = available.filter((pw) => {
      const clubId = pw.player.clubId ?? 0;
      const clubUsed = clubCount.get(clubId) ?? 0;
      const alreadySelected = selected.includes(pw);
      return (
        pw.player.position === position &&
        !alreadySelected &&
        clubUsed < LINEUP_CONFIG.maxPlayersPerClub
      );
    });

    let filled = 0;
    let budget = budgetLimit - totalCost;

    for (const candidate of candidates) {
      if (filled >= needed) break;
      const price = candidate.player.price ?? 0;
      const remainingSlots = allPositionGroups
        .slice(allPositionGroups.indexOf([position, count]))
        .reduce((sum, [, c]) => sum + (c as number), 0) - filled - 1;

      if (price > budget - remainingSlots * 1) continue;

      selected.push(candidate);
      totalCost += price;
      budget -= price;
      const clubId = candidate.player.clubId ?? 0;
      clubCount.set(clubId, (clubCount.get(clubId) ?? 0) + 1);
      positionCount[position] = (positionCount[position] ?? 0) + 1;
      filled++;
    }
  }

  const expectedPoints = selected.reduce((sum, pw) => sum + (pw.projection.expectedPoints ?? 0), 0);
  const avgRiskScore =
    selected.length > 0
      ? selected.reduce((sum, pw) => sum + (pw.projection.riskScore ?? 0), 0) / selected.length
      : 1;

  const fieldPlayers = selected.filter((pw) => pw.player.position !== "TEC");
  const captain = fieldPlayers.sort(
    (a, b) => (b.projection.expectedPoints ?? 0) - (a.projection.expectedPoints ?? 0)
  )[0];
  const coach = selected.find((pw) => pw.player.position === "TEC") ?? null;

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
      expectedPoints: Number(expectedPoints.toFixed(2)),
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
    expectedPoints: Number(expectedPoints.toFixed(2)),
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
