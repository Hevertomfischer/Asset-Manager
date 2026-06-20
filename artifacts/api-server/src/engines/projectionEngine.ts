import { db } from "@workspace/db";
import { adminConfigTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { PROJECTION_WEIGHTS, POSITION_SCOUT_WEIGHTS, SCOUT_SCORING } from "../config/projectionWeights";
import {
  getScoutsByPlayer,
  getAvailabilityByRound,
  upsertProjection,
} from "../repositories/projectionRepository";
import { getMatchesByRound, getClubStrengthFromMatches, type ClubStrength } from "../repositories/matchRepository";
import type { Player, PlayerScoutRound } from "@workspace/db/schema";

// Module-level calibration multipliers loaded once per projection run.
// Key = position (e.g. "MEI"), value = median(actual)/median(projected) ratio.
// Applied post-calculation to correct systematic per-position bias.
const _calibrationMultipliers = new Map<string, number>();

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

/**
 * TEC (coach) projection based on club match-outcome probabilities.
 *
 * TEC points in Cartola FC derive entirely from team results (win/draw/loss,
 * goals scored, clean sheets) — not from individual scout events. Our
 * player_scout_round table receives no TEC data, so we can't use the scout
 * formula. Instead, we estimate from:
 *   - Club's recent form win/draw rates
 *   - matchupScore (home advantage + opponent strength)
 *   - API averagePoints as a sanity anchor
 *
 * Typical Cartola TEC scoring: win ≈ 5-7 pts, draw ≈ 2-3 pts, loss ≈ 0-1 pt.
 */
function buildTecProjection(
  player: Player,
  matchupScore: number,
  playProbability: number,
  isHome: boolean,
  clubForm: string[] | null,
): ProjectionResult {
  const averagePoints = player.averagePoints ?? 3.5;
  const price = player.price ?? 1;

  // Estimate win/draw rates from recent club form (last 5 games)
  const form = (clubForm ?? []).slice(0, 5);
  const winRate  = form.length > 0 ? form.filter(r => r === 'v').length / form.length : 0.38;
  const drawRate = form.length > 0 ? form.filter(r => r === 'e').length / form.length : 0.25;

  // Cartola TEC scoring approximation: win~6pts, draw~2pts, loss~0pts
  // (includes goals scored bonus, clean sheet bonus on average)
  const resultPts = winRate * 6.0 + drawRate * 2.0;

  // matchupScore > 1 = favorable attacking matchup → more goals, higher TEC score
  const matchupBonus = (matchupScore - 1.0) * 2.0;
  const homeBonus = isHome ? 0.3 : 0;

  // Blend: 55% club-form formula + 45% API averagePoints (sanity anchor)
  const formulaResult = resultPts + matchupBonus + homeBonus;
  const baseExpected = (formulaResult * 0.55 + averagePoints * 0.45) * playProbability;
  const expectedPoints = clamp(baseExpected, 0, 20);

  const formScore = winRate * 5 + drawRate * 2;
  const valueScore = price > 0 ? clamp(expectedPoints / price, 0, 5) : 0;

  return {
    expectedPoints: Number(expectedPoints.toFixed(2)),
    floorPoints: Number(clamp(expectedPoints * 0.30, 0, expectedPoints).toFixed(2)),
    ceilingPoints: Number(clamp(expectedPoints * 1.80, expectedPoints, 30).toFixed(2)),
    riskScore: Number(clamp(1 - playProbability, 0, 1).toFixed(3)),
    playProbability,
    expectedMinutes: 90,
    matchupScore: Number(matchupScore.toFixed(3)),
    formScore: Number(formScore.toFixed(2)),
    valueScore: Number(valueScore.toFixed(3)),
    cleanSheetProbability: 0,
    attackParticipationProbability: 0,
    recommendationScore: Number(clamp(expectedPoints * 0.6 + playProbability * 5, 0, 100).toFixed(2)),
    explanationJson: {
      tecFormula: true,
      averagePoints,
      winRate: Number(winRate.toFixed(2)),
      drawRate: Number(drawRate.toFixed(2)),
      resultPts: Number(resultPts.toFixed(2)),
      matchupBonus: Number(matchupBonus.toFixed(2)),
      homeBonus,
      formulaResult: Number(formulaResult.toFixed(2)),
      matchupScore,
      playProbability,
      isHome,
      price,
    },
  };
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
 * When xG data (from footystats) is provided, it overrides the form/history-based opponent weakness bonus.
 * Form array entries: "v"=win, "e"=draw, "d"=loss.
 */
function computeMatchupScore(
  isHome: boolean,
  clubForm: string[] | null,
  opponentStrength: ClubStrength | null,
  matchXg?: number | null
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
  if (matchXg != null) {
    // xG-based bonus: normalize to [0,1] with typical Brasileirão range 0.5–2.5.
    // Expected value is 1.35. Bonus maps higher xG → bigger bonus (good attacking matchup).
    // Range: xG=0.5 → -0.06, xG=1.35 → 0, xG=2.5 → +0.07
    const xgNorm = (matchXg - 1.35) / 1.15; // normalised around league avg
    opponentWeaknessBonus = clamp(xgNorm * 0.08, -0.06, 0.08);
  } else if (opponentStrength && opponentStrength.matchesAnalyzed > 0) {
    opponentWeaknessBonus = clamp((0.5 - opponentStrength.defensiveStrength) * 0.16, -0.08, 0.08);
  }

  return base + momentumBonus + opponentWeaknessBonus;
}

// Scout keys that directly contribute to attacking output.
// These scale with opponent weakness (higher matchupScore = better attack matchup).
const ATTACK_SCOUT_KEYS = new Set(['G', 'A', 'FT', 'FD', 'FF', 'FS', 'PS']);
// Average opponent xG in Brasileirão used for normalising GS (goals conceded) adjustment.
const AVG_OPPONENT_XG = 1.2;

/**
 * Compute matchup-adjusted expected points per game from cumulative scout data.
 *
 * Applies matchupScore to attacking scouts (G, A, FT, FD, FF, FS, PS) and adjusts
 * GS (goals conceded) by the opponent's attack xG relative to the league average.
 * All other scouts (DS, DE, FC, CA, CV, I, etc.) use the historical per-game rate.
 *
 * The output equals averagePoints when matchupScore=1.0 and opponentAttackXg=AVG_OPPONENT_XG,
 * and diverges based on matchup quality — giving a more granular projection than a
 * blanket multiplier on the overall average.
 */
function computeScoutMatchupBase(
  cumulativeScouts: Record<string, number>,
  gamesPlayed: number,
  matchupScore: number,
  opponentAttackXg: number | null,
): number {
  if (gamesPlayed <= 0 || Object.keys(cumulativeScouts).length === 0) return 0;
  let total = 0;
  for (const [key, count] of Object.entries(cumulativeScouts)) {
    const pts = SCOUT_SCORING[key] ?? 0;
    if (pts === 0) continue;
    const perGame = count / gamesPlayed;
    let factor = 1.0;
    if (ATTACK_SCOUT_KEYS.has(key)) {
      factor = matchupScore;
    } else if (key === 'GS') {
      // GS is negative (-1.0 pt). Stronger opponent attack → more goals conceded.
      factor = opponentAttackXg != null ? opponentAttackXg / AVG_OPPONENT_XG : 1.0;
    }
    total += perGame * pts * factor;
  }
  return total;
}

async function calculateProjection(
  player: Player,
  round: number,
  playProbability: number,
  expectedMinutes: number,
  isHome: boolean,
  clubForm: string[] | null,
  opponentStrength: ClubStrength | null,
  attackXg?: number | null,
  opponentAttackXg?: number | null
): Promise<ProjectionResult> {
  // TEC (coaches) score based on club match outcomes, not individual scout events.
  // Use club-performance formula instead of the scout-based pipeline.
  if (player.position === 'TEC') {
    const matchupScore = computeMatchupScore(isHome, clubForm, opponentStrength, attackXg);
    return buildTecProjection(player, matchupScore, playProbability, isHome, clubForm);
  }

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

  // Confidence-weighted blend: how much to trust scout data vs. the API averagePoints.
  // Scouts with 0 points (player didn't play / data missing) don't count toward confidence.
  // Full confidence requires 4+ non-zero overall rounds, 3+ non-zero recent rounds.
  const nonZeroAllScouts = allScouts.filter(s => (s.points ?? 0) > 0).length;
  const nonZeroFormScouts = longScouts.filter(s => (s.points ?? 0) > 0).length;
  const overallConfidence = Math.min(1, nonZeroAllScouts / 4);
  const formConfidence = Math.min(1, nonZeroFormScouts / 3);

  const rawScoutOverall = allScouts.length > 0
    ? allScouts.reduce((sum, s) => sum + (s.points ?? 0), 0) / allScouts.length
    : 0;

  const rawFormScore = longScouts.length > 0
    ? posAdjustedForm > 0
      ? blendedFormScore * 0.6 + posAdjustedForm * 0.4
      : blendedFormScore
    : 0;

  // Blend: when scouts are sparse/all-zero, fall back to the Cartola API averagePoints.
  // This is critical for the start of the season when we have few historical rounds.
  const overallScore = averagePoints > 0
    ? rawScoutOverall * overallConfidence + averagePoints * (1 - overallConfidence)
    : rawScoutOverall;

  const formScore = averagePoints > 0
    ? rawFormScore * formConfidence + averagePoints * (1 - formConfidence)
    : rawFormScore;

  const matchupScore = computeMatchupScore(isHome, clubForm, opponentStrength, attackXg);

  // Price-variation form multiplier: a player whose price rose last round was performing well.
  // Bounded to ±15% to avoid overweighting a single signal.
  const priceVariationMultiplier = 1 + clamp(priceVariation * PRICE_VARIATION_FACTOR, -PRICE_VARIATION_CAP, PRICE_VARIATION_CAP);

  // cleanSheetProbability: when opponent xG is available (from footystats), use it directly.
  // Lower opponent xG = higher clean sheet probability. Normalize: xG 0.5 → 0.7 prob, xG 1.35 → 0.35, xG 2.5 → 0.1
  const cleanSheetProbability = isDefensivePosition(player.position)
    ? opponentAttackXg != null
      ? clamp(0.7 - (opponentAttackXg / 3.0), 0.05, 0.85)
      : clamp(0.3 * matchupScore, 0, 0.9)
    : 0;

  const attackParticipationProbability = isAttackerPosition(player.position)
    ? clamp(0.4 * matchupScore * (formScore / Math.max(averagePoints, 1)), 0, 0.95)
    : 0;

  const positionBonus = PROJECTION_WEIGHTS.positionCleanSheetBonus[player.position as keyof typeof PROJECTION_WEIGHTS.positionCleanSheetBonus] ?? 0;
  const cleanSheetBonus = cleanSheetProbability * positionBonus;

  // Scout-based matchup-adjusted baseline: applies matchupScore only to attack scouts (G, A, FT,
  // FD, FF, FS, PS) and adjusts GS (goals conceded) by opponent xG vs league average.
  // This is more granular than the generic matchup term — e.g. a defender with high DS keeps
  // those points regardless of matchup, while an attacker's G/A rates scale with opponent weakness.
  const cumulativeScouts = player.cumulativeScouts as Record<string, number> | null | undefined;
  const hasScoutData = cumulativeScouts != null && Object.keys(cumulativeScouts).length > 0 && (gamesPlayed ?? 0) > 0;

  let baseExpected: number;

  const scoutBase = hasScoutData
    ? computeScoutMatchupBase(cumulativeScouts!, gamesPlayed!, matchupScore, opponentAttackXg ?? null)
    : 0;

  // Use the scout formula only when cumulative scouts produce a meaningful baseline.
  // TEC (coaches) have non-standard scout keys (e.g. "V" = win) not in SCOUT_SCORING,
  // so scoutBase would be 0 — fall back to the averagePoints formula in that case.
  const useScoutFormula = hasScoutData && scoutBase > 0.5;

  if (useScoutFormula) {
    // Blend: 50% matchup-adjusted scout baseline + 35% recent form + 15% positional clean-sheet bonus
    baseExpected = 0.50 * scoutBase + 0.35 * formScore + 0.15 * cleanSheetBonus;
  } else {
    // Legacy formula: no cumulative scouts or unrecognized scout types (coaches)
    const weights = PROJECTION_WEIGHTS.weights;
    baseExpected =
      weights.overallAverage * overallScore +
      weights.recentForm * formScore +
      weights.matchup * (averagePoints * (matchupScore - 1)) +
      weights.homeAdvantage * cleanSheetBonus;
  }

  baseExpected = Math.max(0, baseExpected);

  // Apply price-variation multiplier as a form signal on top of the base score
  baseExpected *= priceVariationMultiplier;

  const probMultiplier =
    playProbability >= PROJECTION_WEIGHTS.riskPenalty.mediumThreshold
      ? PROJECTION_WEIGHTS.riskPenalty.highProbability
      : playProbability >= PROJECTION_WEIGHTS.riskPenalty.lowThreshold
        ? PROJECTION_WEIGHTS.riskPenalty.mediumProbability
        : PROJECTION_WEIGHTS.riskPenalty.lowProbability;

  // Apply calibration multiplier (per-position bias correction from historical data).
  // Defaults to 1.0 when no calibration has been run yet.
  const calibMult = _calibrationMultipliers.get(player.position) ?? 1.0;
  const expectedPoints = clamp(baseExpected * probMultiplier * calibMult, 0, 50);

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
  // Load historical calibration multipliers from admin_config (if available).
  // These are position-specific bias-correction factors computed by POST /admin/calibrate-projection-weights.
  _calibrationMultipliers.clear();
  try {
    const rows = await db.select().from(adminConfigTable)
      .where(eq(adminConfigTable.key, "projection_calibration")).limit(1);
    if (rows.length > 0) {
      const cal = JSON.parse(rows[0].value) as { positionMultipliers?: Record<string, number> };
      for (const [pos, mult] of Object.entries(cal.positionMultipliers ?? {})) {
        _calibrationMultipliers.set(pos, mult);
      }
      console.log(`[projectionEngine] Loaded calibration for ${_calibrationMultipliers.size} positions`);
    }
  } catch (err) {
    console.warn("[projectionEngine] Could not load calibration weights, using defaults:", err instanceof Error ? err.message : String(err));
  }

  const players = await db.query.playersTable.findMany();
  const availabilities = await getAvailabilityByRound(round);
  const matches = await getMatchesByRound(round);

  const availMap = new Map(availabilities.map((a) => [a.playerId, a]));
  const homeClubIds = new Set(matches.map((m) => m.homeClubId).filter(Boolean) as number[]);

  const clubFormMap = new Map<number, string[]>();
  const clubOpponentMap = new Map<number, number>();
  const clubAttackXgMap = new Map<number, number>();
  const clubOpponentAttackXgMap = new Map<number, number>();

  for (const match of matches) {
    if (match.homeClubId) {
      if (match.homeForm) clubFormMap.set(match.homeClubId, match.homeForm);
      if (match.awayClubId) clubOpponentMap.set(match.homeClubId, match.awayClubId);
      if (match.homeXg != null) clubAttackXgMap.set(match.homeClubId, match.homeXg);
      if (match.awayXg != null) clubOpponentAttackXgMap.set(match.homeClubId, match.awayXg);
    }
    if (match.awayClubId) {
      if (match.awayForm) clubFormMap.set(match.awayClubId, match.awayForm);
      if (match.homeClubId) clubOpponentMap.set(match.awayClubId, match.homeClubId);
      if (match.awayXg != null) clubAttackXgMap.set(match.awayClubId, match.awayXg);
      if (match.homeXg != null) clubOpponentAttackXgMap.set(match.awayClubId, match.homeXg);
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
    // Fallback play probability based on player status when no availability record exists.
    // Prevents suspended/nulo players from getting a 70% default.
    const statusFallback =
      player.status === "Suspenso" ? 0.02 :
      player.status === "Nulo" ? 0.0 :
      player.status === "Contundido" ? 0.05 :
      0.7;
    const playProbability = avail?.playProbability ?? statusFallback;
    const expectedMinutes = avail?.expectedMinutes ?? (playProbability > 0.1 ? 75 : 0);
    const isHome = player.clubId != null ? homeClubIds.has(player.clubId) : false;

    const clubForm = player.clubId != null ? (clubFormMap.get(player.clubId) ?? null) : null;
    const opponentId = player.clubId != null ? (clubOpponentMap.get(player.clubId) ?? null) : null;
    const opponentStrength = opponentId != null ? (opponentStrengthMap.get(opponentId) ?? null) : null;
    const attackXg = player.clubId != null ? (clubAttackXgMap.get(player.clubId) ?? null) : null;
    const opponentAttackXg = player.clubId != null ? (clubOpponentAttackXgMap.get(player.clubId) ?? null) : null;

    const proj = await calculateProjection(player, round, playProbability, expectedMinutes, isHome, clubForm, opponentStrength, attackXg, opponentAttackXg);

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
