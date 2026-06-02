import { Router } from "express";
import axios from "axios";
import { generateLineup, type StrategyType } from "../optimizers/lineupOptimizer";
import { getLatestProjectionRound } from "../repositories/projectionRepository";
import {
  getLineupReserves,
  getLineupSubstitutions,
  insertLineupSubstitutions,
} from "../repositories/lineupRepository";
import { processSubstitutions } from "../services/reserveService";
import { isPro } from "../services/accessService";
import { requirePro } from "../middlewares/requirePro";
import { db } from "@workspace/db";
import {
  clubsTable,
  lineupSuggestionTable,
  lineupSuggestionPlayerTable,
  playerScoutRoundTable,
  playersTable,
} from "@workspace/db/schema";
import { eq, and, inArray, isNotNull, count } from "drizzle-orm";

const router = Router();

// ─── Generate lineup (also saves reserves automatically) ─────────────────────
router.post("/lineup/generate", async (req, res) => {
  try {
    const { budget, formation, strategy, round } = req.body as {
      budget?: number;
      formation?: string;
      strategy?: string;
      round?: number;
    };

    // ── Access control ──────────────────────────────────────────────────────
    const userId = req.isAuthenticated() && req.user ? req.user.id : null;
    const userIsPro = userId !== null ? await isPro(userId) : false;

    const validStrategies: StrategyType[] = ["safe", "aggressive", "cost-benefit", "antimassa", "valorizacao"];
    const strategyType: StrategyType = validStrategies.includes(strategy as StrategyType)
      ? (strategy as StrategyType)
      : "safe";

    if (!userIsPro && strategyType !== "safe") {
      res.status(402).json({
        error: "Estratégias avançadas são exclusivas do plano Pro. Apenas a estratégia 'safe' está disponível no plano gratuito.",
        upgradeRequired: true,
      });
      return;
    }

    let currentRound = round;
    if (!currentRound) {
      try {
        const r = await axios.get("https://api.cartola.globo.com/mercado/status", { timeout: 5000 });
        currentRound = (r.data as { rodada_atual?: number }).rodada_atual ?? 1;
      } catch {
        currentRound = 1;
      }
    }

    const latestRound = await getLatestProjectionRound();
    if (latestRound !== null && latestRound < currentRound) {
      console.log(`[lineup/generate] No projections for round ${currentRound}, falling back to round ${latestRound}`);
      currentRound = latestRound;
    }

    if (!userIsPro && userId !== null) {
      const [row] = await db
        .select({ total: count() })
        .from(lineupSuggestionTable)
        .where(
          and(
            eq(lineupSuggestionTable.userId, userId),
            eq(lineupSuggestionTable.round, currentRound)
          )
        );
      if ((row?.total ?? 0) >= 1) {
        res.status(402).json({
          error: "Usuários do plano gratuito podem gerar apenas 1 escalação por rodada. Faça upgrade para Pro para gerações ilimitadas.",
          upgradeRequired: true,
        });
        return;
      }
    }

    const [result, allClubs] = await Promise.all([
      generateLineup({
        round: currentRound,
        budgetLimit: budget ?? 100.00,
        formation: formation ?? "4-4-2",
        strategy: strategyType,
      }),
      db.select().from(clubsTable),
    ]);

    const clubMap = new Map(allClubs.map((c) => [c.id, c]));

    if (userId !== null) {
      await db
        .update(lineupSuggestionTable)
        .set({ userId })
        .where(eq(lineupSuggestionTable.id, result.id));
    }

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
        reserves: result.reserves.map((r) => {
          const club = r.clubId ? clubMap.get(r.clubId) : undefined;
          return {
            playerId: r.playerId,
            position: r.position,
            isLuxuryReserve: r.isLuxuryReserve,
            expectedPoints: r.expectedPoints,
            floorPoints: r.floorPoints,
            ceilingPoints: r.ceilingPoints,
            price: r.price,
            orderIndex: r.orderIndex,
            name: r.playerName,
            nickname: r.playerNickname,
            clubId: r.clubId,
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

// ─── Get reserves for a lineup ───────────────────────────────────────────────
router.get("/lineup/:id/reserves", async (req, res) => {
  try {
    const lineupId = Number(req.params["id"]);
    if (isNaN(lineupId)) { res.status(400).json({ error: "Invalid lineup id" }); return; }

    const [reserves, allClubs, allPlayers] = await Promise.all([
      getLineupReserves(lineupId),
      db.select().from(clubsTable),
      db.select().from(playersTable),
    ]);

    const clubMap = new Map(allClubs.map((c) => [c.id, c]));
    const playerMap = new Map(allPlayers.map((p) => [p.id, p]));

    res.json({
      reserves: reserves.map((r) => {
        const player = playerMap.get(r.playerId);
        const club = player?.clubId ? clubMap.get(player.clubId) : undefined;
        return {
          id: r.id,
          playerId: r.playerId,
          position: r.position,
          isLuxuryReserve: r.isLuxuryReserve,
          expectedPoints: r.expectedPoints,
          floorPoints: r.floorPoints,
          ceilingPoints: r.ceilingPoints,
          price: r.price,
          orderIndex: r.orderIndex,
          name: player?.name ?? "Unknown",
          nickname: player?.nickname ?? null,
          clubId: player?.clubId ?? null,
          clubAbbr: club?.abbreviation ?? club?.shortName ?? null,
          clubName: club?.name ?? null,
        };
      }),
    });
  } catch (error) {
    console.error("[lineup/:id/reserves]", error);
    res.status(500).json({ error: "Failed to fetch reserves" });
  }
});

// ─── Simulate/process substitutions for a lineup round (backtest) ─────────────
router.post("/lineup/:id/substitutions/simulate", requirePro, async (req, res) => {
  try {
    const lineupId = Number(req.params["id"]);
    if (isNaN(lineupId)) { res.status(400).json({ error: "Invalid lineup id" }); return; }

    // Load lineup header
    const [lineupRow] = await db
      .select()
      .from(lineupSuggestionTable)
      .where(eq(lineupSuggestionTable.id, lineupId));
    if (!lineupRow) { res.status(404).json({ error: "Lineup not found" }); return; }

    const round = lineupRow.round;

    // Load starter players
    const starterRows = await db
      .select({
        playerId: lineupSuggestionPlayerTable.playerId,
        position: lineupSuggestionPlayerTable.position,
      })
      .from(lineupSuggestionPlayerTable)
      .where(eq(lineupSuggestionPlayerTable.lineupSuggestionId, lineupId));

    // Load reserves
    const reserveRows = await getLineupReserves(lineupId);

    // Load actual points for this round
    const allPlayerIds = [
      ...starterRows.map((s) => s.playerId!),
      ...reserveRows.map((r) => r.playerId),
    ];
    const actualScores = await db
      .select({
        playerId: playerScoutRoundTable.playerId,
        points: playerScoutRoundTable.points,
        source: playerScoutRoundTable.source,
      })
      .from(playerScoutRoundTable)
      .where(
        and(
          eq(playerScoutRoundTable.round, round),
          inArray(playerScoutRoundTable.playerId, allPlayerIds),
          isNotNull(playerScoutRoundTable.points),
          inArray(playerScoutRoundTable.source, ["cartola_api", "historical_cartola"])
        )
      );

    // Build actualMap (prefer historical_cartola)
    const actualMap = new Map<number, number>();
    const sortedScores = [...actualScores].sort((a, b) =>
      a.source === "historical_cartola" ? 1 : b.source === "historical_cartola" ? -1 : 0
    );
    for (const s of sortedScores) {
      if (!actualMap.has(s.playerId) || s.source === "historical_cartola") {
        actualMap.set(s.playerId, s.points ?? 0);
      }
    }

    const startersWithActual = starterRows.map((s) => ({
      playerId: s.playerId!,
      position: s.position ?? "?",
      actualPoints: actualMap.has(s.playerId!) ? actualMap.get(s.playerId!)! : null,
      played: actualMap.has(s.playerId!),
    }));

    const reservesWithActual = reserveRows.map((r) => ({
      playerId: r.playerId,
      playerName: "",
      playerNickname: null,
      position: r.position,
      clubId: null,
      expectedPoints: r.expectedPoints ?? 0,
      floorPoints: r.floorPoints ?? 0,
      ceilingPoints: r.ceilingPoints ?? 0,
      price: r.price ?? 0,
      isLuxuryReserve: r.isLuxuryReserve,
      orderIndex: r.orderIndex,
      actualPoints: actualMap.has(r.playerId) ? actualMap.get(r.playerId)! : null,
    }));

    const substitutions = processSubstitutions(
      startersWithActual,
      reservesWithActual,
      lineupRow.captainPlayerId
    );

    // Persist substitutions (idempotent: delete existing before re-inserting)
    if (substitutions.length > 0) {
      await insertLineupSubstitutions(
        substitutions.map((s) => ({
          lineupSuggestionId: lineupId,
          round,
          substitutionType: s.type,
          outPlayerId: s.outPlayerId,
          inPlayerId: s.inPlayerId,
          position: s.position,
          reason: s.reason,
          pointsRemoved: s.pointsRemoved,
          pointsAdded: s.pointsAdded,
        }))
      );
    }

    // Compute final points with substitutions
    const starterPointsTotal = startersWithActual.reduce((sum, s) => {
      const isCaptain = s.playerId === lineupRow.captainPlayerId;
      const pts = (s.actualPoints ?? 0) * (isCaptain ? 2 : 1);
      return sum + pts;
    }, 0);

    const pointsDelta = substitutions.reduce(
      (sum, s) => sum + s.pointsAdded - s.pointsRemoved,
      0
    );

    res.json({
      lineupId,
      round,
      originalPoints: Number(starterPointsTotal.toFixed(2)),
      finalPoints: Number((starterPointsTotal + pointsDelta).toFixed(2)),
      pointsGained: Number(pointsDelta.toFixed(2)),
      substitutions,
      hasActualData: actualMap.size > 0,
    });
  } catch (error) {
    console.error("[lineup/:id/substitutions/simulate]", error);
    res.status(500).json({ error: "Failed to simulate substitutions" });
  }
});

// ─── Get stored substitutions for a lineup ────────────────────────────────────
router.get("/lineup/:id/substitutions", async (req, res) => {
  try {
    const lineupId = Number(req.params["id"]);
    if (isNaN(lineupId)) { res.status(400).json({ error: "Invalid lineup id" }); return; }
    const subs = await getLineupSubstitutions(lineupId);
    res.json({ substitutions: subs });
  } catch (error) {
    console.error("[lineup/:id/substitutions]", error);
    res.status(500).json({ error: "Failed to fetch substitutions" });
  }
});

export default router;
