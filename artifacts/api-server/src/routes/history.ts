import { Router } from "express";
import { db } from "@workspace/db";
import {
  playerProjectionTable,
  playerScoutRoundTable,
  playersTable,
  lineupSuggestionTable,
  lineupSuggestionPlayerTable,
  clubsTable,
} from "@workspace/db/schema";
import { eq, and, inArray, isNotNull, desc, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { requirePro } from "../middlewares/requirePro";

const log = createLogger("history");
const router = Router();

interface BacktestPlayer {
  playerId: number;
  name: string;
  position: string;
  round: number;
  projected: number;
  actual: number;
  error: number;
  absError: number;
  overestimated: boolean;
  didNotPlay: boolean;
}

router.get("/history/backtest", requirePro, async (req, res) => {
  try {
    const roundParam = req.query["round"] ? Number(req.query["round"]) : null;
    const limitParam = req.query["limit"] ? Number(req.query["limit"]) : 10;

    log.info("Fetching backtest data", { round: roundParam });

    const projections = await db
      .select({
        playerId: playerProjectionTable.playerId,
        round: playerProjectionTable.round,
        expectedPoints: playerProjectionTable.expectedPoints,
        playProbability: playerProjectionTable.playProbability,
        playerName: playersTable.name,
        position: playersTable.position,
      })
      .from(playerProjectionTable)
      .innerJoin(playersTable, eq(playerProjectionTable.playerId, playersTable.id))
      .where(
        and(
          isNotNull(playerProjectionTable.expectedPoints),
          roundParam ? eq(playerProjectionTable.round, roundParam) : undefined
        )
      );

    if (projections.length === 0) {
      res.json({ summary: { mae: 0, totalPlayers: 0, byPosition: {}, byRound: [], message: "No projection data yet. Sync first." }, bestPredictions: [], worstPredictions: [] });
      return;
    }

    const rounds = [...new Set(projections.map((p) => p.round))];

    const actuals = await db
      .select({
        playerId: playerScoutRoundTable.playerId,
        round: playerScoutRoundTable.round,
        points: playerScoutRoundTable.points,
      })
      .from(playerScoutRoundTable)
      .where(
        and(
          inArray(playerScoutRoundTable.round, rounds),
          isNotNull(playerScoutRoundTable.points),
          inArray(playerScoutRoundTable.source, ["cartola_api", "historical_cartola"])
        )
      );

    const actualMap = new Map<string, number>();
    for (const a of actuals) {
      actualMap.set(`${a.playerId}-${a.round}`, a.points ?? 0);
    }

    const compared: BacktestPlayer[] = [];
    for (const proj of projections) {
      const actual = actualMap.get(`${proj.playerId}-${proj.round}`);
      if (actual === undefined) continue;
      const projected = proj.expectedPoints ?? 0;
      // Skip zero-projection players — the model already flagged them as unavailable.
      // Including them (projected=0, actual=0) creates trivially "perfect" predictions
      // that inflate accuracy metrics without reflecting real forecasting quality.
      if (projected < 0.01) continue;
      const error = projected - actual;
      compared.push({
        playerId: proj.playerId,
        name: proj.playerName ?? "Unknown",
        position: proj.position ?? "?",
        round: proj.round,
        projected: Number(projected.toFixed(2)),
        actual: Number(actual.toFixed(2)),
        error: Number(error.toFixed(2)),
        absError: Number(Math.abs(error).toFixed(2)),
        overestimated: error > 0,
        didNotPlay: actual === 0,
      });
    }

    if (compared.length === 0) {
      res.json({
        summary: { mae: 0, maePlayedOnly: 0, playedCount: 0, dnpCount: 0, totalPlayers: 0, byPosition: {}, byRound: [], message: "No actual points yet for projected rounds. Wait for round to complete." },
        bestPredictions: [],
        worstPredictions: [],
      });
      return;
    }

    const mae = compared.reduce((sum, c) => sum + c.absError, 0) / compared.length;

    // MAE for players who actually played (actual > 0) — the honest accuracy of the scoring model.
    // Including DNP players (actual = 0) deflates the overall MAE because their projected pts
    // are small (already discounted by playProbability), making the error artificially low.
    const playedOnly = compared.filter((c) => !c.didNotPlay);
    const maePlayedOnly = playedOnly.length > 0
      ? playedOnly.reduce((sum, c) => sum + c.absError, 0) / playedOnly.length
      : 0;
    const dnpCount = compared.filter((c) => c.didNotPlay).length;

    const byPosition: Record<string, { mae: number; count: number; overestimatedPct: number }> = {};
    const posGroups = new Map<string, BacktestPlayer[]>();
    for (const c of compared) {
      if (!posGroups.has(c.position)) posGroups.set(c.position, []);
      posGroups.get(c.position)!.push(c);
    }
    for (const [pos, group] of posGroups) {
      const posMae = group.reduce((s, c) => s + c.absError, 0) / group.length;
      const overPct = group.filter((c) => c.overestimated).length / group.length;
      byPosition[pos] = { mae: Number(posMae.toFixed(2)), count: group.length, overestimatedPct: Number((overPct * 100).toFixed(1)) };
    }

    const byRound: Record<number, { round: number; mae: number; count: number }> = {};
    const roundGroups = new Map<number, BacktestPlayer[]>();
    for (const c of compared) {
      if (!roundGroups.has(c.round)) roundGroups.set(c.round, []);
      roundGroups.get(c.round)!.push(c);
    }
    for (const [round, group] of roundGroups) {
      byRound[round] = {
        round,
        mae: Number((group.reduce((s, c) => s + c.absError, 0) / group.length).toFixed(2)),
        count: group.length,
      };
    }

    const sorted = [...compared].sort((a, b) => a.absError - b.absError);
    const bestPredictions = sorted.slice(0, limitParam);
    const worstPredictions = [...compared].sort((a, b) => b.absError - a.absError).slice(0, limitParam);

    log.info("Backtest computed", { totalPlayers: compared.length, mae: mae.toFixed(2), maePlayedOnly: maePlayedOnly.toFixed(2) });

    res.json({
      summary: {
        mae: Number(mae.toFixed(2)),
        maePlayedOnly: Number(maePlayedOnly.toFixed(2)),
        playedCount: playedOnly.length,
        dnpCount,
        totalPlayers: compared.length,
        byPosition,
        byRound: Object.values(byRound).sort((a, b) => a.round - b.round),
        message: null,
      },
      bestPredictions,
      worstPredictions,
    });
  } catch (err) {
    log.error("Backtest failed", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to compute backtest" });
  }
});

router.get("/history/rounds", async (_req, res) => {
  try {
    // Only return rounds that have BOTH projection data AND actual scout data
    // so the round selector never leads to an empty backtest result.
    const projRounds = await db
      .selectDistinct({ round: playerProjectionTable.round })
      .from(playerProjectionTable)
      .where(isNotNull(playerProjectionTable.expectedPoints));

    const projRoundSet = new Set(projRounds.map((r) => r.round));

    const scoutRounds = await db
      .selectDistinct({ round: playerScoutRoundTable.round })
      .from(playerScoutRoundTable)
      .where(
        and(
          isNotNull(playerScoutRoundTable.points),
          inArray(playerScoutRoundTable.source, ["cartola_api", "historical_cartola"])
        )
      )
      .orderBy(playerScoutRoundTable.round);

    const intersected = scoutRounds
      .map((r) => r.round)
      .filter((r) => projRoundSet.has(r));

    res.json({ rounds: intersected });
  } catch (err) {
    log.error("Failed to list rounds", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to list rounds" });
  }
});

router.get("/history/lineup-backtest", requirePro, async (req, res) => {
  try {
    const roundParam = req.query["round"] ? Number(req.query["round"]) : null;
    log.info("Fetching lineup backtest", { round: roundParam });

    const allLineups = await db
      .select()
      .from(lineupSuggestionTable)
      .where(isNotNull(lineupSuggestionTable.expectedPoints))
      .orderBy(lineupSuggestionTable.round, lineupSuggestionTable.strategyType);

    if (allLineups.length === 0) {
      res.json({ rounds: [], message: "Nenhuma escalação salva. Gere uma escalação pela página de Escalação primeiro." });
      return;
    }

    // Keep ALL lineups (one per round+strategy combination), not just the best per round.
    // Deduplicate by round+strategy keeping the latest (highest id).
    const bestByRoundStrategy = new Map<string, typeof allLineups[number]>();
    for (const lineup of allLineups) {
      if (roundParam !== null && lineup.round !== roundParam) continue;
      const key = `${lineup.round}_${lineup.strategyType ?? "unknown"}`;
      const existing = bestByRoundStrategy.get(key);
      if (!existing || lineup.id > existing.id) {
        bestByRoundStrategy.set(key, lineup);
      }
    }

    const targetLineups = Array.from(bestByRoundStrategy.values()).sort(
      (a, b) => a.round - b.round || (a.strategyType ?? "").localeCompare(b.strategyType ?? "")
    );

    if (targetLineups.length === 0) {
      res.json({ rounds: [], message: "Nenhuma escalação encontrada para a rodada selecionada." });
      return;
    }

    const lineupIds = targetLineups.map((l) => l.id);
    const lineupRounds = targetLineups.map((l) => l.round);

    const [lineupPlayers, allClubs, actuals] = await Promise.all([
      db
        .select({
          lineupSuggestionId: lineupSuggestionPlayerTable.lineupSuggestionId,
          playerId: lineupSuggestionPlayerTable.playerId,
          position: lineupSuggestionPlayerTable.position,
          slot: lineupSuggestionPlayerTable.slot,
          orderIndex: lineupSuggestionPlayerTable.orderIndex,
          storedProjectedPoints: lineupSuggestionPlayerTable.projectedPoints,
          playerName: playersTable.name,
          playerNickname: playersTable.nickname,
          clubId: playersTable.clubId,
        })
        .from(lineupSuggestionPlayerTable)
        .innerJoin(playersTable, eq(lineupSuggestionPlayerTable.playerId, playersTable.id))
        .where(inArray(lineupSuggestionPlayerTable.lineupSuggestionId, lineupIds)),
      db.select().from(clubsTable),
      db
        .select({
          playerId: playerScoutRoundTable.playerId,
          round: playerScoutRoundTable.round,
          points: playerScoutRoundTable.points,
          source: playerScoutRoundTable.source,
        })
        .from(playerScoutRoundTable)
        .where(
          and(
            inArray(playerScoutRoundTable.round, lineupRounds),
            isNotNull(playerScoutRoundTable.points),
            inArray(playerScoutRoundTable.source, ["cartola_api", "historical_cartola"])
          )
        ),
    ]);

    const projections = await db
      .select({
        playerId: playerProjectionTable.playerId,
        round: playerProjectionTable.round,
        expectedPoints: playerProjectionTable.expectedPoints,
      })
      .from(playerProjectionTable)
      .where(
        and(
          inArray(playerProjectionTable.round, lineupRounds),
          isNotNull(playerProjectionTable.expectedPoints)
        )
      );

    const clubMap = new Map(allClubs.map((c) => [c.id, c]));

    // Build actualMap: process cartola_api first, then historical_cartola so it overwrites
    // (historical_cartola has corrected computed points; cartola_api may have stale 0-point records)
    const actualMap = new Map<string, number>();
    const sortedActuals = [...actuals].sort((a, b) => {
      if (a.source === b.source) return 0;
      return a.source === "historical_cartola" ? 1 : -1; // historical_cartola last → wins
    });
    for (const a of sortedActuals) {
      const key = `${a.playerId}-${a.round}`;
      const pts = a.points ?? 0;
      // Only set if not already set, OR if this is historical_cartola (authoritative)
      if (!actualMap.has(key) || a.source === "historical_cartola") {
        actualMap.set(key, pts);
      }
    }
    const projMap = new Map<string, number>();
    for (const p of projections) {
      projMap.set(`${p.playerId}-${p.round}`, p.expectedPoints ?? 0);
    }

    const playersByLineup = new Map<number, typeof lineupPlayers>();
    for (const lp of lineupPlayers) {
      if (!playersByLineup.has(lp.lineupSuggestionId)) {
        playersByLineup.set(lp.lineupSuggestionId, []);
      }
      playersByLineup.get(lp.lineupSuggestionId)!.push(lp);
    }

    const result = targetLineups.map((lineup) => {
      const players = playersByLineup.get(lineup.id) ?? [];
      const captainId = lineup.captainPlayerId;
      const nonCoachPlayers = players.filter((p) => p.position !== "TEC");
      const playersWithActual = nonCoachPlayers.filter((p) => actualMap.has(`${p.playerId}-${lineup.round}`));
      const hasActualData =
        nonCoachPlayers.length > 0 &&
        playersWithActual.length >= Math.ceil(nonCoachPlayers.length * 0.5);

      const playerRows = players
        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
        .map((p) => {
          const isCaptain = p.playerId === captainId;
          const isCoach = p.position === "TEC";
          const actualRaw = actualMap.get(`${p.playerId}-${lineup.round}`) ?? null;
          const actualPoints = actualRaw !== null ? (isCaptain ? actualRaw * 2 : actualRaw) : null;
          // Use live projection table first (current round), fall back to stored snapshot at generation time
          const projectedPoints = projMap.get(`${p.playerId}-${lineup.round}`) ?? p.storedProjectedPoints ?? null;
          const club = p.clubId ? clubMap.get(p.clubId) : undefined;

          return {
            playerId: p.playerId,
            name: p.playerName,
            nickname: p.playerNickname ?? null,
            position: p.position ?? "?",
            isCaptain,
            isCoach,
            clubAbbr: club?.abbreviation ?? club?.shortName ?? null,
            clubName: club?.name ?? null,
            projected: projectedPoints !== null ? Number(projectedPoints.toFixed(2)) : null,
            actual: actualPoints !== null ? Number(actualPoints.toFixed(2)) : null,
            actualRaw: actualRaw !== null ? Number(actualRaw.toFixed(2)) : null,
            error: projectedPoints !== null && actualPoints !== null
              ? Number((projectedPoints - actualPoints).toFixed(2))
              : null,
          };
        });

      const projectedFullTotal = lineup.expectedPoints ?? null;

      // For comparison, only count players where BOTH projected and actual are known
      // This makes the diff apples-to-apples (not penalized for missing historical data)
      const rowsWithBoth = playerRows.filter((p) => p.projected !== null && p.actual !== null);
      const actualTotal = hasActualData
        ? playerRows.reduce((sum, p) => sum + (p.actual ?? 0), 0)
        : null;
      // comparable projected: sum of projected only for players with actual data
      const projectedComparableTotal = hasActualData && rowsWithBoth.length > 0
        ? rowsWithBoth.reduce((sum, p) => sum + (p.projected ?? 0), 0)
        : null;
      const actualComparableTotal = hasActualData && rowsWithBoth.length > 0
        ? rowsWithBoth.reduce((sum, p) => sum + (p.actual ?? 0), 0)
        : null;

      // Exclude TEC from both sides so the coach doesn't inflate or deflate the coverage count
      const playersWithData = playerRows.filter((p) => p.position !== "TEC" && p.actual !== null).length;
      const allCoveredByData = playersWithData >= playerRows.filter((p) => p.position !== "TEC").length;

      return {
        round: lineup.round,
        lineupId: lineup.id,
        strategyType: lineup.strategyType,
        formation: lineup.formation,
        totalCost: lineup.totalCost,
        projectedTotal: projectedFullTotal !== null ? Number(projectedFullTotal.toFixed(2)) : null,
        projectedComparableTotal: projectedComparableTotal !== null ? Number(projectedComparableTotal.toFixed(2)) : null,
        actualTotal: actualTotal !== null ? Number(actualTotal.toFixed(2)) : null,
        difference: projectedComparableTotal !== null && actualComparableTotal !== null
          ? Number(Math.abs(projectedComparableTotal - actualComparableTotal).toFixed(2))
          : null,
        differenceSign: projectedComparableTotal !== null && actualComparableTotal !== null
          ? (actualComparableTotal >= projectedComparableTotal ? "above" : "below")
          : null,
        hasActualData,
        playersWithData,
        allCoveredByData,
        players: playerRows,
      };
    });

    log.info("Lineup backtest computed", { rounds: result.length });
    res.json({ rounds: result, message: null });
  } catch (err) {
    log.error("Lineup backtest failed", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to compute lineup backtest" });
  }
});

router.get("/history/lineup-rounds", async (_req, res) => {
  try {
    const rows = await db
      .selectDistinct({ round: lineupSuggestionTable.round })
      .from(lineupSuggestionTable)
      .orderBy(lineupSuggestionTable.round);
    res.json({ rounds: rows.map((r) => r.round) });
  } catch (err) {
    log.error("Failed to list lineup rounds", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to list lineup rounds" });
  }
});

// ── Time Perfeito ─────────────────────────────────────────────────────────────
// Standard Cartola FC "perfect team" slots per position
const PERFECT_TEAM_SLOTS: Record<string, number> = {
  GOL: 1, ZAG: 2, LAT: 2, MEI: 3, ATA: 3, TEC: 1,
};

router.get("/history/perfect-team", requirePro, async (req, res) => {
  try {
    const roundParam = req.query["round"] ? Number(req.query["round"]) : null;
    if (!roundParam) {
      res.status(400).json({ error: "round param required" });
      return;
    }

    // 1. Actual points for the round (only positive scorers)
    const actuals = await db
      .select({
        playerId: playerScoutRoundTable.playerId,
        points: playerScoutRoundTable.points,
        playerName: playersTable.name,
        playerNickname: playersTable.nickname,
        position: playersTable.position,
        clubId: playersTable.clubId,
      })
      .from(playerScoutRoundTable)
      .innerJoin(playersTable, eq(playerScoutRoundTable.playerId, playersTable.id))
      .where(
        and(
          eq(playerScoutRoundTable.round, roundParam),
          isNotNull(playerScoutRoundTable.points),
          inArray(playerScoutRoundTable.source, ["cartola_api", "historical_cartola"])
        )
      );

    if (actuals.length === 0) {
      res.json({ round: roundParam, perfectTeam: [], stats: null, message: "Sem dados reais para esta rodada." });
      return;
    }

    // 2. Our projections for the round
    const projections = await db
      .select({
        playerId: playerProjectionTable.playerId,
        expectedPoints: playerProjectionTable.expectedPoints,
      })
      .from(playerProjectionTable)
      .where(eq(playerProjectionTable.round, roundParam));

    const projMap = new Map(projections.map((p) => [p.playerId, p.expectedPoints ?? 0]));

    // 3. Our lineup suggestion for the round (latest one)
    const lineupSuggestions = await db
      .select({ id: lineupSuggestionTable.id })
      .from(lineupSuggestionTable)
      .where(eq(lineupSuggestionTable.round, roundParam))
      .orderBy(desc(lineupSuggestionTable.id))
      .limit(1);

    const suggestedPlayerIds = new Set<number>();
    if (lineupSuggestions.length > 0) {
      const lineupPlayers = await db
        .select({ playerId: lineupSuggestionPlayerTable.playerId })
        .from(lineupSuggestionPlayerTable)
        .where(eq(lineupSuggestionPlayerTable.lineupSuggestionId, lineupSuggestions[0]!.id));
      for (const lp of lineupPlayers) suggestedPlayerIds.add(lp.playerId);
    }

    // 4. Build rank map per position (rank by our projection desc)
    const byPosition = new Map<string, typeof actuals>();
    for (const a of actuals) {
      const pos = a.position ?? "?";
      if (!byPosition.has(pos)) byPosition.set(pos, []);
      byPosition.get(pos)!.push(a);
    }

    const rankMap = new Map<number, number>();
    for (const [, group] of byPosition) {
      const sorted = [...group].sort((a, b) => (projMap.get(b.playerId) ?? 0) - (projMap.get(a.playerId) ?? 0));
      sorted.forEach((p, i) => rankMap.set(p.playerId, i + 1));
    }

    // 5. Clubs lookup
    const clubs = await db.select().from(clubsTable);
    const clubMap = new Map(clubs.map((c) => [c.id, c]));

    // 6. Build perfect team: top N per position
    const perfectTeam: Array<{
      playerId: number;
      name: string;
      nickname: string | null;
      position: string;
      clubId: number | null;
      clubName: string | null;
      clubBadgeUrl: string | null;
      actualPoints: number;
      ourProjection: number | null;
      ourRankInPosition: number | null;
      totalInPosition: number;
      wasInOurLineup: boolean;
    }> = [];

    for (const [pos, slots] of Object.entries(PERFECT_TEAM_SLOTS)) {
      const group = (byPosition.get(pos) ?? [])
        .filter((p) => (p.points ?? 0) > 0)
        .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
        .slice(0, slots);

      const totalInPos = (byPosition.get(pos) ?? []).filter((p) => projMap.has(p.playerId)).length;

      for (const p of group) {
        const club = p.clubId ? clubMap.get(p.clubId) ?? null : null;
        perfectTeam.push({
          playerId: p.playerId,
          name: p.playerName ?? "?",
          nickname: p.playerNickname ?? null,
          position: pos,
          clubId: p.clubId ?? null,
          clubName: club?.name ?? null,
          clubBadgeUrl: club?.badgeUrl ?? null,
          actualPoints: Number((p.points ?? 0).toFixed(2)),
          ourProjection: projMap.has(p.playerId) ? Number((projMap.get(p.playerId) ?? 0).toFixed(2)) : null,
          ourRankInPosition: rankMap.get(p.playerId) ?? null,
          totalInPosition: totalInPos,
          wasInOurLineup: suggestedPlayerIds.has(p.playerId),
        });
      }
    }

    // 7. Aggregate stats
    const withProjection = perfectTeam.filter((p) => p.ourProjection !== null);
    const hitCount = perfectTeam.filter((p) => p.wasInOurLineup).length;
    const hitPct = perfectTeam.length > 0 ? Number(((hitCount / perfectTeam.length) * 100).toFixed(1)) : 0;
    const avgDeviation = withProjection.length > 0
      ? Number((withProjection.reduce((s, p) => s + Math.abs((p.ourProjection ?? 0) - p.actualPoints), 0) / withProjection.length).toFixed(2))
      : null;
    const avgRank = withProjection.filter((p) => p.ourRankInPosition !== null).length > 0
      ? Number((withProjection.reduce((s, p) => s + (p.ourRankInPosition ?? 0), 0) / withProjection.filter((p) => p.ourRankInPosition !== null).length).toFixed(1))
      : null;
    const totalActual = Number(perfectTeam.reduce((s, p) => s + p.actualPoints, 0).toFixed(2));
    const totalProjected = withProjection.length > 0
      ? Number(withProjection.reduce((s, p) => s + (p.ourProjection ?? 0), 0).toFixed(2))
      : null;

    log.info("Perfect team computed", { round: roundParam, players: perfectTeam.length, hitPct });

    res.json({
      round: roundParam,
      perfectTeam,
      stats: { hitCount, hitPct, avgDeviation, avgRank, totalActual, totalProjected },
      message: null,
    });
  } catch (err) {
    log.error("Perfect team failed", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to compute perfect team" });
  }
});

router.get("/history/perfect-team-rounds", requirePro, async (_req, res) => {
  try {
    const rows = await db
      .selectDistinct({ round: playerScoutRoundTable.round })
      .from(playerScoutRoundTable)
      .where(inArray(playerScoutRoundTable.source, ["cartola_api", "historical_cartola"]))
      .orderBy(playerScoutRoundTable.round);
    res.json({ rounds: rows.map((r) => r.round) });
  } catch (err) {
    res.status(500).json({ error: "Failed to list rounds" });
  }
});

export default router;
