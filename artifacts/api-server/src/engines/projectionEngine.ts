import { db } from "@workspace/db";
import { PROJECTION_WEIGHTS } from "../config/projectionWeights";
import {
  getScoutsByPlayer,
  getAvailabilityByRound,
  upsertProjection,
} from "../repositories/projectionRepository";
import { getMatchesByRound } from "../repositories/matchRepository";
import type { Player } from "@workspace/db/schema";

interface ProjectionResult {
  expectedPoints: number;
  floorPoints: number;
  ceilingPoints: number;
  riskScore: number;
  playProbability: number;
  expectedMinutes: number;
  matchupScore: number;
  formScore: number;
  valueScore: number;
  cleanSheetProbability: number;
  attackParticipationProbability: number;
  recommendationScore: number;
  explanationJson: Record<string, unknown>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getScoutPoints(scout: Record<string, number | null>): number {
  const weights: Record<string, number> = {
    G: 8,
    A: 5,
    FT: 3,
    FD: 1.5,
    FS: 0.5,
    FC: -0.3,
    DE: 1,
    DS: 1.2,
    SG: 5,
    GC: -2,
    CV: -5,
    CA: -2,
    PP: -4,
    PS: 3,
    GS: 1,
    I: 0.8,
  };

  let total = 0;
  for (const [key, weight] of Object.entries(weights)) {
    total += (scout[key] ?? 0) * weight;
  }
  return total;
}

function isDefensivePosition(position: string): boolean {
  return ["GOL", "ZAG", "LAT"].includes(position);
}

function isAttackerPosition(position: string): boolean {
  return ["ATA", "MEI"].includes(position);
}

async function calculateProjection(
  player: Player,
  round: number,
  playProbability: number,
  expectedMinutes: number,
  isHome: boolean
): Promise<ProjectionResult> {
  const recentScouts = await getScoutsByPlayer(player.id, PROJECTION_WEIGHTS.recentFormRounds);
  const allScouts = await getScoutsByPlayer(player.id, 20);

  const averagePoints = player.averagePoints ?? 0;
  const price = player.price ?? 1;

  let formScore = averagePoints;
  if (recentScouts.length > 0) {
    const recentSum = recentScouts.reduce((sum, s) => sum + (s.points ?? 0), 0);
    formScore = recentSum / recentScouts.length;
  }

  const overallScore = allScouts.length > 0
    ? allScouts.reduce((sum, s) => sum + (s.points ?? 0), 0) / allScouts.length
    : averagePoints;

  const matchupScore = isHome ? PROJECTION_WEIGHTS.homeAdvantageMultiplier : 1.0;

  const cleanSheetProbability = isDefensivePosition(player.position)
    ? clamp(0.3 * matchupScore, 0, 0.9)
    : 0;

  const attackParticipationProbability = isAttackerPosition(player.position)
    ? clamp(0.4 * matchupScore * (formScore / Math.max(averagePoints, 1)), 0, 0.95)
    : 0;

  const positionBonus = PROJECTION_WEIGHTS.positionCleanSheetBonus[player.position as keyof typeof PROJECTION_WEIGHTS.positionCleanSheetBonus] ?? 0;
  const cleanSheetBonus = cleanSheetProbability * positionBonus;

  const weights = PROJECTION_WEIGHTS.weights;
  let baseExpected =
    weights.overallAverage * overallScore +
    weights.recentForm * formScore +
    weights.matchup * (averagePoints * (matchupScore - 1)) +
    weights.homeAdvantage * cleanSheetBonus;

  baseExpected = Math.max(0, baseExpected);

  const probMultiplier =
    playProbability >= PROJECTION_WEIGHTS.riskPenalty.mediumThreshold
      ? PROJECTION_WEIGHTS.riskPenalty.highProbability
      : playProbability >= PROJECTION_WEIGHTS.riskPenalty.lowThreshold
      ? PROJECTION_WEIGHTS.riskPenalty.mediumProbability
      : PROJECTION_WEIGHTS.riskPenalty.lowProbability;

  const expectedPoints = clamp(baseExpected * probMultiplier, 0, 50);
  const floorPoints = clamp(expectedPoints * 0.4, 0, expectedPoints);
  const ceilingPoints = clamp(expectedPoints * 1.6 + cleanSheetBonus, expectedPoints, 60);

  const riskScore = clamp(1 - playProbability + (formScore < 2 ? 0.1 : 0), 0, 1);
  const valueScore = price > 0 ? clamp(expectedPoints / price, 0, 5) : 0;

  const recommendationScore = clamp(
    expectedPoints * 0.5 +
      valueScore * 3 +
      formScore * 0.2 +
      (1 - riskScore) * 5 +
      cleanSheetBonus * 0.3,
    0,
    100
  );

  const explanationJson = {
    averagePoints,
    formScore: Number(formScore.toFixed(2)),
    overallScore: Number(overallScore.toFixed(2)),
    matchupScore,
    playProbability,
    expectedMinutes,
    cleanSheetProbability: Number(cleanSheetProbability.toFixed(2)),
    cleanSheetBonus: Number(cleanSheetBonus.toFixed(2)),
    attackParticipationProbability: Number(attackParticipationProbability.toFixed(2)),
    isHome,
    recentRoundsAnalyzed: recentScouts.length,
    position: player.position,
    price,
    valueScore: Number(valueScore.toFixed(3)),
  };

  return {
    expectedPoints: Number(expectedPoints.toFixed(2)),
    floorPoints: Number(floorPoints.toFixed(2)),
    ceilingPoints: Number(ceilingPoints.toFixed(2)),
    riskScore: Number(riskScore.toFixed(3)),
    playProbability,
    expectedMinutes,
    matchupScore: Number((matchupScore - 1).toFixed(3)),
    formScore: Number(formScore.toFixed(2)),
    valueScore: Number(valueScore.toFixed(3)),
    cleanSheetProbability: Number(cleanSheetProbability.toFixed(2)),
    attackParticipationProbability: Number(attackParticipationProbability.toFixed(2)),
    recommendationScore: Number(recommendationScore.toFixed(2)),
    explanationJson,
  };
}

export async function runProjectionEngine(round: number): Promise<void> {
  const players = await db.query.playersTable.findMany();
  const availabilities = await getAvailabilityByRound(round);
  const matches = await getMatchesByRound(round);

  const availMap = new Map(availabilities.map((a) => [a.playerId, a]));

  const homeClubIds = new Set(matches.map((m) => m.homeClubId).filter(Boolean) as number[]);

  let processed = 0;
  for (const player of players) {

    const avail = availMap.get(player.id);
    const playProbability = avail?.playProbability ?? 0.7;
    const expectedMinutes = avail?.expectedMinutes ?? 75;
    const isHome = player.clubId != null ? homeClubIds.has(player.clubId) : false;

    const proj = await calculateProjection(player, round, playProbability, expectedMinutes, isHome);

    await upsertProjection({
      playerId: player.id,
      round,
      ...proj,
      strategyType: "general",
    });

    processed++;
  }

  console.log(`[projectionEngine] Generated projections for ${processed} players in round ${round}`);
}
