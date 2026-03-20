import { Router } from "express";
import axios from "axios";
import { generateLineup, type StrategyType } from "../optimizers/lineupOptimizer";
import { db } from "@workspace/db";
import { clubsTable } from "@workspace/db/schema";

const router = Router();

router.post("/lineup/generate", async (req, res) => {
  try {
    const { budget, formation, strategy, round } = req.body as {
      budget?: number;
      formation?: string;
      strategy?: string;
      round?: number;
    };

    let currentRound = round;
    if (!currentRound) {
      try {
        const r = await axios.get("https://api.cartola.globo.com/mercado/status", { timeout: 5000 });
        currentRound = (r.data as { rodada_atual?: number }).rodada_atual ?? 1;
      } catch {
        currentRound = 1;
      }
    }

    const validStrategies: StrategyType[] = ["safe", "aggressive", "cost-benefit", "antimassa"];
    const strategyType: StrategyType = validStrategies.includes(strategy as StrategyType)
      ? (strategy as StrategyType)
      : "safe";

    const [result, allClubs] = await Promise.all([
      generateLineup({
        round: currentRound,
        budgetLimit: budget ?? 100,
        formation: formation ?? "4-4-2",
        strategy: strategyType,
      }),
      db.select().from(clubsTable),
    ]);

    const clubMap = new Map(allClubs.map((c) => [c.id, c]));

    res.json({
      lineup: {
        id: result.id,
        round: result.round,
        strategyType: result.strategyType,
        formation: result.formation,
        budgetLimit: result.budgetLimit,
        totalCost: result.totalCost,
        expectedPoints: result.expectedPoints,
        captainExpectedPointsDoubled: result.captainExpectedPointsDoubled,
        riskScore: result.riskScore,
        captainPlayerId: result.captainPlayerId,
        coachPlayerId: result.coachPlayerId,
        players: result.players.map((p) => {
          const club = p.player.clubId ? clubMap.get(p.player.clubId) : undefined;
          return {
            playerId: p.playerId,
            position: p.position,
            slot: p.slot,
            orderIndex: p.orderIndex,
            isCaptain: p.isCaptain,
            name: p.player.name,
            nickname: p.player.nickname,
            price: p.player.price,
            averagePoints: p.player.averagePoints,
            gamesPlayed: p.player.gamesPlayed,
            expectedPoints: p.projection.expectedPoints,
            floorPoints: p.projection.floorPoints,
            ceilingPoints: p.projection.ceilingPoints,
            riskScore: p.projection.riskScore,
            recommendationScore: p.projection.recommendationScore,
            explanation: p.projection.explanationJson,
            clubId: p.player.clubId ?? null,
            clubAbbr: club?.abbreviation ?? club?.shortName ?? null,
            clubName: club?.name ?? null,
          };
        }),
      },
    });
  } catch (error) {
    console.error("[lineup/generate]", error);
    res.status(500).json({ error: "Failed to generate lineup", details: error instanceof Error ? error.message : String(error) });
  }
});

export default router;
