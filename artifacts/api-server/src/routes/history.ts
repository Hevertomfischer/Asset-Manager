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
}

router.get("/history/backtest", async (req, res) => {
  try {
    const roundParam = req.query["round"] ? Number(req.query["round"]) : null;
    const limitParam = req.query["limit"] ? Number(req.query["limit"]) : 10;

    log.info("Fetching backtest data", { round: roundParam });

    const projections = await db
      .select({
        playerId: playerProjectionTable.playerId,
        round: playerProjectionTable.round,
        expectedPoints: playerProjectionTable.expectedPoints,
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
      res.json({ rounds: [], summary: { mae: 0, totalPlayers: 0, byPosition: {}, message: "No projection data yet. Sync first." } });
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
      });
    }

    if (compared.length === 0) {
      res.json({
        rounds: [],
        summary: { mae: 0, totalPlayers: 0, byPosition: {}, message: "No actual points yet for projected rounds. Wait for round to complete." },
      });
      return;
    }

    const mae = compared.reduce((sum, c) => sum + c.absError, 0) / compared.length;

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

    log.info("Backtest computed", { totalPlayers: compared.length, mae: mae.toFixed(2) });

    res.json({
      summary: {
        mae: Number(mae.toFixed(2)),
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
    const rows = await db
      .selectDistinct({ round: playerScoutRoundTable.round })
      .from(playerScoutRoundTable)
      .orderBy(playerScoutRoundTable.round);
    res.json({ rounds: rows.map((r) => r.round) });
  } catch (err) {
    log.error("Failed to list rounds", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Failed to list rounds" });
  }
});

router.get("/history/lineup-backtest", async (req, res) => {
  try {
    const roundParam = req.query["round"] ? Number(req.query["round"]) : null;
    log.info("Fetching lineup backtest", { round: roundParam });

    const allLineups = await db
      .select()
      .from(lineupSuggestionTable)
      .where(isNotNull(lineupSuggestionTable.expectedPoints))
      .orderBy(sql`${lineupSuggestionTable.expectedPoints} DESC NULLS LAST`);

    if (allLineups.length === 0) {
      res.json({ rounds: [], message: "Nenhuma escalação salva. Gere uma escalação pela página de Escalação primeiro." });
      return;
    }

    const bestByRound = new Map<number, typeof allLineups[number]>();
    for (const lineup of allLineups) {
      if (roundParam !== null && lineup.round !== roundParam) continue;
      if (!bestByRound.has(lineup.round)) {
        bestByRound.set(lineup.round, lineup);
      }
    }

    const targetLineups = Array.from(bestByRound.values()).sort((a, b) => a.round - b.round);

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
    const actualMap = new Map<string, number>();
    for (const a of actuals) {
      actualMap.set(`${a.playerId}-${a.round}`, a.points ?? 0);
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
          const projectedPoints = projMap.get(`${p.playerId}-${lineup.round}`) ?? null;
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

      const projectedTotal = lineup.expectedPoints ?? null;
      const actualTotal = hasActualData
        ? playerRows.reduce((sum, p) => sum + (p.actual ?? 0), 0)
        : null;

      return {
        round: lineup.round,
        lineupId: lineup.id,
        strategyType: lineup.strategyType,
        formation: lineup.formation,
        totalCost: lineup.totalCost,
        projectedTotal: projectedTotal !== null ? Number(projectedTotal.toFixed(2)) : null,
        actualTotal: actualTotal !== null ? Number(actualTotal.toFixed(2)) : null,
        difference: projectedTotal !== null && actualTotal !== null
          ? Number(Math.abs(projectedTotal - actualTotal).toFixed(2))
          : null,
        differenceSign: projectedTotal !== null && actualTotal !== null
          ? (actualTotal >= projectedTotal ? "above" : "below")
          : null,
        hasActualData,
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

export default router;
