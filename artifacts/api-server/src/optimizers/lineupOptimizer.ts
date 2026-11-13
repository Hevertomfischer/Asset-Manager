import { db } from "@workspace/db";
import { playerAvailabilityTable } from "@workspace/db/schema";
import { getProjectionsByRound } from "../repositories/projectionRepository";
import { insertLineupSuggestion, insertLineupReserves } from "../repositories/lineupRepository";
import { getMatchesByRound } from "../repositories/matchRepository";
import { selectReserves, type ReservePlayer } from "../services/reserveService";
import { LINEUP_CONFIG, PROJECTION_WEIGHTS } from "../config/projectionWeights";
import { isTrap as classifyTrap, knownPopularity, readPopularitySignals } from "../lib/popularityRules";
import { createLogger } from "../lib/logger";
import type { PlayerProjection, Player } from "@workspace/db/schema";
import { solveLineupILP, type IlpCandidate, CAPTAIN_MIN_GAMES } from "./ilpSolver";

const log = createLogger("lineup-optimizer");

export type StrategyType = "safe" | "aggressive" | "cost-benefit" | "antimassa" | "valorizacao";

export interface LineupRequest {
  round: number;
  budgetLimit?: number;
  formation?: string;
  strategy: StrategyType;
  lockedPlayerIds?: number[];
  excludedPlayerIds?: number[];
}

/** A user-correctable lineup request error, mapped to HTTP 422 by the route. */
export class LineupValidationError extends Error {
  readonly code = "LINEUP_VALIDATION";

  constructor(message: string) {
    super(message);
    this.name = "LineupValidationError";
  }
}

interface PlayerWithProjection {
  player: Player;
  projection: PlayerProjection;
}

interface LineupResult {
  id: number;
  round: number;
  strategyType: string;
  formation: string;
  budgetLimit: number;
  totalCost: number;
  expectedPoints: number;
  captainExpectedPointsDoubled: number;
  riskScore: number;
  captainPlayerId: number | null;
  coachPlayerId: number | null;
  players: Array<{
    playerId: number;
    player: Player;
    projection: PlayerProjection;
    slot: string;
    position: string;
    orderIndex: number;
    isCaptain: boolean;
  }>;
  reserves: ReservePlayer[];
}

function normalizePopularity(players: PlayerWithProjection[]): Map<number, number> {
  // Desconhecido não ganha bônus nem penalidade por um percentual inventado.
  return new Map(players.flatMap((pw) => {
    const popularity = knownPopularity(pw.player.popularity);
    return popularity == null ? [] : [[pw.player.id, popularity] as const];
  }));
}

// Penalises players with too few games played (small sample = unreliable average)
function samplePenalty(pw: PlayerWithProjection): number {
  const games = pw.player.gamesPlayed ?? 0;
  if (games === 0) return 6;
  if (games < 3) return (3 - games) * 2; // -4 for 1 game, -2 for 2 games
  return 0;
}

function getScoringFn(
  strategy: StrategyType,
  popularityMap: Map<number, number>
): (pw: PlayerWithProjection) => number {
  switch (strategy) {
    case "safe":
      // Prioritise absolute performance (floor + expected) with a light value tiebreaker.
      // valueScore (pts/price) used to be weighted *8 which caused the solver to always
      // prefer cheap players, leaving most of the budget unused even at C$140.
      return (pw) =>
        (pw.projection.floorPoints ?? 0) * 0.4 +
        (pw.projection.expectedPoints ?? 0) * 0.5 +
        (pw.projection.valueScore ?? 0) * 1.5 -
        (pw.projection.riskScore ?? 0) * 3 -
        samplePenalty(pw);
    case "aggressive":
      return (pw) =>
        (pw.projection.ceilingPoints ?? 0) * 0.7 +
        (pw.projection.expectedPoints ?? 0) * 0.3 -
        samplePenalty(pw) * 0.5;
    case "cost-benefit":
      // valueScore reduced so cost-efficiency complements expected pts, not replaces it.
      return (pw) =>
        (pw.projection.expectedPoints ?? 0) * 0.4 +
        (pw.projection.valueScore ?? 0) * 2 +
        (pw.projection.recommendationScore ?? 0) * 0.3 -
        samplePenalty(pw);
    case "antimassa": {
      return (pw) => {
        const popNorm = popularityMap.get(pw.player.id);
        const expected = pw.projection.expectedPoints ?? 0;
        const value = pw.projection.valueScore ?? 0;
        const explanation = pw.projection.explanationJson as Record<string, unknown> | null;
        const differentialScore = (explanation?.differentialScore as number | undefined) ?? 0;
        const isTrap = classifyTrap(readPopularitySignals(explanation));
        const trapPenalty = isTrap ? 5 : 0;
        return expected * (popNorm == null ? 1 : 1 - popNorm * 0.7) + value * 2 + differentialScore * 0.3 - trapPenalty - samplePenalty(pw);
      };
    }
    case "valorizacao": {
      const {
        marginWeight,
        variationWeight,
        momentumWeight,
        formTrendWeight,
        expectedWeight,
      } = PROJECTION_WEIGHTS.valorizacao;
      return (pw) => {
        const explanation = pw.projection.explanationJson as Record<string, unknown> | null;
        const priceVariation = (explanation?.priceVariation as number | undefined) ?? (pw.player.priceVariation ?? 0);
        const formTrend = (explanation?.formTrend as number | undefined) ?? 0;
        const shortAvg = (explanation?.shortAvg as number | undefined) ?? 0;
        const mediumAvg = (explanation?.mediumAvg as number | undefined) ?? 0;
        const expected = pw.projection.expectedPoints ?? 0;
        const isTrap = classifyTrap(readPopularitySignals(explanation));
        const minimoParaValorizar = pw.player.minimoParaValorizar ?? null;

        // ── PRIMARY: continuous valorization margin ────────────────────────
        // Uses the forward-looking projection (not backward shortAvg) for this
        // round's estimate. clamp keeps outliers from dominating the score.
        const projectionForThisRound = expected > 0 ? expected : shortAvg;
        let marginScore = 0;
        if (minimoParaValorizar != null && minimoParaValorizar > 0 && projectionForThisRound > 0) {
          const relativeMargin = (projectionForThisRound - minimoParaValorizar) / minimoParaValorizar;
          const clamped = Math.max(-1, Math.min(2, relativeMargin));
          marginScore = clamped * marginWeight;
        }

        // ── SECONDARY: tiebreaker signals (backward-looking) ───────────────
        const variationSignal = priceVariation * variationWeight;
        const momentumSignal = shortAvg > 0 && mediumAvg > 0
          ? ((shortAvg - mediumAvg) / Math.max(mediumAvg, 1)) * momentumWeight
          : 0;
        const formTrendBonus = formTrend * formTrendWeight;
        const trapPenalty = isTrap ? 6 : 0;

        return (
          marginScore +
          variationSignal +
          momentumSignal +
          formTrendBonus +
          expected * expectedWeight +
          (pw.projection.valueScore ?? 0) * 0.5 -
          trapPenalty -
          samplePenalty(pw)
        );
      };
    }
  }
}

function getFormationRequirements(formation: string): Array<{ position: string; count: number }> {
  const config = LINEUP_CONFIG.formations[formation] ?? LINEUP_CONFIG.formations[LINEUP_CONFIG.defaultFormation]!;
  const slots: Array<{ position: string; count: number }> = [
    { position: "GOL", count: 1 },
  ];
  const FILL_ORDER = ["ZAG", "LAT", "ATA", "MEI"];
  for (const pos of FILL_ORDER) {
    const count = config[pos] ?? 0;
    if (count > 0) slots.push({ position: pos, count });
  }
  slots.push({ position: "TEC", count: 1 });
  return slots;
}

const CAPTAIN_POSITION_MULTIPLIER: Record<string, number> = {
  ATA: 1.20,
  MEI: 1.10,
  LAT: 1.00,
  ZAG: 1.00,
  GOL: 0.95,
};

function captainPositionMultiplier(position: string): number {
  return CAPTAIN_POSITION_MULTIPLIER[position] ?? 1.0;
}

/**
 * Strategy-specific captain preference score — mirrors the sort key used in
 * selectCaptain so the ILP captain variable chooses the same player that
 * selectCaptain would have chosen post-hoc.
 */
function computeCaptainScore(
  pw: PlayerWithProjection,
  strategy: StrategyType,
  popularityMap: Map<number, number>
): number {
  const mult = captainPositionMultiplier(pw.player.position);
  switch (strategy) {
    case "safe":
      return ((pw.projection.floorPoints ?? 0) + (pw.projection.expectedPoints ?? 0)) * mult;
    case "aggressive":
      return (pw.projection.ceilingPoints ?? 0) * mult;
    case "antimassa": {
      const popNorm = popularityMap.get(pw.player.id);
      return (pw.projection.expectedPoints ?? 0) * (popNorm == null ? 1 : 1 - popNorm * 0.5) * mult;
    }
    default:
      return (pw.projection.expectedPoints ?? 0) * mult;
  }
}

/**
 * Fallback captain selector — used only when the ILP does not return a captain
 * variable (should not happen in normal operation).
 */
function selectCaptain(
  fieldPlayers: PlayerWithProjection[],
  strategy: StrategyType,
  popularityMap: Map<number, number>
): PlayerWithProjection | undefined {
  if (fieldPlayers.length === 0) return undefined;

  const eligible = fieldPlayers.filter(
    (pw) => (pw.player.gamesPlayed ?? 0) >= CAPTAIN_MIN_GAMES
  );
  const pool = eligible.length > 0 ? eligible : fieldPlayers;

  return [...pool].sort((a, b) => {
    const scoreA = computeCaptainScore(a, strategy, popularityMap);
    const scoreB = computeCaptainScore(b, strategy, popularityMap);
    return scoreB - scoreA;
  })[0];
}

export async function loadLineupSnapshot(round: number) {
  const [projections, players, availabilities, roundMatches] = await Promise.all([
    getProjectionsByRound(round),
    db.query.playersTable.findMany(),
    db.select().from(playerAvailabilityTable),
    getMatchesByRound(round),
  ]);
  return { projections, players, availabilities, roundMatches };
}

export type LineupSnapshot = Awaited<ReturnType<typeof loadLineupSnapshot>>;

/** Read-only calculation shared by generation and formation comparison. */
export function calculateLineup(
  request: LineupRequest,
  snapshot: LineupSnapshot,
): Omit<LineupResult, "id"> {
  const { round, strategy, formation = LINEUP_CONFIG.defaultFormation } = request;
  const budgetLimit = request.budgetLimit ?? LINEUP_CONFIG.defaultBudget;
  if (!LINEUP_CONFIG.formations[formation]) {
    throw new LineupValidationError(
      `A formação ${formation} não é suportada. Escolha entre ${Object.keys(LINEUP_CONFIG.formations).join(", ")}.`
    );
  }
  const lockedPlayerIds = new Set(request.lockedPlayerIds ?? []);
  const excludedPlayerIds = new Set(request.excludedPlayerIds ?? []);
  const overlap = [...lockedPlayerIds].filter((id) => excludedPlayerIds.has(id));
  if (overlap.length > 0) {
    throw new LineupValidationError(
      `Os jogadores ${overlap.join(", ")} não podem estar travados e excluídos ao mesmo tempo.`
    );
  }

  const { projections, players, availabilities, roundMatches } = snapshot;

  const playerMap = new Map(players.map((p) => [p.id, p]));
  const availMap = new Map(availabilities.map((a) => [a.playerId, a.playProbability]));

  // Only consider matches marked valid (not postponed/cancelled) for club eligibility.
  const validMatches = roundMatches.filter((m) => m.valid !== false);
  const validClubIds = new Set<number>();
  for (const m of validMatches) {
    if (m.homeClubId) validClubIds.add(m.homeClubId);
    if (m.awayClubId) validClubIds.add(m.awayClubId);
  }

  const opponentMap = new Map<number, number>();
  for (const match of validMatches) {
    if (match.homeClubId && match.awayClubId) {
      opponentMap.set(match.homeClubId, match.awayClubId);
      opponentMap.set(match.awayClubId, match.homeClubId);
    }
  }

  const UNAVAILABLE_STATUSES = new Set(["Suspenso", "Nulo", "Contundido"]);

  // Validate locks before the normal candidate filtering. Low probability is
  // intentionally allowed for a lock, but hard unavailability is not.
  const projectionMapForLocks = new Map(projections.map((p) => [p.playerId, p]));
  const roundAvailabilities = availabilities.filter((a) => a.round === round);
  for (const playerId of lockedPlayerIds) {
    const player = playerMap.get(playerId);
    if (!player) {
      throw new LineupValidationError(`Jogador ${playerId} não foi encontrado.`);
    }
    if (!projectionMapForLocks.has(playerId)) {
      throw new LineupValidationError(`O jogador ${playerId} não possui projeção para a rodada ${round}.`);
    }
    const availability = roundAvailabilities
      .filter((a) => a.playerId === playerId)
      .sort((a, b) => (b.collectedAt?.getTime() ?? 0) - (a.collectedAt?.getTime() ?? 0))[0];
    const hardStatus = player.status && UNAVAILABLE_STATUSES.has(player.status)
      ? player.status
      : availability?.injuryStatus ?? availability?.suspensionStatus ??
        (availability?.probableStatus && UNAVAILABLE_STATUSES.has(availability.probableStatus)
          ? availability.probableStatus
          : null);
    if (hardStatus) {
      throw new LineupValidationError(
        `O jogador ${player.name} está indisponível (${hardStatus}) e não pode ser travado.`
      );
    }
    const hasKnownRoundMatches = roundMatches.length > 0;
    if (
      player.clubId == null ||
      (hasKnownRoundMatches && !validClubIds.has(player.clubId))
    ) {
      throw new LineupValidationError(
        `O jogador ${player.name} pertence a um clube sem partida válida nesta rodada.`
      );
    }
  }
  if (projections.length === 0) {
    throw new Error(`No projections found for round ${round}. Please sync data first.`);
  }

  const allPlayerProjections: PlayerWithProjection[] = projections
    .map((proj) => {
      const player = playerMap.get(proj.playerId);
      if (!player) return null;

      // Exclude players from clubs whose match is postponed/cancelled this round.
      // Their projections may be stale (generated before the match was invalidated).
      if (validClubIds.size > 0 && player.clubId != null && !validClubIds.has(player.clubId)) {
        return null;
      }

      const availPlayProb = availMap.get(proj.playerId);
      let finalPlayProb: number | null = proj.playProbability;
      if (availPlayProb != null) {
        finalPlayProb = Math.min(proj.playProbability ?? 1, availPlayProb);
      }
      if (player.status != null && UNAVAILABLE_STATUSES.has(player.status)) {
        finalPlayProb = 0;
      }

      return {
        player,
        projection: { ...proj, playProbability: finalPlayProb } as typeof proj,
      };
    })
    .filter((x): x is PlayerWithProjection => x !== null);

  const popularityMap = normalizePopularity(allPlayerProjections);
  const scoringFn = getScoringFn(strategy, popularityMap);
  const slotRequirements = getFormationRequirements(formation);

  const slotCounts = new Map(slotRequirements.map((slot) => [slot.position, slot.count]));
  const lockedPlayers = [...lockedPlayerIds].map((id) => playerMap.get(id)).filter((p): p is Player => p != null);
  for (const [position, count] of new Map(
    lockedPlayers.map((player) => [player.position, lockedPlayers.filter((p) => p.position === player.position).length])
  )) {
    const required = slotCounts.get(position) ?? 0;
    if (required < count) {
      throw new LineupValidationError(
        `A formação ${formation} exige ${required} jogador(es) na posição ${position}, mas ${count} estão travados.`
      );
    }
  }
  const lockedCost = lockedPlayers.reduce((sum, player) => sum + (player.price ?? 0), 0);
  if (lockedCost > budgetLimit) {
    const money = (value: number) => value.toFixed(2).replace(".", ",");
    throw new LineupValidationError(
      `Os jogadores travados custam C$ ${money(lockedCost)} e passam do seu patrimônio de C$ ${money(budgetLimit)}.`
    );
  }
  const lockedClubCounts = new Map<number, number>();
  const lockedClubPositions = new Set<string>();
  for (const player of lockedPlayers) {
    lockedClubCounts.set(player.clubId!, (lockedClubCounts.get(player.clubId!) ?? 0) + 1);
    const clubPosition = `${player.clubId}_${player.position}`;
    if (lockedClubPositions.has(clubPosition)) {
      throw new LineupValidationError(
        `Não é possível travar mais de um jogador do clube ${player.clubId} na posição ${player.position}.`
      );
    }
    lockedClubPositions.add(clubPosition);
  }
  const overClub = [...lockedClubCounts.entries()].find(([, count]) => count > LINEUP_CONFIG.maxPlayersPerClub);
  if (overClub) {
    throw new LineupValidationError(
      `Os jogadores travados excedem o limite de ${LINEUP_CONFIG.maxPlayersPerClub} jogadores do mesmo clube.`
    );
  }
  for (const [clubId, opponentId] of opponentMap) {
    const lockedForClub = lockedPlayers.filter((p) => p.clubId === clubId);
    const lockedForOpponent = lockedPlayers.filter((p) => p.clubId === opponentId);
    for (const player of lockedForClub) {
      if (lockedForOpponent.some((opponent) => opponent.position === player.position)) {
        throw new LineupValidationError(
          `Os jogadores travados entram em conflito: clubes ${clubId} e ${opponentId} têm jogadores na posição ${player.position}.`
        );
      }
      if (player.position === "ATA" &&
          lockedForOpponent.some((opponent) => ["GOL", "ZAG", "LAT"].includes(opponent.position))) {
        throw new LineupValidationError(
          `Os jogadores travados entram em conflito entre ataque e defesa dos clubes ${clubId} e ${opponentId}.`
        );
      }
    }
  }

  // ── Build ILP candidate list ───────────────────────────────────────────────
  const ilpCandidates: IlpCandidate[] = allPlayerProjections
    .filter((pw) =>
      lockedPlayerIds.has(pw.player.id) ||
      excludedPlayerIds.has(pw.player.id) ||
      (pw.projection.playProbability ?? 0) > 0.1
    )
    .map((pw) => ({
      id: pw.player.id,
      position: pw.player.position,
      clubId: pw.player.clubId ?? 0,
      price: pw.player.price ?? 0,
      score: scoringFn(pw),
      captainScore:
        pw.player.position !== "TEC"
          ? computeCaptainScore(pw, strategy, popularityMap)
          : 0,
      gamesPlayed: pw.player.gamesPlayed ?? 0,
      isFieldPlayer: pw.player.position !== "TEC",
    }));

  for (const { position, count } of slotRequirements) {
    const available = ilpCandidates.filter(
      (candidate) => candidate.position === position && !excludedPlayerIds.has(candidate.id)
    ).length;
    if (available < count) {
      throw new LineupValidationError(
        `Não há jogadores suficientes na posição ${position} para completar a formação ${formation} (necessários: ${count}, disponíveis: ${available}).`
      );
    }
  }

  log.info("Running ILP optimizer", {
    round,
    strategy,
    formation,
    budgetLimit,
    candidatePool: ilpCandidates.length,
  });

  // ── Solve with ILP ─────────────────────────────────────────────────────────
  const solution = solveLineupILP(ilpCandidates, {
    slots: slotRequirements,
    budgetLimit,
    maxPlayersPerClub: LINEUP_CONFIG.maxPlayersPerClub,
    opponentMap,
    lockedPlayerIds,
    excludedPlayerIds,
  });

  if (!solution.feasible) {
    throw new LineupValidationError(
      `Não foi possível montar uma escalação viável com os jogadores travados, patrimônio de C$ ${budgetLimit.toFixed(2).replace(".", ",")} e formação ${formation}. Verifique orçamento e conflitos entre clubes.`
    );
  }

  // ── Map selectedIds back to PlayerWithProjection[], ordered by formation ───
  const projectionMap = new Map(allPlayerProjections.map((pw) => [pw.player.id, pw]));
  const selected: PlayerWithProjection[] = [];

  for (const { position } of slotRequirements) {
    const posPlayers = [...solution.selectedIds]
      .map((id) => projectionMap.get(id))
      .filter((pw): pw is PlayerWithProjection => pw != null && pw.player.position === position)
      .sort((a, b) => scoringFn(b) - scoringFn(a)); // stable descending order within position
    selected.push(...posPlayers);
  }

  // Sanity check — ILP guarantees this, but guard against edge cases
  const filledPositions: Record<string, number> = {};
  for (const pw of selected) {
    filledPositions[pw.player.position] = (filledPositions[pw.player.position] ?? 0) + 1;
  }
  const missingSlots: string[] = [];
  for (const { position, count } of slotRequirements) {
    const filled = filledPositions[position] ?? 0;
    if (filled < count) missingSlots.push(`${position}: need ${count}, got ${filled}`);
  }
  if (missingSlots.length > 0) {
    throw new Error(
      `ILP produced incomplete lineup for budget ${budgetLimit} / formation ${formation}. ` +
        `Missing: ${missingSlots.join(", ")}.`
    );
  }

  const totalCost = selected.reduce((sum, pw) => sum + (pw.player.price ?? 0), 0);
  if (totalCost > budgetLimit + 1e-6) {
    throw new Error(
      `ILP lineup cost ${totalCost.toFixed(2)} exceeds budget ${budgetLimit}.`
    );
  }

  // ── Captain selection ──────────────────────────────────────────────────────
  const fieldPlayers = selected.filter((pw) => pw.player.position !== "TEC");
  const captainPw =
    solution.captainId != null
      ? (projectionMap.get(solution.captainId) ?? selectCaptain(fieldPlayers, strategy, popularityMap))
      : selectCaptain(fieldPlayers, strategy, popularityMap);

  const coach = selected.find((pw) => pw.player.position === "TEC") ?? null;

  // ── Expected points ────────────────────────────────────────────────────────
  const baseExpectedPoints = selected.reduce(
    (sum, pw) => sum + (pw.projection.expectedPoints ?? 0),
    0
  );
  const captainBonus = captainPw ? (captainPw.projection.expectedPoints ?? 0) : 0;
  const captainExpectedPointsDoubled = Number((baseExpectedPoints + captainBonus).toFixed(2));

  const avgRiskScore =
    selected.length > 0
      ? selected.reduce((sum, pw) => sum + (pw.projection.riskScore ?? 0), 0) / selected.length
      : 1;

  log.info("Lineup generated", {
    round,
    strategy,
    formation,
    totalCost: totalCost.toFixed(2),
    expectedPoints: captainExpectedPointsDoubled,
    captainId: captainPw?.player.id ?? null,
    ilpScore: solution.totalScore.toFixed(3),
  });

  const mainLineupIds = new Set(selected.map((pw) => pw.player.id));
  const formationPositions = slotRequirements.map((s) => s.position);
  const rawProjectionsForReserves = allPlayerProjections
    .filter((pw) => !excludedPlayerIds.has(pw.player.id))
    .map((pw) => ({
      playerId: pw.player.id,
      playerName: pw.player.name ?? "Unknown",
      playerNickname: pw.player.nickname ?? null,
      position: pw.player.position,
      clubId: pw.player.clubId ?? null,
      expectedPoints: pw.projection.expectedPoints ?? 0,
      floorPoints: pw.projection.floorPoints ?? 0,
      ceilingPoints: pw.projection.ceilingPoints ?? 0,
      price: pw.player.price ?? 0,
      playProbability: pw.projection.playProbability ?? 0,
    }));

  const reserves = selectReserves(rawProjectionsForReserves, mainLineupIds, formationPositions);

  return {
    round,
    strategyType: strategy,
    formation,
    budgetLimit,
    totalCost: Number(totalCost.toFixed(2)),
    expectedPoints: Number(captainExpectedPointsDoubled.toFixed(2)),
    captainExpectedPointsDoubled,
    riskScore: Number(avgRiskScore.toFixed(3)),
    captainPlayerId: captainPw?.player.id ?? null,
    coachPlayerId: coach?.player.id ?? null,
    players: selected.map((pw, idx) => ({
      playerId: pw.player.id,
      player: pw.player,
      projection: pw.projection,
      slot: `${pw.player.position}_${idx}`,
      position: pw.player.position,
      orderIndex: idx,
      isCaptain: pw.player.id === captainPw?.player.id,
    })),
    reserves,
  };
}

export async function generateLineup(request: LineupRequest): Promise<LineupResult> {
  const result = calculateLineup(request, await loadLineupSnapshot(request.round));
  const { players, reserves, captainExpectedPointsDoubled: _captainPoints, ...header } = result;
  const saved = await insertLineupSuggestion(header, players.map((p) => ({
    playerId: p.playerId,
    slot: p.slot,
    position: p.position,
    orderIndex: p.orderIndex,
    projectedPoints: p.projection.expectedPoints ?? null,
    price: p.player.price ?? null,
  })));
  await insertLineupReserves(saved.id, reserves.map((r) => ({
    playerId: r.playerId,
    position: r.position,
    isLuxuryReserve: r.isLuxuryReserve,
    expectedPoints: r.expectedPoints,
    floorPoints: r.floorPoints,
    ceilingPoints: r.ceilingPoints,
    price: r.price,
    orderIndex: r.orderIndex,
  })));
  return { id: saved.id, ...result };
}
