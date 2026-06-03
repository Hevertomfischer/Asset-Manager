/**
 * Sanity tests for the Monte Carlo lineup simulator.
 *
 * All tests use synthetic in-memory data — no database connection required.
 *
 * Statistical tolerance:
 *   For N=20 000 sims and a team with σ_team ≈ 10, the standard error of
 *   the mean estimate is σ_team/√N ≈ 0.07. Using ±1.5 pts tolerance gives
 *   a >99.99% pass rate under the null hypothesis.
 *
 * How to run:
 *   pnpm --filter @workspace/api-server run test
 */

import { describe, test, expect } from "vitest";
import { simulateLineup, type SimPlayer } from "../engines/monteCarlo";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<SimPlayer> & { playerId: number }): SimPlayer {
  return {
    expectedPoints: 5,
    floorPoints: 1,
    ceilingPoints: 12,
    volatility: 2,
    playProbability: 1.0,
    isCaptain: false,
    ...overrides,
  };
}

/**
 * Analytical expected team score under the simulator model:
 *   E[team] = Σ_j E[score_j | plays] × P(plays_j) × captainMult_j
 *
 * Note: for a truncated normal with loose bounds relative to σ,
 * E[score_j | plays] ≈ μ_j (bias is negligible for the test floor/ceiling range).
 *
 * The captain contributes score × 2, so:
 *   E[team] = Σ(non-captains: μ_j × playProb_j)
 *           + 2 × μ_captain × playProb_captain
 */
function analyticalMean(players: SimPlayer[]): number {
  return players.reduce((sum, p) => {
    const mult = p.isCaptain ? 2.0 : 1.0;
    return sum + p.expectedPoints * p.playProbability * mult;
  }, 0);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Monte Carlo simulateLineup", () => {
  test("mean ≈ Σ(expectedPoints) when all players certain to play, no captain", () => {
    // Loose truncation (floor far below, ceiling far above) → minimal bias
    const players: SimPlayer[] = Array.from({ length: 11 }, (_, i) =>
      makePlayer({
        playerId: i + 1,
        expectedPoints: 4 + i * 0.5, // range 4–9
        floorPoints: 0,
        ceilingPoints: 30,
        volatility: 2,
        playProbability: 1.0,
        isCaptain: false,
      })
    );

    const result = simulateLineup(players, { numSims: 20_000 });
    const expected = analyticalMean(players);

    expect(Math.abs(result.mean - expected)).toBeLessThan(1.5);
  });

  test("captain doubles their expected contribution (×2 mult)", () => {
    // Two identical players: one is captain, one is not
    const captainPts = 8;
    const players: SimPlayer[] = [
      makePlayer({ playerId: 1, expectedPoints: captainPts, isCaptain: true,  volatility: 0.5, floorPoints: 0, ceilingPoints: 30 }),
      makePlayer({ playerId: 2, expectedPoints: captainPts, isCaptain: false, volatility: 0.5, floorPoints: 0, ceilingPoints: 30 }),
    ];

    const result = simulateLineup(players, { numSims: 20_000 });
    // Expected: captain (×2) + normal (×1) = 3 × captainPts
    const expected = 3 * captainPts;

    expect(Math.abs(result.mean - expected)).toBeLessThan(1.0);
  });

  test("player with playProbability=0 contributes 0 to every simulation", () => {
    const players: SimPlayer[] = [
      makePlayer({ playerId: 1, expectedPoints: 10, playProbability: 0 }),
      makePlayer({ playerId: 2, expectedPoints: 5,  playProbability: 1, isCaptain: true }),
    ];

    const result = simulateLineup(players, { numSims: 10_000 });
    // Only player 2 contributes: 5 × 2 (captain) = 10
    expect(Math.abs(result.mean - 10)).toBeLessThan(0.5);
    // p10 should be > 0 (player 2 always plays with playProb=1)
    expect(result.percentiles.p10).toBeGreaterThan(0);
  });

  test("playProbability reduces mean proportionally", () => {
    const pts = 10;
    const prob = 0.6;
    const players: SimPlayer[] = [
      makePlayer({ playerId: 1, expectedPoints: pts, playProbability: prob, volatility: 0.1, floorPoints: 0, ceilingPoints: 100 }),
    ];

    const result = simulateLineup(players, { numSims: 30_000 });
    const expected = pts * prob; // ≈ 6

    expect(Math.abs(result.mean - expected)).toBeLessThan(0.5);
  });

  test("percentile ordering: p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90", () => {
    const players: SimPlayer[] = Array.from({ length: 11 }, (_, i) =>
      makePlayer({ playerId: i + 1, playProbability: 0.85, volatility: 3 })
    );

    const { percentiles } = simulateLineup(players, { numSims: 10_000 });

    expect(percentiles.p10).toBeLessThanOrEqual(percentiles.p25);
    expect(percentiles.p25).toBeLessThanOrEqual(percentiles.p50);
    expect(percentiles.p50).toBeLessThanOrEqual(percentiles.p75);
    expect(percentiles.p75).toBeLessThanOrEqual(percentiles.p90);
  });

  test("exceedance probability = 1 for threshold below p10", () => {
    const players: SimPlayer[] = Array.from({ length: 11 }, (_, i) =>
      makePlayer({ playerId: i + 1, expectedPoints: 8, playProbability: 1.0, volatility: 0.5, floorPoints: 5, ceilingPoints: 12 })
    );

    const result = simulateLineup(players, { numSims: 10_000, thresholds: [0] });
    // All sims > 0 since everyone plays with certain non-zero score
    expect(result.exceedanceProbabilities["0"]).toBeCloseTo(1.0, 1);
  });

  test("exceedance probability = 0 for threshold above p90", () => {
    const players: SimPlayer[] = Array.from({ length: 11 }, (_, i) =>
      makePlayer({ playerId: i + 1, expectedPoints: 3, playProbability: 1.0, volatility: 0.5, floorPoints: 1, ceilingPoints: 5 })
    );

    // Max possible ≈ 11 × 5 = 55; use 200 as impossible threshold
    const result = simulateLineup(players, { numSims: 10_000, thresholds: [200] });
    expect(result.exceedanceProbabilities["200"]).toBe(0);
  });

  test("histogram buckets cover approximately the full distribution range", () => {
    const players: SimPlayer[] = Array.from({ length: 11 }, (_, i) =>
      makePlayer({ playerId: i + 1, expectedPoints: 6, volatility: 2 })
    );

    const result = simulateLineup(players, { numSims: 10_000, histogramBuckets: 20 });

    expect(result.histogram.length).toBe(20);
    const totalCount = result.histogram.reduce((s, b) => s + b.count, 0);
    // 2nd–98th percentile range covers ~96% of sims
    expect(totalCount / result.numSims).toBeGreaterThan(0.9);
  });

  test("full lineup sanity: mean ≈ analytical mean with realistic params", () => {
    // Mirrors a typical Cartola FC lineup projection
    const players: SimPlayer[] = [
      makePlayer({ playerId:  1, expectedPoints: 5.2, floorPoints: 1.0, ceilingPoints: 11.0, volatility: 2.1, playProbability: 0.95, isCaptain: false }), // GOL
      makePlayer({ playerId:  2, expectedPoints: 4.8, floorPoints: 0.8, ceilingPoints:  9.5, volatility: 1.8, playProbability: 0.90, isCaptain: false }), // ZAG
      makePlayer({ playerId:  3, expectedPoints: 4.5, floorPoints: 0.5, ceilingPoints:  9.0, volatility: 2.0, playProbability: 0.92, isCaptain: false }), // ZAG
      makePlayer({ playerId:  4, expectedPoints: 5.0, floorPoints: 0.5, ceilingPoints: 10.0, volatility: 2.2, playProbability: 0.88, isCaptain: false }), // LAT
      makePlayer({ playerId:  5, expectedPoints: 4.2, floorPoints: 0.5, ceilingPoints:  8.5, volatility: 1.9, playProbability: 0.91, isCaptain: false }), // LAT
      makePlayer({ playerId:  6, expectedPoints: 6.1, floorPoints: 1.0, ceilingPoints: 13.0, volatility: 2.8, playProbability: 0.93, isCaptain: true  }), // MEI (cap)
      makePlayer({ playerId:  7, expectedPoints: 5.5, floorPoints: 0.5, ceilingPoints: 12.0, volatility: 2.5, playProbability: 0.89, isCaptain: false }), // MEI
      makePlayer({ playerId:  8, expectedPoints: 5.8, floorPoints: 0.8, ceilingPoints: 12.5, volatility: 2.6, playProbability: 0.87, isCaptain: false }), // MEI
      makePlayer({ playerId:  9, expectedPoints: 6.5, floorPoints: 1.0, ceilingPoints: 15.0, volatility: 3.2, playProbability: 0.85, isCaptain: false }), // ATA
      makePlayer({ playerId: 10, expectedPoints: 6.0, floorPoints: 0.8, ceilingPoints: 14.0, volatility: 3.0, playProbability: 0.88, isCaptain: false }), // ATA
      makePlayer({ playerId: 11, expectedPoints: 3.5, floorPoints: 0.5, ceilingPoints:  7.0, volatility: 1.5, playProbability: 0.97, isCaptain: false }), // TEC
    ];

    const result = simulateLineup(players, { numSims: 25_000, thresholds: [60, 75, 90] });
    const expected = analyticalMean(players);

    // Mean should be close to analytical (truncation bias is small for these params)
    expect(Math.abs(result.mean - expected)).toBeLessThan(2.0);

    // Higher threshold → lower exceedance probability
    const p60 = result.exceedanceProbabilities["60"] ?? 0;
    const p75 = result.exceedanceProbabilities["75"] ?? 0;
    const p90 = result.exceedanceProbabilities["90"] ?? 0;
    expect(p60).toBeGreaterThanOrEqual(p75);
    expect(p75).toBeGreaterThanOrEqual(p90);

    // Sanity: stdDev > 0 (team has real variance)
    expect(result.stdDev).toBeGreaterThan(0);
  });
});
