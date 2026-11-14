import { Router } from "express";
import axios from "axios";
import { generateLineup, LineupValidationError, type StrategyType } from "../optimizers/lineupOptimizer";
import { generateFrontier } from "../services/frontierService";
import { compareFormations } from "../services/formationComparison";
import { simulateLineup, type SimPlayer } from "../engines/monteCarlo";
import { getLatestProjectionRound, getProjectionsByRound } from "../repositories/projectionRepository";
import { getPopularityFeatureStatus, POPULARITY_CALIBRATION_MESSAGE } from "../services/popularityFeatureService";
import {
  getLineupReserves,
  getLineupSubstitutions,
  insertLineupSubstitutions,
  markLineupSaved,
} from "../repositories/lineupRepository";
import { processSubstitutions } from "../services/reserveService";
import { validateAndSimulate, type PlayerSnapshot } from "../services/swapValidation";
import { isPro } from "../services/accessService";
import { getLineupAccessConfig } from "../services/lineupAccessConfig";
import { requirePro } from "../middlewares/requirePro";
import { createLogger } from "../lib/logger";
import { LINEUP_CONFIG } from "../config/projectionWeights";
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
router.post(["/lineup/generate", "/lineup/compare-formations"], async (req, res) => {
  const isComparison = req.path === "/lineup/compare-formations";
  try {
    const { budget, formation, strategy, round } = (req.body ?? {}) as {
      budget?: number;
      formation?: string;
      strategy?: string;
      round?: number;
      lockedPlayerIds?: unknown;
      excludedPlayerIds?: unknown;
    };
    if (budget != null && (typeof budget !== "number" || !Number.isFinite(budget) || budget <= 0)) {
      res.status(400).json({ error: "O patrimônio deve ser um número maior que zero." });
      return;
    }
    if (round != null && (!Number.isInteger(round) || round <= 0)) {
      res.status(400).json({ error: "A rodada deve ser um número inteiro positivo." });
      return;
    }

    const parsePlayerIds = (value: unknown, field: string): number[] => {
      if (value == null) return [];
      if (!Array.isArray(value)) {
        throw new Error(`O campo '${field}' deve ser um array de IDs inteiros.`);
      }
      const ids = value.map((id) => {
        const parsed = typeof id === "number" ? id : typeof id === "string" && id.trim() !== "" ? Number(id) : NaN;
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new Error(`O campo '${field}' deve conter apenas IDs inteiros positivos.`);
        }
        return parsed;
      });
      return [...new Set(ids)];
    };
    let lockedPlayerIds: number[];
    let excludedPlayerIds: number[];
    try {
      lockedPlayerIds = parsePlayerIds(req.body?.lockedPlayerIds, "lockedPlayerIds");
      excludedPlayerIds = parsePlayerIds(req.body?.excludedPlayerIds, "excludedPlayerIds");
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const overlap = lockedPlayerIds.filter((id) => excludedPlayerIds.includes(id));
    if (overlap.length > 0) {
      res.status(422).json({
        error: `Os jogadores ${overlap.join(", ")} não podem estar travados e excluídos ao mesmo tempo.`,
      });
      return;
    }

    // ── Access control ──────────────────────────────────────────────────────
    const userId = req.isAuthenticated() && req.user ? req.user.id : null;
    const userIsPro = userId !== null ? await isPro(userId) : false;
    const accessConfig = !isComparison ? await getLineupAccessConfig() : null;
    if (!isComparison && userId === null && accessConfig?.anonymousLineupMode === "login_required") {
      res.status(401).json({
        error: "Entre com Google para gerar sua escalação grátis",
        reason: "login_required",
      });
      return;
    }

    const validStrategies: StrategyType[] = ["safe", "aggressive", "cost-benefit", "antimassa", "valorizacao"];
    const strategyType: StrategyType = validStrategies.includes(strategy as StrategyType)
      ? (strategy as StrategyType)
      : "safe";

    if (strategyType === "antimassa" && !(await getPopularityFeatureStatus()).popularityFeaturesEnabled) {
      res.status(409).json({ error: POPULARITY_CALIBRATION_MESSAGE, popularityFeaturesEnabled: false });
      return;
    }

    if (!userIsPro && strategyType !== "safe") {
      res.status(402).json({
        error: "Estratégias avançadas são exclusivas do plano Pro. Apenas a estratégia 'safe' está disponível no plano gratuito.",
        upgradeRequired: true,
        reason: "pro_strategy",
      });
      return;
    }
    if (!userIsPro && lockedPlayerIds.length > 1) {
      res.status(402).json({
        error: "No plano gratuito, você pode travar no máximo 1 jogador por escalação. Faça upgrade para Pro para travar jogadores ilimitados.",
        upgradeRequired: true,
        reason: "locked_limit",
      });
      return;
    }
    if (!userIsPro && excludedPlayerIds.length > 3) {
      res.status(402).json({
        error: "No plano gratuito, você pode excluir no máximo 3 jogadores por escalação. Faça upgrade para Pro para excluir jogadores ilimitados.",
        upgradeRequired: true,
        reason: "excluded_limit",
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

    if (!isComparison && !userIsPro && userId !== null) {
      const [row] = await db
        .select({ total: count() })
        .from(lineupSuggestionTable)
        .where(
          and(
            eq(lineupSuggestionTable.userId, userId),
            eq(lineupSuggestionTable.round, currentRound)
          )
        );
      if ((row?.total ?? 0) >= (accessConfig?.freeLineupsPerRound ?? 1)) {
        res.status(402).json({
          error: `O plano gratuito permite ${accessConfig?.freeLineupsPerRound ?? 1} escalação(ões) por rodada. Faça upgrade para Pro para gerações ilimitadas.`,
          upgradeRequired: true,
          reason: "round_quota",
        });
        return;
      }
    }

    if (isComparison) {
      res.json(await compareFormations({
        round: currentRound,
        budgetLimit: budget ?? 100,
        strategy: strategyType,
        lockedPlayerIds,
        excludedPlayerIds,
      }));
      return;
    }

    const [result, allClubs] = await Promise.all([
      generateLineup({
        round: currentRound,
        budgetLimit: budget ?? 100.00,
        formation: formation ?? "4-4-2",
        strategy: strategyType,
        lockedPlayerIds,
        excludedPlayerIds,
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
          const mpv = p.player.minimoParaValorizar ?? null;
          const proj = p.projection.expectedPoints ?? null;
          const valorizacaoMargin = mpv != null && proj != null ? proj - mpv : null;
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
            minimoParaValorizar: mpv,
            valorizacaoMargin,
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
            averagePoints: r.averagePoints ?? null,
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
    createLogger("lineup").error("Falha ao avaliar escalação", { error: String(error), isComparison });
    if (error instanceof LineupValidationError) {
      res.status(422).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: isComparison
      ? "Não foi possível comparar as formações. Tente novamente."
      : "Failed to generate lineup" });
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
          averagePoints: player?.averagePoints ?? null,
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

// ─── Simulate a player swap ───────────────────────────────────────────────────
// POST /lineup/simulate  (requirePro)
// Body: { lineup: number[], captainId?: number|null, swap: { outId, inId },
//         budget?: number, round?: number }
// Returns: { before, after, delta, valid, reason }
router.post("/lineup/simulate", requirePro, async (req, res) => {
  const log = createLogger("lineup/simulate");
  try {
    const {
      lineup: lineupIds,
      captainId = null,
      swap,
      budget,
      round,
    } = req.body as {
      lineup: number[];
      captainId?: number | null;
      swap?: { outId: number; inId: number };
      budget?: number;
      round?: number;
    };

    // ── Validação de input ────────────────────────────────────────────────
    if (!Array.isArray(lineupIds) || lineupIds.length === 0) {
      res.status(400).json({ error: "Campo 'lineup' obrigatório (array de player IDs)." });
      return;
    }
    if (!swap?.outId || !swap?.inId) {
      res.status(400).json({ error: "Campo 'swap' obrigatório com outId e inId." });
      return;
    }
    if (swap.outId === swap.inId) {
      res.status(400).json({ error: "'outId' e 'inId' devem ser diferentes." });
      return;
    }

    // ── Resolve round ────────────────────────────────────────────────────
    const effectiveRound = round ?? (await getLatestProjectionRound());
    if (effectiveRound == null) {
      res.status(422).json({
        error: "Nenhuma projeção disponível. Sincronize os dados primeiro.",
      });
      return;
    }

    const effectiveBudget = budget ?? LINEUP_CONFIG.defaultBudget;

    // ── Busca projeções + jogadores da rodada (paralelo) ─────────────────
    const [projections, players] = await Promise.all([
      getProjectionsByRound(effectiveRound),
      db.select().from(playersTable),
    ]);

    const projMap = new Map(projections.map((p) => [p.playerId, p]));
    const playerMap = new Map(players.map((p) => [p.id, p]));

    /** Monta o snapshot de um jogador a partir de projeção + cadastro. */
    function buildSnapshot(playerId: number): PlayerSnapshot | null {
      const player = playerMap.get(playerId);
      const proj = projMap.get(playerId);
      if (!player || !proj) return null;
      const expJson = (proj.explanationJson ?? {}) as Record<string, unknown>;
      return {
        playerId,
        position: player.position ?? "?",
        clubId: player.clubId ?? null,
        price: player.price ?? 0,
        expectedPoints: proj.expectedPoints ?? 0,
        riskScore: proj.riskScore ?? 0,
        // popularity vem do explanationJson se disponível, senão do cadastro do jogador
        popularity: (expJson["popularity"] as number | null | undefined) ?? null,
        popularityListed: (expJson["popularityListed"] as boolean | null | undefined) ?? null,
        popularityFeaturesEnabled: expJson["popularityFeaturesEnabled"] === true,
        shortAvg: (expJson["shortAvg"] as number | undefined) ?? null,
        mediumAvg: (expJson["mediumAvg"] as number | undefined) ?? null,
      };
    }

    // ── Monta snapshots da escalação ─────────────────────────────────────
    const lineupSnapshots: PlayerSnapshot[] = [];
    const missingLineup: number[] = [];
    for (const pid of lineupIds) {
      const snap = buildSnapshot(pid);
      if (!snap) { missingLineup.push(pid); continue; }
      lineupSnapshots.push(snap);
    }
    if (missingLineup.length > 0) {
      log.warn("Jogadores sem projeção na rodada", {
        round: effectiveRound,
        missing: missingLineup,
      });
      res.status(422).json({
        error: `Jogadores sem projeção para a rodada ${effectiveRound}: ${missingLineup.join(", ")}.`,
      });
      return;
    }

    // ── Monta snapshot do jogador entrante ───────────────────────────────
    const inSnapshot = buildSnapshot(swap.inId);
    if (!inSnapshot) {
      res.status(422).json({
        error: `Jogador ${swap.inId} não possui projeção para a rodada ${effectiveRound}.`,
      });
      return;
    }

    // Rejeitar troca se o jogador entrante está indisponível (Suspenso, Nulo, Contundido).
    const UNAVAILABLE_STATUSES = new Set(["Suspenso", "Nulo", "Contundido"]);
    const inPlayer = playerMap.get(swap.inId);
    if (inPlayer?.status && UNAVAILABLE_STATUSES.has(inPlayer.status)) {
      res.status(422).json({
        error: `Jogador indisponível (${inPlayer.status}) e não pode ser escalado.`,
      });
      return;
    }

    log.info("Simulando troca", {
      round: effectiveRound,
      budget: effectiveBudget,
      outId: swap.outId,
      inId: swap.inId,
      captainId,
    });

    // ── Valida e computa comparativo ─────────────────────────────────────
    const result = validateAndSimulate({
      lineup: lineupSnapshots,
      captainId: captainId ?? null,
      outId: swap.outId,
      inPlayer: inSnapshot,
      budget: effectiveBudget,
    });

    if (!result.valid) {
      log.info("Troca inválida", { reason: result.reason });
    } else {
      log.info("Troca válida", {
        deltaPoints: result.delta.expectedPoints,
        deltaCost: result.delta.cost,
      });
    }

    res.json(result);
  } catch (error) {
    createLogger("lineup/simulate").error("Erro ao simular troca", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: "Falha ao simular troca.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// ─── Monte Carlo lineup probability simulation (Pro) ─────────────────────────
router.post("/lineup/probabilities", requirePro, async (req, res) => {
  const log = createLogger("lineup/probabilities");
  try {
    const {
      players: rawPlayers,
      thresholds,
      numSims: rawNumSims,
      roundMean,
    } = req.body as {
      players?: unknown;
      thresholds?: unknown;
      numSims?: unknown;
      roundMean?: unknown;
    };

    // ── Input validation ──────────────────────────────────────────────────────
    if (!Array.isArray(rawPlayers) || rawPlayers.length === 0) {
      res.status(400).json({ error: "Campo 'players' deve ser um array não vazio." });
      return;
    }
    if (rawPlayers.length > 30) {
      res.status(400).json({ error: "Máximo de 30 jogadores por simulação." });
      return;
    }

    const REQUIRED_FIELDS = ["playerId", "expectedPoints", "floorPoints", "ceilingPoints", "volatility", "playProbability"];
    for (const [i, p] of rawPlayers.entries()) {
      if (typeof p !== "object" || p === null) {
        res.status(400).json({ error: `players[${i}] inválido.` });
        return;
      }
      for (const field of REQUIRED_FIELDS) {
        if (typeof (p as Record<string, unknown>)[field] !== "number") {
          res.status(400).json({ error: `players[${i}].${field} deve ser number.` });
          return;
        }
      }
    }

    const players: SimPlayer[] = (rawPlayers as Array<Record<string, unknown>>).map((p) => ({
      playerId:       Number(p["playerId"]),
      expectedPoints: Number(p["expectedPoints"]),
      floorPoints:    Number(p["floorPoints"]),
      ceilingPoints:  Number(p["ceilingPoints"]),
      volatility:     Number(p["volatility"]),
      playProbability: Number(p["playProbability"]),
      isCaptain:      Boolean(p["isCaptain"]),
    }));

    const captainCount = players.filter((p) => p.isCaptain).length;
    if (captainCount !== 1) {
      res.status(400).json({ error: `Exatamente 1 jogador deve ser capitão (recebido: ${captainCount}).` });
      return;
    }

    // numSims capped at 50 000 to prevent DoS
    const numSims = Math.min(Math.max(Number(rawNumSims ?? 10_000) || 10_000, 100), 50_000);

    // Merge caller thresholds with roundMean (if provided)
    const baseThresholds: number[] = Array.isArray(thresholds)
      ? thresholds.filter((t) => typeof t === "number").map(Number)
      : [75, 90, 100];
    if (typeof roundMean === "number" && isFinite(roundMean) && !baseThresholds.includes(roundMean)) {
      baseThresholds.push(roundMean);
    }

    log.info("Starting simulation", {
      numPlayers: players.length,
      numSims,
      thresholds: baseThresholds,
    });

    const start = Date.now();
    const simulation = simulateLineup(players, { numSims, thresholds: baseThresholds });
    const elapsed = Date.now() - start;

    log.info("Simulation complete", { elapsedMs: elapsed, mean: simulation.mean, stdDev: simulation.stdDev });

    // ── Per-player breakdown (analytical, no extra simulation needed) ─────────
    const playerBreakdown = players.map((p) => {
      const captainMult = p.isCaptain ? 2.0 : 1.0;
      return {
        playerId: p.playerId,
        expectedContribution: Math.round(p.expectedPoints * p.playProbability * captainMult * 100) / 100,
        captainBonus: p.isCaptain
          ? Math.round(p.expectedPoints * p.playProbability * 100) / 100
          : 0,
        playProbability: p.playProbability,
        isCaptain: p.isCaptain,
      };
    });

    res.json({
      simulation,
      playerBreakdown,
      meta: { elapsedMs: elapsed, numSims },
    });
  } catch (error) {
    createLogger("lineup/probabilities").error("Erro na simulação Monte Carlo", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: "Falha na simulação.",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

// ─── Frontier: generate 3-5 risk-tiered optimal lineups (Pro) ────────────────
router.post("/lineup/frontier", requirePro, async (req, res) => {
  const log = createLogger("lineup/frontier");
  try {
    const { budget, formation, round: requestedRound } = req.body as {
      budget?: number;
      formation?: string;
      round?: number;
    };

    // Resolve current round
    let currentRound = requestedRound;
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
      log.info("Falling back to latest available round", { requested: currentRound, latest: latestRound });
      currentRound = latestRound;
    }

    const result = await generateFrontier({ budgetLimit: budget, formation }, currentRound);
    res.json(result);
  } catch (error) {
    createLogger("lineup/frontier").error("Erro ao gerar fronteira", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      error: "Falha ao gerar fronteira de risco.",
      details: error instanceof Error ? error.message : String(error),
    });
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

// POST /lineup/:id/save — mark lineup as saved/favourite
router.post("/lineup/:id/save", async (req, res) => {
  try {
    const lineupId = Number(req.params["id"]);
    if (isNaN(lineupId)) { res.status(400).json({ error: "Invalid lineup id" }); return; }
    const updated = await markLineupSaved(lineupId);
    if (!updated) { res.status(404).json({ error: "Lineup not found" }); return; }
    res.json({ success: true });
  } catch (error) {
    console.error("[lineup/:id/save]", error);
    res.status(500).json({ error: "Failed to save lineup" });
  }
});

export default router;
