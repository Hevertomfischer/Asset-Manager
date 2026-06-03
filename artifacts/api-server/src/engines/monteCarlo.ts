/**
 * Monte Carlo lineup scorer for Cartola FC.
 *
 * Statistical model
 * -----------------
 * For each player, points are sampled from a TRUNCATED NORMAL distribution:
 *
 *   X | plays ~ TruncNormal(μ, σ², floor, ceiling)
 *
 * Parameters:
 *   μ       = expectedPoints  (projection engine conditional mean, given plays)
 *   σ       = volatility      (std-dev of recent scored-points history)
 *   floor   = floorPoints     (pessimistic bound from projection engine)
 *   ceiling = ceilingPoints   (optimistic bound from projection engine)
 *
 * Sampling uses the inverse-CDF method (numerically stable for tight bounds):
 *   α  = (floor − μ) / σ,  β = (ceiling − μ) / σ
 *   u  ~ Uniform(Φ(α), Φ(β))
 *   x  = μ + σ · Φ⁻¹(u)
 *
 * where Φ is the standard normal CDF and Φ⁻¹ is the probit function.
 *
 * Play probability (Bernoulli mask):
 *   With probability (1 − playProbability) the player does not start and
 *   contributes 0 points. This models injury/benching/rotation uncertainty.
 *
 * Captain multiplier:
 *   Cartola FC rule: the captain's points are doubled (×2).
 *   team_score = Σ(all player scores)  +  captain_score   (extra ×1 bonus)
 *             = Σ(non-captain scores)  +  2 × captain_score
 *
 * Vectorisation:
 *   Per-player truncation parameters (pLo, pRange, etc.) are pre-computed
 *   once before the simulation loop. The inner loop (N × M) only calls
 *   Math.random() twice per player per sim and one probit evaluation.
 *   N=10 000, M=11 → ~110 000 iterations; executes in <20 ms in V8.
 *
 * ⚠️  DISCLAIMER
 *   All outputs are statistical estimates produced by a parametric model.
 *   They are NOT guarantees. Real match outcomes depend on events (injuries,
 *   tactics, weather, referee decisions) that this model cannot anticipate.
 *   Treat them as decision-support tools, not predictions.
 */

// ── Math helpers ──────────────────────────────────────────────────────────────

/**
 * Error function approximation — Abramowitz & Stegun 7.1.26.
 * Max absolute error: 1.5 × 10⁻⁷. Adequate for simulation sampling.
 */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const poly =
    t *
    (0.254829592 +
      t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return sign * (1 - poly * Math.exp(-a * a));
}

/** Standard normal CDF: Φ(z) = 0.5 · (1 + erf(z / √2)) */
function normalCDF(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/**
 * Probit function (inverse normal CDF): Φ⁻¹(p).
 * Rational approximation — Abramowitz & Stegun 26.2.17.
 * Max absolute error: ~4.5 × 10⁻⁴. Sufficient for simulation purposes.
 */
function probit(p: number): number {
  if (p <= 0) return -8; // practical -∞ for sampling
  if (p >= 1) return 8;  // practical +∞ for sampling
  const q = p < 0.5 ? p : 1 - p;
  const t = Math.sqrt(-2 * Math.log(q));
  const num = 2.515517 + 0.802853 * t + 0.010328 * t * t;
  const den = 1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t;
  const z = t - num / den;
  return p < 0.5 ? -z : z;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SimPlayer {
  playerId: number;
  /** Conditional mean points given the player starts (from projection engine). */
  expectedPoints: number;
  /** Pessimistic bound on scored points. */
  floorPoints: number;
  /** Optimistic bound on scored points. */
  ceilingPoints: number;
  /**
   * Standard deviation of recent scored points (from projectionEngine.volatility).
   * Used directly as σ of the normal distribution.
   */
  volatility: number;
  /** P(player starts the match) ∈ [0, 1]. */
  playProbability: number;
  /** If true, this player's score is doubled (Cartola FC captain rule). */
  isCaptain: boolean;
}

export interface SimOptions {
  /** Number of Monte Carlo draws. Default: 10 000. Max enforced by route: 50 000. */
  numSims?: number;
  /**
   * Team-score thresholds for exceedance probabilities.
   * Default: [75, 90, 100].
   * Providing `roundMean` via the route automatically appends it.
   */
  thresholds?: number[];
  /** Number of histogram buckets (2nd–98th percentile range). Default: 20. */
  histogramBuckets?: number;
}

export interface HistogramBucket {
  /** Left edge (inclusive). */
  min: number;
  /** Right edge (exclusive, except for the last bucket). */
  max: number;
  /** Raw simulation count. */
  count: number;
  /** count / numSims. */
  frequency: number;
}

export interface SimResult {
  numSims: number;
  mean: number;
  stdDev: number;
  percentiles: {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
  /**
   * P(team_score > threshold) for each requested threshold.
   * Keys are the threshold values as strings (JSON compatibility).
   */
  exceedanceProbabilities: Record<string, number>;
  histogram: HistogramBucket[];
  disclaimer: string;
}

// ── Pre-computed per-player distribution descriptor ───────────────────────────

type PlayerDist =
  | {
      kind: "stochastic";
      mu: number;
      sigma: number;
      floor: number;
      ceiling: number;
      pLo: number;
      pRange: number;
      playProb: number;
      captainMult: number;
    }
  | {
      kind: "deterministic";
      value: number;
      playProb: number;
      captainMult: number;
    };

function buildDist(p: SimPlayer): PlayerDist {
  const captainMult = p.isCaptain ? 2.0 : 1.0;
  const playProb = clamp(p.playProbability, 0, 1);
  const mu = p.expectedPoints;
  const sigma = p.volatility;

  // Ensure floor ≤ mu ≤ ceiling (projection engine guarantees this but be safe)
  const floor = Math.min(p.floorPoints, mu);
  const ceiling = Math.max(p.ceilingPoints, mu);

  // Degenerate: no uncertainty → deterministic draw
  if (sigma < 0.01 || ceiling - floor < 0.01) {
    return { kind: "deterministic", value: mu, playProb, captainMult };
  }

  const zLo = (floor - mu) / sigma;
  const zHi = (ceiling - mu) / sigma;
  const pLo = normalCDF(zLo);
  const pHi = normalCDF(zHi);
  const pRange = pHi - pLo;

  // Truncation cuts off virtually all mass (extreme parameters) → fallback
  if (pRange < 1e-8) {
    return {
      kind: "deterministic",
      value: clamp(mu, floor, ceiling),
      playProb,
      captainMult,
    };
  }

  return { kind: "stochastic", mu, sigma, floor, ceiling, pLo, pRange, playProb, captainMult };
}

// ── Main export ───────────────────────────────────────────────────────────────

const DISCLAIMER =
  "Estimativas estatísticas baseadas em modelo paramétrico. " +
  "Não constituem garantias — resultados reais dependem de eventos " +
  "(lesões, táticas, decisões arbitrais) fora do escopo do modelo.";

/**
 * Run N Monte Carlo simulations for the given lineup and return summary stats.
 *
 * @param players  - Array of players with projection fields. Exactly one
 *                   should have `isCaptain = true` for Cartola FC rules.
 * @param opts     - Simulation options (numSims, thresholds, histogramBuckets).
 * @returns        - SimResult with mean, std, percentiles, exceedance probs,
 *                   histogram, and disclaimer.
 */
export function simulateLineup(players: SimPlayer[], opts: SimOptions = {}): SimResult {
  const N = clamp(Math.floor(opts.numSims ?? 10_000), 1, 200_000);
  const thresholds = opts.thresholds ?? [75, 90, 100];
  const numBuckets = clamp(opts.histogramBuckets ?? 20, 5, 100);

  // ── Pre-compute per-player distribution params (O(M), done once) ──────────
  const dists: PlayerDist[] = players.map(buildDist);

  // ── Run N simulations (O(N × M)) ─────────────────────────────────────────
  // Float64Array avoids GC pressure during the hot loop.
  const teamScores = new Float64Array(N);

  for (const dist of dists) {
    const { playProb, captainMult } = dist;

    if (dist.kind === "deterministic") {
      // No sampling needed — contribute deterministic value scaled by play draw
      const contribution = dist.value * captainMult;
      for (let i = 0; i < N; i++) {
        if (Math.random() < playProb) {
          teamScores[i] += contribution;
        }
      }
    } else {
      // Stochastic: inverse-CDF truncated normal + Bernoulli play mask
      const { mu, sigma, floor, ceiling, pLo, pRange } = dist;
      for (let i = 0; i < N; i++) {
        // Bernoulli: player does not play → contributes 0
        if (Math.random() >= playProb) continue;

        // Sample from TruncNormal(μ, σ², floor, ceiling)
        const u = pLo + Math.random() * pRange;
        const score = clamp(mu + sigma * probit(u), floor, ceiling);
        teamScores[i] += score * captainMult;
      }
    }
  }

  // ── Sort once for O(log N) percentile / exceedance queries ───────────────
  teamScores.sort(); // TypedArray.sort is numeric by default

  // ── Summary statistics ────────────────────────────────────────────────────
  let sum = 0;
  for (let i = 0; i < N; i++) sum += teamScores[i];
  const mean = sum / N;

  let varSum = 0;
  for (let i = 0; i < N; i++) {
    const d = teamScores[i] - mean;
    varSum += d * d;
  }
  const stdDev = Math.sqrt(varSum / N);

  const pct = (frac: number) => teamScores[Math.min(Math.floor(N * frac), N - 1)] ?? 0;

  // ── Exceedance probabilities (binary search on sorted array) ─────────────
  const exceedanceProbabilities: Record<string, number> = {};
  for (const threshold of thresholds) {
    // Find first index where score > threshold
    let lo = 0;
    let hi = N;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((teamScores[mid] ?? 0) <= threshold) lo = mid + 1;
      else hi = mid;
    }
    exceedanceProbabilities[String(threshold)] = round2((N - lo) / N);
  }

  // ── Histogram (2nd–98th percentile range, O(N) pass on sorted array) ──────
  const histMin = teamScores[Math.floor(N * 0.02)] ?? 0;
  const histMax = teamScores[Math.min(Math.ceil(N * 0.98), N - 1)] ?? histMin + 1;
  const bucketWidth = (histMax - histMin) / numBuckets || 1;

  // Single linear pass (array is sorted → we track current bucket with a pointer)
  const counts = new Int32Array(numBuckets);
  for (let i = 0; i < N; i++) {
    const v = teamScores[i] ?? 0;
    if (v < histMin || v > histMax) continue;
    const b = Math.min(Math.floor((v - histMin) / bucketWidth), numBuckets - 1);
    counts[b]++;
  }

  const histogram: HistogramBucket[] = Array.from({ length: numBuckets }, (_, b) => ({
    min: round2(histMin + b * bucketWidth),
    max: round2(histMin + (b + 1) * bucketWidth),
    count: counts[b] ?? 0,
    frequency: round2((counts[b] ?? 0) / N),
  }));

  return {
    numSims: N,
    mean: round2(mean),
    stdDev: round2(stdDev),
    percentiles: {
      p10: round2(pct(0.1)),
      p25: round2(pct(0.25)),
      p50: round2(pct(0.5)),
      p75: round2(pct(0.75)),
      p90: round2(pct(0.9)),
    },
    exceedanceProbabilities,
    histogram,
    disclaimer: DISCLAIMER,
  };
}
