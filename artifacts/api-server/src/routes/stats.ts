/**
 * Public stats endpoints — no authentication required.
 *
 * GET /stats/performance
 *   Returns aggregated model accuracy metrics derived from historical
 *   projections vs real Cartola FC scores.  No player names are returned.
 *   Results are cached in-memory for 30 minutes to avoid recomputing
 *   expensive aggregations on every social-share hit.
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  playerProjectionTable,
  playerScoutRoundTable,
  playersTable,
  clubsTable,
} from "@workspace/db/schema";
import { and, inArray, isNotNull, eq, desc } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("stats");
const router = Router();

// ── In-memory cache (30 min TTL) ──────────────────────────────────────────────

interface CacheEntry {
  data: unknown;
  expiry: number;
}
let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000;

// ── Route ─────────────────────────────────────────────────────────────────────

router.get("/stats/performance", async (_req, res) => {
  // Serve from cache if fresh
  if (cache && Date.now() < cache.expiry) {
    res.json(cache.data);
    return;
  }

  try {
    log.info("Computing public performance stats");

    // ── 1. Projections (with player position via join) ─────────────────────────
    const projections = await db
      .select({
        playerId: playerProjectionTable.playerId,
        round: playerProjectionTable.round,
        expectedPoints: playerProjectionTable.expectedPoints,
        position: playersTable.position,
      })
      .from(playerProjectionTable)
      .innerJoin(playersTable, eq(playerProjectionTable.playerId, playersTable.id))
      .where(isNotNull(playerProjectionTable.expectedPoints));

    if (projections.length === 0) {
      res.json({
        empty: true,
        message: "Ainda não há dados históricos suficientes. Sincronize projeções e aguarde o fim de uma rodada.",
      });
      return;
    }

    const rounds = [...new Set(projections.map((p) => p.round))];

    // ── 2. Actual scores ───────────────────────────────────────────────────────
    const actuals = await db
      .select({
        playerId: playerScoutRoundTable.playerId,
        round: playerScoutRoundTable.round,
        points: playerScoutRoundTable.points,
        source: playerScoutRoundTable.source,
      })
      .from(playerScoutRoundTable)
      .where(
        and(
          inArray(playerScoutRoundTable.round, rounds),
          isNotNull(playerScoutRoundTable.points),
          inArray(playerScoutRoundTable.source, ["cartola_api", "historical_cartola"])
        )
      );

    // historical_cartola is authoritative — process cartola_api first, let it be overwritten
    const actualMap = new Map<string, number>();
    const sortedActuals = [...actuals].sort((a, b) =>
      a.source === "historical_cartola" ? 1 : b.source === "historical_cartola" ? -1 : 0
    );
    for (const a of sortedActuals) {
      const key = `${a.playerId}-${a.round}`;
      if (!actualMap.has(key) || a.source === "historical_cartola") {
        actualMap.set(key, a.points ?? 0);
      }
    }

    // ── 3. Pair projections with actuals ──────────────────────────────────────
    interface DataPoint {
      round: number;
      position: string;
      projected: number;
      actual: number;
      absError: number;
      overestimated: boolean;
    }

    const compared: DataPoint[] = [];
    for (const proj of projections) {
      const actual = actualMap.get(`${proj.playerId}-${proj.round}`);
      if (actual === undefined) continue;
      const projected = proj.expectedPoints ?? 0;
      compared.push({
        round: proj.round,
        position: proj.position ?? "?",
        projected,
        actual,
        absError: Math.abs(projected - actual),
        overestimated: projected > actual,
      });
    }

    if (compared.length === 0) {
      res.json({
        empty: true,
        message: "Rodadas com projeções ainda não têm pontuações reais. Aguarde o fim de uma rodada.",
      });
      return;
    }

    // ── 4. Season-level summary ────────────────────────────────────────────────
    const mae = compared.reduce((s, c) => s + c.absError, 0) / compared.length;
    const overestimatedPct =
      (compared.filter((c) => c.overestimated).length / compared.length) * 100;
    const uniqueRounds = [...new Set(compared.map((c) => c.round))];

    // ── 5. By-round MAE ────────────────────────────────────────────────────────
    const roundMap = new Map<number, DataPoint[]>();
    for (const c of compared) {
      if (!roundMap.has(c.round)) roundMap.set(c.round, []);
      roundMap.get(c.round)!.push(c);
    }
    const byRound = [...roundMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([round, group]) => ({
        round,
        mae: Number(
          (group.reduce((s, c) => s + c.absError, 0) / group.length).toFixed(2)
        ),
        count: group.length,
      }));

    // ── 6. Quartile calibration ────────────────────────────────────────────────
    // Sort all data points by projected value, split into 4 equal buckets.
    // A well-calibrated model has avgActual track avgProjected across quartiles.
    const sortedByProjected = [...compared].sort((a, b) => a.projected - b.projected);
    const n = sortedByProjected.length;
    const qSize = Math.max(1, Math.floor(n / 4));

    const quartileConfig = [
      { label: "Top projetados", bucket: "q1", slice: sortedByProjected.slice(n - qSize) },
      { label: "2ª faixa", bucket: "q2", slice: sortedByProjected.slice(n - 2 * qSize, n - qSize) },
      { label: "3ª faixa", bucket: "q3", slice: sortedByProjected.slice(qSize, 2 * qSize) },
      { label: "Menos projetados", bucket: "q4", slice: sortedByProjected.slice(0, qSize) },
    ];

    const calibration = quartileConfig.map(({ label, bucket, slice }) => ({
      label,
      bucket,
      avgProjected: Number(
        (slice.reduce((s, c) => s + c.projected, 0) / slice.length).toFixed(2)
      ),
      avgActual: Number(
        (slice.reduce((s, c) => s + c.actual, 0) / slice.length).toFixed(2)
      ),
      count: slice.length,
    }));

    // ── 7. Differentials: top-quartile players who beat global actual median ──
    const sortedActuals2 = compared.map((c) => c.actual).sort((a, b) => a - b);
    const globalMedianActual = sortedActuals2[Math.floor(sortedActuals2.length / 2)] ?? 0;

    const topQuartile = sortedByProjected.slice(n - qSize);
    const differentialHits = topQuartile.filter((c) => c.actual >= globalMedianActual);

    // ── 8. Traps: top-quartile players who scored < 50 % of their projection ─
    const traps = topQuartile.filter((c) => c.actual < c.projected * 0.5);

    // ── 9. By-position MAE ─────────────────────────────────────────────────────
    const posMap = new Map<string, DataPoint[]>();
    for (const c of compared) {
      if (!posMap.has(c.position)) posMap.set(c.position, []);
      posMap.get(c.position)!.push(c);
    }
    const byPosition = Object.fromEntries(
      [...posMap.entries()].map(([pos, group]) => [
        pos,
        {
          mae: Number(
            (group.reduce((s, c) => s + c.absError, 0) / group.length).toFixed(2)
          ),
          count: group.length,
          overestimatedPct: Number(
            ((group.filter((c) => c.overestimated).length / group.length) * 100).toFixed(1)
          ),
        },
      ])
    );

    // ── Build response ─────────────────────────────────────────────────────────
    const responseData = {
      season: {
        totalRounds: uniqueRounds.length,
        totalDataPoints: compared.length,
        mae: Number(mae.toFixed(2)),
        overestimatedPct: Number(overestimatedPct.toFixed(1)),
      },
      byRound,
      calibration,
      byPosition,
      differentials: {
        total: topQuartile.length,
        hits: differentialHits.length,
        hitRate: Number(
          ((differentialHits.length / Math.max(1, topQuartile.length)) * 100).toFixed(1)
        ),
      },
      traps: {
        total: topQuartile.length,
        count: traps.length,
        rate: Number(
          ((traps.length / Math.max(1, topQuartile.length)) * 100).toFixed(1)
        ),
      },
      meta: {
        generatedAt: new Date().toISOString(),
        disclaimer:
          "Dados históricos baseados em projeções do modelo e pontuações reais do Cartola FC. " +
          "MAE = Erro Médio Absoluto em pontos. Quartis calculados sobre todos os pares projeção-real disponíveis.",
      },
    };

    // Store in cache
    cache = { data: responseData, expiry: Date.now() + CACHE_TTL_MS };

    log.info("Performance stats computed", {
      rounds: uniqueRounds.length,
      dataPoints: compared.length,
      mae: responseData.season.mae,
    });

    res.json(responseData);
  } catch (err) {
    log.error("Stats performance failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Falha ao computar estatísticas de desempenho." });
  }
});

// ── Top projections (public) ──────────────────────────────────────────────────
// GET /stats/top-projections — top 5 da rodada atual sem auth. Cache 10 min.

let topProjectionsCache: CacheEntry | null = null;
const TOP_PROJ_CACHE_TTL_MS = 10 * 60 * 1000;

router.get("/stats/top-projections", async (_req, res) => {
  if (topProjectionsCache && Date.now() < topProjectionsCache.expiry) {
    res.json(topProjectionsCache.data);
    return;
  }

  try {
    // Latest round with projections
    const latestRoundResult = await db
      .select({ round: playerProjectionTable.round })
      .from(playerProjectionTable)
      .where(isNotNull(playerProjectionTable.expectedPoints))
      .orderBy(desc(playerProjectionTable.round))
      .limit(1);

    if (latestRoundResult.length === 0) {
      res.json({ round: null, players: [], generatedAt: new Date().toISOString() });
      return;
    }

    const currentRound = latestRoundResult[0]!.round;

    const rows = await db
      .select({
        playerId: playerProjectionTable.playerId,
        expectedPoints: playerProjectionTable.expectedPoints,
        playProbability: playerProjectionTable.playProbability,
        name: playersTable.name,
        nickname: playersTable.nickname,
        position: playersTable.position,
        price: playersTable.price,
        popularity: playersTable.popularity,
        clubAbbreviation: clubsTable.abbreviation,
        clubBadgeUrl: clubsTable.badgeUrl,
        clubName: clubsTable.name,
      })
      .from(playerProjectionTable)
      .innerJoin(playersTable, eq(playerProjectionTable.playerId, playersTable.id))
      .leftJoin(clubsTable, eq(playersTable.clubId, clubsTable.id))
      .where(
        and(
          eq(playerProjectionTable.round, currentRound),
          isNotNull(playerProjectionTable.expectedPoints),
        )
      )
      .orderBy(desc(playerProjectionTable.expectedPoints))
      .limit(5);

    const players = rows.map((r) => ({
      playerId: r.playerId,
      name: r.name,
      nickname: r.nickname,
      position: r.position,
      price: r.price,
      popularity: r.popularity,
      expectedPoints: r.expectedPoints,
      playProbability: r.playProbability,
      isDifferencial: (r.popularity ?? 1) < 0.15,
      club: {
        abbreviation: r.clubAbbreviation,
        badgeUrl: r.clubBadgeUrl,
        name: r.clubName,
      },
    }));

    const responseData = { round: currentRound, players, generatedAt: new Date().toISOString() };
    topProjectionsCache = { data: responseData, expiry: Date.now() + TOP_PROJ_CACHE_TTL_MS };

    log.info("Top projections served", { round: currentRound, count: players.length });
    res.json(responseData);
  } catch (err) {
    log.error("Stats top-projections failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Falha ao buscar projeções." });
  }
});

export default router;
