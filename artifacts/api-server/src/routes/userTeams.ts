import { Router } from "express";
import { db } from "@workspace/db";
import {
  userTeamsTable,
  userTeamRoundsTable,
  userTeamRoundPlayersTable,
  playersTable,
  playerScoutRoundTable,
  clubsTable,
  lineupSuggestionTable,
  lineupSuggestionPlayerTable,
} from "@workspace/db/schema";
import { eq, and, inArray, isNotNull, count } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { computeEfficiency, type HindsightCandidate } from "../lib/hindsightOptimal";

const log = createLogger("user-teams");
const router = Router();

// ── Auth guard (inline — user-teams endpoints all require a logged-in user) ──
function requireAuth(req: Parameters<typeof router.get>[1] extends (...a: infer A) => unknown ? A[0] : never, res: Parameters<typeof router.get>[1] extends (...a: infer A) => unknown ? A[1] : never): boolean {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Autenticação necessária." });
    return false;
  }
  return true;
}

// ── GET /api/user-teams ───────────────────────────────────────────────────────
// Lists all teams for the logged-in user with accumulated actual points per season.
router.get("/user-teams", async (req, res) => {
  try {
    if (!requireAuth(req as any, res as any)) return;
    const userId = req.user!.id;

    const teams = await db
      .select()
      .from(userTeamsTable)
      .where(eq(userTeamsTable.userId, userId))
      .orderBy(userTeamsTable.createdAt);

    if (teams.length === 0) {
      res.json({ teams: [] });
      return;
    }

    const teamIds = teams.map((t) => t.id);

    // Accumulated actual points: sum actual points of all round-players for each team
    const roundRows = await db
      .select({
        userTeamId: userTeamRoundsTable.userTeamId,
        userTeamRoundId: userTeamRoundsTable.id,
        round: userTeamRoundsTable.round,
        captainPlayerId: userTeamRoundsTable.captainPlayerId,
      })
      .from(userTeamRoundsTable)
      .where(inArray(userTeamRoundsTable.userTeamId, teamIds));

    const roundIds = roundRows.map((r) => r.userTeamRoundId);

    const [roundPlayers, actuals] = roundIds.length > 0
      ? await Promise.all([
          db
            .select({
              userTeamRoundId: userTeamRoundPlayersTable.userTeamRoundId,
              playerId: userTeamRoundPlayersTable.playerId,
            })
            .from(userTeamRoundPlayersTable)
            .where(inArray(userTeamRoundPlayersTable.userTeamRoundId, roundIds)),
          db
            .select({
              playerId: playerScoutRoundTable.playerId,
              round: playerScoutRoundTable.round,
              points: playerScoutRoundTable.points,
            })
            .from(playerScoutRoundTable)
            .where(
              and(
                inArray(playerScoutRoundTable.round, [...new Set(roundRows.map((r) => r.round))]),
                isNotNull(playerScoutRoundTable.points),
                inArray(playerScoutRoundTable.source, ["historical_cartola"])
              )
            ),
        ])
      : [[], []];

    const actualMap = new Map<string, number>();
    for (const a of actuals) {
      const key = `${a.playerId}-${a.round}`;
      if (!actualMap.has(key)) actualMap.set(key, a.points ?? 0);
    }

    // Build map: roundId → { round, captainPlayerId, players }
    const roundByRoundId = new Map(
      roundRows.map((r) => [r.userTeamRoundId, { round: r.round, captainPlayerId: r.captainPlayerId, userTeamId: r.userTeamId }])
    );
    const playersByRoundId = new Map<number, number[]>();
    for (const rp of roundPlayers) {
      if (!playersByRoundId.has(rp.userTeamRoundId)) playersByRoundId.set(rp.userTeamRoundId, []);
      playersByRoundId.get(rp.userTeamRoundId)!.push(rp.playerId);
    }

    // Aggregate season points per team
    const pointsByTeam = new Map<number, number>();
    for (const team of teams) pointsByTeam.set(team.id, 0);

    for (const [roundId, { round, captainPlayerId, userTeamId }] of roundByRoundId) {
      const pids = playersByRoundId.get(roundId) ?? [];
      for (const pid of pids) {
        const raw = actualMap.get(`${pid}-${round}`) ?? 0;
        const pts = pid === captainPlayerId ? raw * 2 : raw;
        pointsByTeam.set(userTeamId, (pointsByTeam.get(userTeamId) ?? 0) + pts);
      }
    }

    const roundCountByTeam = new Map<number, number>();
    for (const r of roundRows) {
      roundCountByTeam.set(r.userTeamId, (roundCountByTeam.get(r.userTeamId) ?? 0) + 1);
    }

    const result = teams.map((t) => ({
      id: t.id,
      name: t.name,
      createdAt: t.createdAt,
      roundCount: roundCountByTeam.get(t.id) ?? 0,
      seasonPoints: Number((pointsByTeam.get(t.id) ?? 0).toFixed(2)),
    }));

    log.info("Listed user teams", { userId, count: result.length });
    res.json({ teams: result });
  } catch (err) {
    log.error("Failed to list user teams", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Falha ao listar times." });
  }
});

// ── GET /api/user-teams/:id/rounds ────────────────────────────────────────────
// Returns round history for a team, each round enriched with hindsight efficiency.
router.get("/user-teams/:id/rounds", async (req, res) => {
  try {
    if (!requireAuth(req as any, res as any)) return;
    const userId = req.user!.id;
    const teamId = Number(req.params["id"]);

    if (!teamId || isNaN(teamId)) {
      res.status(400).json({ error: "ID de time inválido." });
      return;
    }

    // Verify ownership
    const [team] = await db
      .select()
      .from(userTeamsTable)
      .where(and(eq(userTeamsTable.id, teamId), eq(userTeamsTable.userId, userId)));

    if (!team) {
      res.status(404).json({ error: "Time não encontrado." });
      return;
    }

    const rounds = await db
      .select()
      .from(userTeamRoundsTable)
      .where(eq(userTeamRoundsTable.userTeamId, teamId))
      .orderBy(userTeamRoundsTable.round);

    if (rounds.length === 0) {
      res.json({ team: { id: team.id, name: team.name }, rounds: [] });
      return;
    }

    const roundIds = rounds.map((r) => r.id);
    const uniqueRounds = [...new Set(rounds.map((r) => r.round))];

    const [roundPlayers, playerRows, actualsRaw, clubs] = await Promise.all([
      db
        .select()
        .from(userTeamRoundPlayersTable)
        .where(inArray(userTeamRoundPlayersTable.userTeamRoundId, roundIds)),
      db
        .select({
          id: playersTable.id,
          name: playersTable.name,
          nickname: playersTable.nickname,
          position: playersTable.position,
          clubId: playersTable.clubId,
          price: playersTable.price,
        })
        .from(playersTable),
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
            inArray(playerScoutRoundTable.round, uniqueRounds),
            isNotNull(playerScoutRoundTable.points),
            inArray(playerScoutRoundTable.source, ["historical_cartola"])
          )
        ),
      db.select().from(clubsTable),
    ]);

    const playerMap = new Map(playerRows.map((p) => [p.id, p]));
    const clubMap = new Map(clubs.map((c) => [c.id, c]));

    // Build actualMap: historical_cartola overwrites cartola_api
    const actualMap = new Map<string, number>();
    const sortedActuals = [...actualsRaw].sort((a, b) =>
      a.source === b.source ? 0 : a.source === "historical_cartola" ? 1 : -1
    );
    for (const a of sortedActuals) {
      const key = `${a.playerId}-${a.round}`;
      if (!actualMap.has(key) || a.source === "historical_cartola") {
        actualMap.set(key, a.points ?? 0);
      }
    }

    // Build candidate pool per round for greedyHindsight
    const candidatesByRound = new Map<number, HindsightCandidate[]>();
    for (const r of uniqueRounds) {
      const pool: HindsightCandidate[] = [];
      for (const [, p] of playerMap) {
        const pts = actualMap.get(`${p.id}-${r}`);
        if (pts === undefined || (p.price ?? 0) <= 0 || !p.position) continue;
        pool.push({
          playerId: p.id,
          position: p.position,
          actualPoints: Number(pts.toFixed(2)),
          price: p.price ?? 0,
          name: p.name ?? "?",
          nickname: p.nickname ?? null,
          clubId: p.clubId ?? null,
        });
      }
      candidatesByRound.set(r, pool);
    }

    const playersByRoundId = new Map<number, typeof roundPlayers>();
    for (const rp of roundPlayers) {
      if (!playersByRoundId.has(rp.userTeamRoundId)) playersByRoundId.set(rp.userTeamRoundId, []);
      playersByRoundId.get(rp.userTeamRoundId)!.push(rp);
    }

    const result = rounds.map((r) => {
      const players = playersByRoundId.get(r.id) ?? [];
      const captainId = r.captainPlayerId;

      const playerDetails = players.map((rp) => {
        const p = playerMap.get(rp.playerId);
        const club = p?.clubId ? clubMap.get(p.clubId) ?? null : null;
        const rawActual = actualMap.get(`${rp.playerId}-${r.round}`) ?? null;
        const isCaptain = rp.playerId === captainId;
        const actualPoints = rawActual !== null ? (isCaptain ? rawActual * 2 : rawActual) : null;

        return {
          playerId: rp.playerId,
          name: p?.name ?? "?",
          nickname: p?.nickname ?? null,
          position: rp.position ?? p?.position ?? "?",
          price: rp.price ?? p?.price ?? 0,
          clubName: club?.name ?? null,
          clubBadgeUrl: club?.badgeUrl ?? null,
          isCaptain,
          isCoach: (rp.position ?? p?.position) === "TEC",
          actualPoints: actualPoints !== null ? Number(actualPoints.toFixed(2)) : null,
          actualPointsRaw: rawActual !== null ? Number(rawActual.toFixed(2)) : null,
        };
      });

      const ourActualPoints = playerDetails.reduce((s, p) => s + (p.actualPoints ?? 0), 0);
      const budget = r.budgetUsed ?? 100;
      const candidates = candidatesByRound.get(r.round) ?? [];
      const hasActualData = playerDetails.some((p) => p.actualPoints !== null);

      const efficiency = hasActualData && candidates.length > 0
        ? computeEfficiency(candidates, budget, ourActualPoints)
        : null;

      return {
        id: r.id,
        round: r.round,
        source: r.source,
        budgetUsed: r.budgetUsed,
        lineupSuggestionId: r.lineupSuggestionId,
        players: playerDetails,
        actualTotal: hasActualData ? Number(ourActualPoints.toFixed(2)) : null,
        optimalActualPoints: efficiency?.optimalActualPoints ?? null,
        efficiencyPct: efficiency?.efficiencyPct ?? null,
      };
    });

    log.info("Listed user team rounds", { teamId, userId, rounds: result.length });
    res.json({ team: { id: team.id, name: team.name }, rounds: result });
  } catch (err) {
    log.error("Failed to list user team rounds", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Falha ao listar rodadas do time." });
  }
});

// ── POST /api/user-teams ──────────────────────────────────────────────────────
// Creates a new user team. Free users limited to 1 team.
router.post("/user-teams", async (req, res) => {
  try {
    if (!requireAuth(req as any, res as any)) return;
    const userId = req.user!.id;
    const { name } = req.body as { name?: string };

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({ error: "O campo 'name' é obrigatório." });
      return;
    }

    const { isPro } = await import("../services/accessService");
    const userIsPro = await isPro(userId);

    if (!userIsPro) {
      const [row] = await db
        .select({ total: count() })
        .from(userTeamsTable)
        .where(eq(userTeamsTable.userId, userId));

      if ((row?.total ?? 0) >= 1) {
        res.status(402).json({
          error: "Usuários do plano gratuito podem criar apenas 1 time. Faça upgrade para Pro para times ilimitados.",
          upgradeRequired: true,
        });
        return;
      }
    }

    const [created] = await db
      .insert(userTeamsTable)
      .values({ userId, name: name.trim() })
      .returning();

    log.info("User team created", { userId, teamId: created!.id, name: created!.name });
    res.status(201).json({ team: created });
  } catch (err) {
    log.error("Failed to create user team", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Falha ao criar time." });
  }
});

// ── POST /api/user-teams/:id/rounds ──────────────────────────────────────────
// Manually registers a round for a user team.
// Body: { round, players: [{playerId, position, price?}], captainPlayerId, coachPlayerId?, budgetUsed? }
// Validation: exactly 12 field players (non-TEC), captain must be one of them.
router.post("/user-teams/:id/rounds", async (req, res) => {
  try {
    if (!requireAuth(req as any, res as any)) return;
    const userId = req.user!.id;
    const teamId = Number(req.params["id"]);
    const {
      round,
      players,
      captainPlayerId,
      coachPlayerId,
      budgetUsed,
    } = req.body as {
      round?: unknown;
      players?: unknown;
      captainPlayerId?: unknown;
      coachPlayerId?: number | null;
      budgetUsed?: number | null;
    };

    if (!teamId || isNaN(teamId)) {
      res.status(400).json({ error: "ID de time inválido." });
      return;
    }
    const roundNum = Number(round);
    if (!round || !Number.isInteger(roundNum) || roundNum < 1) {
      res.status(400).json({ error: "Rodada deve ser um inteiro positivo." });
      return;
    }
    if (!Array.isArray(players) || players.length !== 12) {
      res.status(400).json({ error: "Exatamente 12 jogadores de campo são obrigatórios." });
      return;
    }
    for (const p of players as Array<unknown>) {
      if (typeof (p as Record<string, unknown>)["playerId"] !== "number" || typeof (p as Record<string, unknown>)["position"] !== "string") {
        res.status(400).json({ error: "Cada jogador deve ter playerId (number) e position (string)." });
        return;
      }
    }
    const typedPlayers = players as Array<{ playerId: number; position: string; price?: number }>;
    const captainId = Number(captainPlayerId);
    if (!captainPlayerId || isNaN(captainId)) {
      res.status(400).json({ error: "captainPlayerId é obrigatório." });
      return;
    }
    const fieldIds = typedPlayers.map((p) => p.playerId);
    if (!fieldIds.includes(captainId)) {
      res.status(400).json({ error: "O capitão deve estar entre os jogadores escalados." });
      return;
    }
    const allPlayerIds = [...fieldIds, ...(coachPlayerId ? [coachPlayerId] : [])];
    if (new Set(allPlayerIds).size !== allPlayerIds.length) {
      res.status(400).json({ error: "IDs de jogadores duplicados." });
      return;
    }

    // Verify team ownership
    const [team] = await db
      .select()
      .from(userTeamsTable)
      .where(and(eq(userTeamsTable.id, teamId), eq(userTeamsTable.userId, userId)));
    if (!team) {
      res.status(404).json({ error: "Time não encontrado." });
      return;
    }

    // Prevent duplicate round registration
    const existing = await db
      .select({ id: userTeamRoundsTable.id })
      .from(userTeamRoundsTable)
      .where(and(eq(userTeamRoundsTable.userTeamId, teamId), eq(userTeamRoundsTable.round, roundNum)));
    if (existing.length > 0) {
      res.status(409).json({ error: `Rodada ${roundNum} já registrada para este time.` });
      return;
    }

    // Insert round record
    const [newRound] = await db
      .insert(userTeamRoundsTable)
      .values({
        userTeamId: teamId,
        round: roundNum,
        budgetUsed: budgetUsed ?? null,
        captainPlayerId: captainId,
        coachPlayerId: coachPlayerId ?? null,
        source: "manual",
      })
      .returning();

    // Build full player list including optional TEC
    const allPlayers: Array<{ playerId: number; position: string; price?: number }> = [...typedPlayers];
    if (coachPlayerId && !typedPlayers.some((p) => p.playerId === coachPlayerId)) {
      allPlayers.push({ playerId: coachPlayerId, position: "TEC" });
    }

    await db.insert(userTeamRoundPlayersTable).values(
      allPlayers.map((p) => ({
        userTeamRoundId: newRound!.id,
        playerId: p.playerId,
        position: p.position,
        price: p.price ?? null,
      }))
    );

    log.info("Manual round registered", {
      userId,
      teamId,
      roundId: newRound!.id,
      round: roundNum,
      players: allPlayers.length,
    });
    res.status(201).json({ round: { ...newRound, playerCount: allPlayers.length } });
  } catch (err) {
    log.error("Failed to register manual round", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Falha ao registrar rodada." });
  }
});

// ── POST /api/user-teams/:id/rounds/from-suggestion ──────────────────────────
// Copies a lineup_suggestion into a user_team_round with source = 'from_suggestion'.
router.post("/user-teams/:id/rounds/from-suggestion", async (req, res) => {
  try {
    if (!requireAuth(req as any, res as any)) return;
    const userId = req.user!.id;
    const teamId = Number(req.params["id"]);
    const { lineupSuggestionId } = req.body as { lineupSuggestionId?: number };

    if (!teamId || isNaN(teamId)) {
      res.status(400).json({ error: "ID de time inválido." });
      return;
    }
    if (!lineupSuggestionId || typeof lineupSuggestionId !== "number") {
      res.status(400).json({ error: "lineupSuggestionId é obrigatório." });
      return;
    }

    // Verify team ownership
    const [team] = await db
      .select()
      .from(userTeamsTable)
      .where(and(eq(userTeamsTable.id, teamId), eq(userTeamsTable.userId, userId)));

    if (!team) {
      res.status(404).json({ error: "Time não encontrado." });
      return;
    }

    // Load the lineup suggestion
    const [suggestion] = await db
      .select()
      .from(lineupSuggestionTable)
      .where(eq(lineupSuggestionTable.id, lineupSuggestionId));

    if (!suggestion) {
      res.status(404).json({ error: "Escalação não encontrada." });
      return;
    }

    // Load suggestion players
    const suggestionPlayers = await db
      .select()
      .from(lineupSuggestionPlayerTable)
      .where(eq(lineupSuggestionPlayerTable.lineupSuggestionId, lineupSuggestionId));

    // Create the round record
    const [newRound] = await db
      .insert(userTeamRoundsTable)
      .values({
        userTeamId: teamId,
        round: suggestion.round,
        budgetUsed: suggestion.totalCost,
        captainPlayerId: suggestion.captainPlayerId,
        coachPlayerId: suggestion.coachPlayerId,
        source: "from_suggestion",
        lineupSuggestionId: suggestion.id,
      })
      .returning();

    // Copy players
    if (suggestionPlayers.length > 0) {
      await db.insert(userTeamRoundPlayersTable).values(
        suggestionPlayers.map((p) => ({
          userTeamRoundId: newRound!.id,
          playerId: p.playerId,
          position: p.position,
          price: p.price,
        }))
      );
    }

    log.info("Round registered from suggestion", {
      userId,
      teamId,
      roundId: newRound!.id,
      lineupSuggestionId,
      round: suggestion.round,
      players: suggestionPlayers.length,
    });

    res.status(201).json({ round: { ...newRound, playerCount: suggestionPlayers.length } });
  } catch (err) {
    log.error("Failed to register round from suggestion", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Falha ao registrar rodada." });
  }
});

export default router;
