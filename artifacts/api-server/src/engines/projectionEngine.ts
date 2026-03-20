import { db } from "@workspace/db";
import { PROJECTION_WEIGHTS, POSITION_SCOUT_WEIGHTS } from "../config/projectionWeights";
import {
  getScoutsByPlayer,
  getAvailabilityByRound,
  upsertProjection,
} from "../repositories/projectionRepository";
import { getMatchesByRound, getClubStrengthFromMatches, type ClubStrength } from "../repositories/matchRepository";
import type { Player, PlayerScoutRound } from "@workspace/db/schema";

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

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function weightedWindowAverage(scouts: PlayerScoutRound[]): {
  shortAvg: number;
  mediumAvg: number;
  longAvg: number;
  blendedFormScore: number;
  volatility: number;
} {
  const pts = scouts.map((s) => s.points ?? 0);

  const shortPts = pts.slice(0, PROJECTION_WEIGHTS.multiWindow.short.rounds);
  const mediumPts = pts.slice(0, PROJECTION_WEIGHTS.multiWindow.medium.rounds);
  const longPts = pts.slice(0, PROJECTION_WEIGHTS.multiWindow.long.rounds);

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const shortAvg = avg(shortPts);
  const mediumAvg = avg(mediumPts);
  const longAvg = avg(longPts);

  const { short, medium, long } = PROJECTION_WEIGHTS.multiWindow;
  const totalWeight = (shortPts.length > 0 ? short.weight : 0)
    + (mediumPts.length > 0 ? medium.weight : 0)
    + (longPts.length > 0 ? long.weight : 0) || 1;

  const blendedFormScore =
    ((shortPts.length > 0 ? short.weight * shortAvg : 0)
      + (mediumPts.length > 0 ? medium.weight * mediumAvg : 0)
      + (longPts.length > 0 ? long.weight * longAvg : 0))
    / totalWeight;

  const volatility = stdDev(mediumPts.length > 0 ? mediumPts : pts.slice(0, 3));

  return { shortAvg, mediumAvg, longAvg, blendedFormScore, volatility };
}

function positionFormScore(scouts: PlayerScoutRound[], position: string): number {
  if (scouts.length === 0) return 0;
  const posWeights = POSITION_SCOUT_WEIGHTS[position] ?? {};
  let total = 0;
  for (const scout of scouts) {
    let roundPts = scout.points ?? 0;
    let adjustment = 0;
    if (scout.goals) adjustment += (posWeights["G"] ?? 1) * scout.goals * 8;
    if (scout.assists) adjustment += (posWeights["A"] ?? 1) * scout.assists * 5;
    if (scout.saves) adjustment += (posWeights["PS"] ?? 1) * scout.saves * 3;
    if (scout.cleanSheet) adjustment += (posWeights["SG"] ?? 1) * scout.cleanSheet * 5;
    if (scout.tackles) adjustment += (posWeights["DE"] ?? 1) * scout.tackles * 1;
    if (scout.interceptions) adjustment += (posWeights["DS"] ?? 1) * scout.interceptions * 1.2;
    if (scout.shotsOnTarget) adjustment += (posWeights["FT"] ?? 1) * scout.shotsOnTarget * 3;
    if (scout.foulsSuffered) adjustment += (posWeights["FS"] ?? 1) * scout.foulsSuffered * 0.5;
    if (scout.yellowCards) adjustment -= (posWeights["CA"] ?? 1) * scout.yellowCards * 2;
    if (scout.redCards) adjustment -= (posWeights["CV"] ?? 1) * scout.redCards * 5;
    if (scout.penaltyMissed) adjustment -= (posWeights["PP"] ?? 1) * scout.penaltyMissed * 4;
    if (scout.penaltySaved) adjustment += (posWeights["PS"] ?? 1) * scout.penaltySaved * 3;
    if (scout.goalsConceded && ["GOL", "ZAG"].includes(position)) {
      adjustment -= (posWeights["GC"] ?? 1) * scout.goalsConceded * 2;
    }
    const base = roundPts > 0 ? roundPts : 0;
    const multiplier = Object.keys(posWeights).length > 0 ? 0.3 : 0;
    total += base + multiplier * (adjustment - base);
  }
  return total / scouts.length;
}

function isDefensivePosition(position: string): boolean {
  return ["GOL", "ZAG", "LAT"].includes(position);
}

function isAttackerPosition(position: string): boolean {
  return ["ATA", "MEI"].includes(position);
}

// Confidence scaling for players with few games in their history
const MIN_GAMES_FULL_CONFIDENCE = 4;
const LOW_GAMES_FLOOR_WIDENING = 0.15; // extra floor spread per missing game (up to MIN_GAMES)
const LOW_GAMES_RECOMMENDATION_PENALTY = 3.0; // penalty to recommendationScore per missing game

// Price-variation form multiplier: each cartoleta of variation adjusts expected points by this %
const PRICE_VARIATION_FACTOR = 0.03; // 3% per C$1.00
const PRICE_VARIATION_CAP = 0.15;    // capped at ±15%

/**
 * Compute matchupScore from home/away advantage, club momentum (form array), and opponent defensive weakness.
 * Form array entries: "v"=win, "e"=draw, "d"=loss.
 */
function computeMatchupScore(
  isHome: boolean,
  clubForm: string[] | null,
  opponentStrength: ClubStrength | null
): number {
  const base = isHome ? PROJECTION_WEIGHTS.homeAdvantageMultiplier : 1.0;

  let momentumBonus = 0;
  if (clubForm && clubForm.length > 0) {
    for (const result of clubForm.slice(0, 5)) {
      if (result === "v") momentumBonus += 0.03;
      else if (result === "e") momentumBonus += 0.01;
    }
    momentumBonus = Math.min(momentumBonus, 0.15);
  }

  let opponentWeaknessBonus = 0;
  if (opponentStrength && opponentStrength.matchesAnalyzed > 0) {
    // Continuous: bonus when opponent is weak (defensiveStrength < 0.5), penalty when strong (> 0.7)
    // Maps [0 → +0.08, 0.5 → 0, 1.0 → -0.08], clamped to [-0.08, +0.08]
    opponentWeaknessBonus = clamp((0.5 - opponentStrength.defensiveStrength) * 0.16, -0.08, 0.08);
  }

  return base + momentumBonus + opponentWeaknessBonus;
}

async function calculateProjection(
  player: Player,
  round: number,
  playProbability: number,
  expectedMinutes: number,
  isHome: boolean,
  clubForm: string[] | null,
  opponentStrength: ClubStrength | null
): Promise<ProjectionResult> {
  const longScouts = await getScoutsByPlayer(player.id, PROJECTION_WEIGHTS.multiWindow.long.rounds);
  const allScouts = await getScoutsByPlayer(player.id, 20);

  const averagePoints = player.averagePoints ?? 0;
  const price = player.price ?? 1;
  const popularity = (player.popularity ?? 0.5) / 100;
  const priceVariation = player.priceVariation ?? 0;
  const gamesPlayed = player.gamesPlayed ?? null;

  const { shortAvg, mediumAvg, longAvg, blendedFormScore, volatility } = weightedWindowAverage(longScouts);

  const posAdjustedForm = positionFormScore(
    longScouts.slice(0, PROJECTION_WEIGHTS.multiWindow.medium.rounds),
    player.position
  );

  const overallScore = allScouts.length > 0
    ? allScouts.reduce((sum, s) => sum + (s.points ?? 0), 0) / allScouts.length
    : averagePoints;

  const formScore = longScouts.length > 0
    ? posAdjustedForm > 0 ? (blendedFormScore * 0.6 + posAdjustedForm * 0.4) : blendedFormScore
    : averagePoints;

  const matchupScore = computeMatchupScore(isHome, clubForm, opponentStrength);

  // Price-variation form multiplier: a player whose price rose last round was performing well.
  // Bounded to ±15% to avoid overweighting a single signal.
  const priceVariationMultiplier = 1 + clamp(priceVariation * PRICE_VARIATION_FACTOR, -PRICE_VARIATION_CAP, PRICE_VARIATION_CAP);

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

  // Apply price-variation multiplier as a form signal on top of the base score
  baseExpected *= priceVariationMultiplier;

  const probMultiplier =
    playProbability >= PROJECTION_WEIGHTS.riskPenalty.mediumThreshold
      ? PROJECTION_WEIGHTS.riskPenalty.highProbability
      : playProbability >= PROJECTION_WEIGHTS.riskPenalty.lowThreshold
        ? PROJECTION_WEIGHTS.riskPenalty.mediumProbability
        : PROJECTION_WEIGHTS.riskPenalty.lowProbability;

  const expectedPoints = clamp(baseExpected * probMultiplier, 0, 50);

  const { volatility: vol } = PROJECTION_WEIGHTS;
  const isHighVolatility = volatility > vol.highThreshold;
  const isLowVolatility = volatility < vol.lowThreshold;

  // gamesPlayed confidence scaling: widen floor/ceiling for players with few games
  const missingGames = gamesPlayed !== null ? Math.max(0, MIN_GAMES_FULL_CONFIDENCE - gamesPlayed) : 0;
  const lowConfidence = missingGames > 0;

  const ceilingMultiplier = isHighVolatility
    ? vol.ceilingMultiplierHigh
    : isLowVolatility
      ? vol.ceilingMultiplierLow
      : 1.65;
  const floorMultiplier = isHighVolatility
    ? vol.floorMultiplierHigh
    : isLowVolatility
      ? vol.floorMultiplierLow
      : 0.38;

  // For low-confidence players, widen the spread: lower floor, raise ceiling
  const adjustedFloorMultiplier = lowConfidence
    ? Math.max(0, floorMultiplier - missingGames * LOW_GAMES_FLOOR_WIDENING)
    : floorMultiplier;

  const floorPoints = clamp(expectedPoints * adjustedFloorMultiplier, 0, expectedPoints);
  const ceilingPoints = clamp(expectedPoints * ceilingMultiplier + cleanSheetBonus, expectedPoints, 60);

  const formTrend = shortAvg > mediumAvg ? 1.0 : shortAvg > longAvg ? 0.5 : 0.0;
  const riskScore = clamp(
    1 - playProbability + (formScore < 2 ? 0.1 : 0) + (isHighVolatility ? 0.1 : 0) - formTrend * 0.05,
    0, 1
  );
  const valueScore = price > 0 ? clamp(expectedPoints / price, 0, 5) : 0;

  const differentialScore = clamp(
    expectedPoints * (1 - clamp(popularity, 0, 1)) * (1 + valueScore * 0.2),
    0, 100
  );

  const isTrap =
    popularity > PROJECTION_WEIGHTS.differential.trapPopularityThreshold &&
    riskScore > PROJECTION_WEIGHTS.differential.trapRiskThreshold &&
    shortAvg < mediumAvg * PROJECTION_WEIGHTS.differential.trapFormDeclineThreshold;

  const recommendationScore = clamp(
    expectedPoints * 0.5 +
    valueScore * 3 +
    formScore * 0.2 +
    (1 - riskScore) * 5 +
    cleanSheetBonus * 0.3 +
    formTrend * 2 -
    missingGames * LOW_GAMES_RECOMMENDATION_PENALTY,
    0,
    100
  );

  const explanationJson = {
    averagePoints,
    formScore: Number(formScore.toFixed(2)),
    shortAvg: Number(shortAvg.toFixed(2)),
    mediumAvg: Number(mediumAvg.toFixed(2)),
    longAvg: Number(longAvg.toFixed(2)),
    overallScore: Number(overallScore.toFixed(2)),
    volatility: Number(volatility.toFixed(2)),
    formTrend: Number(formTrend.toFixed(2)),
    matchupScore,
    playProbability,
    expectedMinutes,
    cleanSheetProbability: Number(cleanSheetProbability.toFixed(2)),
    cleanSheetBonus: Number(cleanSheetBonus.toFixed(2)),
    attackParticipationProbability: Number(attackParticipationProbability.toFixed(2)),
    isHome,
    recentRoundsAnalyzed: longScouts.length,
    position: player.position,
    price,
    popularity: Number(popularity.toFixed(3)),
    valueScore: Number(valueScore.toFixed(3)),
    differentialScore: Number(differentialScore.toFixed(2)),
    isTrap,
    isHighVolatility,
    isLowVolatility,
    priceVariation,
    priceVariationMultiplier: Number(priceVariationMultiplier.toFixed(3)),
    gamesPlayed,
    lowConfidence,
    missingGames,
  };

  return {
    expectedPoints: Number(expectedPoints.toFixed(2)),
    floorPoints: Number(floorPoints.toFixed(2)),
    ceilingPoints: Number(ceilingPoints.toFixed(2)),
    riskScore: Number(riskScore.toFixed(3)),
    playProbability,
    expectedMinutes,
    matchupScore: Number(matchupScore.toFixed(3)),
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

  const clubFormMap = new Map<number, string[]>();
  const clubOpponentMap = new Map<number, number>();

  for (const match of matches) {
    if (match.homeClubId) {
      if (match.homeForm) clubFormMap.set(match.homeClubId, match.homeForm);
      if (match.awayClubId) clubOpponentMap.set(match.homeClubId, match.awayClubId);
    }
    if (match.awayClubId) {
      if (match.awayForm) clubFormMap.set(match.awayClubId, match.awayForm);
      if (match.homeClubId) clubOpponentMap.set(match.awayClubId, match.homeClubId);
    }
  }

  const uniqueOpponentIds = [...new Set(clubOpponentMap.values())];
  const opponentStrengthMap = new Map<number, ClubStrength>();
  await Promise.all(
    uniqueOpponentIds.map(async (opponentId) => {
      const strength = await getClubStrengthFromMatches(opponentId, round);
      opponentStrengthMap.set(opponentId, strength);
    })
  );

  let processed = 0;
  for (const player of players) {
    const avail = availMap.get(player.id);
    const playProbability = avail?.playProbability ?? 0.7;
    const expectedMinutes = avail?.expectedMinutes ?? 75;
    const isHome = player.clubId != null ? homeClubIds.has(player.clubId) : false;

    const clubForm = player.clubId != null ? (clubFormMap.get(player.clubId) ?? null) : null;
    const opponentId = player.clubId != null ? (clubOpponentMap.get(player.clubId) ?? null) : null;
    const opponentStrength = opponentId != null ? (opponentStrengthMap.get(opponentId) ?? null) : null;

    const proj = await calculateProjection(player, round, playProbability, expectedMinutes, isHome, clubForm, opponentStrength);

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
