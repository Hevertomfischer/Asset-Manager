import { Router } from "express";
import { db } from "@workspace/db";
import { playerProjectionTable, playerScoutRoundTable, playersTable } from "@workspace/db/schema";
import { eq, and, inArray, isNotNull } from "drizzle-orm";
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
          eq(playerScoutRoundTable.source, "cartola")
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

export default router;
