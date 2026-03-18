import { Router } from "express";
import axios from "axios";
import { db } from "@workspace/db";
import { matchesTable, clubsTable, playerScoutRoundTable, playersTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { upsertMatch } from "../repositories/matchRepository";
import { findClubByExternalId } from "../repositories/clubRepository";

const router = Router();

router.get("/matches/current", async (_req, res) => {
  try {
    const statusRes = await axios.get("https://api.cartola.globo.com/mercado/status", { timeout: 10000 });
    const statusData = statusRes.data as { rodada_atual?: number };
    const round = statusData.rodada_atual ?? 1;

    const matchesInDB = await db
      .select()
      .from(matchesTable)
      .where(eq(matchesTable.round, round));

    if (matchesInDB.length > 0) {
      const clubs = await db.select().from(clubsTable);
      const clubMap = new Map(clubs.map((c) => [c.id, c]));
      const enriched = matchesInDB.map((m) => ({
        ...m,
        homeClub: m.homeClubId ? clubMap.get(m.homeClubId) ?? null : null,
        awayClub: m.awayClubId ? clubMap.get(m.awayClubId) ?? null : null,
      }));
      res.json({ matches: enriched, round });
      return;
    }

    try {
      const matchesRes = await axios.get(`https://api.cartola.globo.com/rodadas`, { timeout: 10000 });
      const roundData = Array.isArray(matchesRes.data)
        ? matchesRes.data.find((r: { rodada_id?: number }) => r.rodada_id === round)
        : null;

      if (roundData?.partidas) {
        for (const partida of roundData.partidas) {
          const homeClub = await findClubByExternalId("cartola_api", String(partida.clube_casa_id));
          const awayClub = await findClubByExternalId("cartola_api", String(partida.clube_visitante_id));

          await upsertMatch({
            externalSource: "cartola_api",
            externalId: String(partida.partida_id),
            round,
            homeClubId: homeClub?.id ?? null,
            awayClubId: awayClub?.id ?? null,
            matchDate: partida.partida_data ? new Date(partida.partida_data) : null,
            stadium: partida.local ?? null,
            status: partida.status ?? null,
          });
        }
      }
    } catch {
      console.warn("[matches route] Could not sync matches from API");
    }

    const updatedMatches = await db
      .select()
      .from(matchesTable)
      .where(eq(matchesTable.round, round));

    const clubs = await db.select().from(clubsTable);
    const clubMap = new Map(clubs.map((c) => [c.id, c]));

    const enriched = updatedMatches.map((m) => ({
      ...m,
      homeClub: m.homeClubId ? clubMap.get(m.homeClubId) ?? null : null,
      awayClub: m.awayClubId ? clubMap.get(m.awayClubId) ?? null : null,
    }));

    res.json({ matches: enriched, round });
  } catch (error) {
    console.error("[matches route]", error);
    res.status(500).json({ error: "Failed to fetch matches" });
  }
});

router.get("/matches/confrontos", async (_req, res) => {
  try {
    const statusRes = await axios.get("https://api.cartola.globo.com/mercado/status", { timeout: 10000 });
    const statusData = statusRes.data as { rodada_atual?: number };
    const round = statusData.rodada_atual ?? 1;

    const matches = await db
      .select()
      .from(matchesTable)
      .where(eq(matchesTable.round, round));

    if (matches.length === 0) {
      res.json({ confrontos: [], round });
      return;
    }

    const clubs = await db.select().from(clubsTable);
    const clubMap = new Map(clubs.map((c) => [c.id, c]));

    const allPlayers = await db.select().from(playersTable);
    const playersByClub = new Map<number, typeof allPlayers>();
    for (const player of allPlayers) {
      if (player.clubId == null) continue;
      const list = playersByClub.get(player.clubId) ?? [];
      list.push(player);
      playersByClub.set(player.clubId, list);
    }

    const RECENT_ROUNDS = 5;
    async function getClubStats(clubId: number): Promise<{
      avgGoalsScored: number;
      avgGoalsConceded: number;
      avgPointsGenerated: number;
      offensiveStrength: number;
      defensiveStrength: number;
      bestPositions: string[];
    }> {
      const clubPlayers = playersByClub.get(clubId) ?? [];
      if (clubPlayers.length === 0) {
        return { avgGoalsScored: 0, avgGoalsConceded: 0, avgPointsGenerated: 0, offensiveStrength: 0.5, defensiveStrength: 0.5, bestPositions: [] };
      }

      const playerIds = clubPlayers.map((p) => p.id);
      const recentRoundMin = Math.max(1, round - RECENT_ROUNDS);

      const scouts: Array<{ points: number | null; goals: number | null; goalsConceded: number | null; position: string }> = [];
      for (const playerId of playerIds) {
        const playerScouts = await db
          .select()
          .from(playerScoutRoundTable)
          .where(
            and(
              eq(playerScoutRoundTable.playerId, playerId)
            )
          )
          .orderBy(desc(playerScoutRoundTable.round))
          .limit(RECENT_ROUNDS);

        const player = allPlayers.find((p) => p.id === playerId);
        for (const s of playerScouts) {
          if (s.round >= recentRoundMin) {
            scouts.push({
              points: s.points,
              goals: s.goals,
              goalsConceded: s.goalsConceded,
              position: player?.position ?? "MEI",
            });
          }
        }
      }

      if (scouts.length === 0) {
        return { avgGoalsScored: 0, avgGoalsConceded: 0, avgPointsGenerated: 0, offensiveStrength: 0.5, defensiveStrength: 0.5, bestPositions: [] };
      }

      const totalGoals = scouts.reduce((s, r) => s + (r.goals ?? 0), 0);
      const totalConceded = scouts.reduce((s, r) => s + (r.goalsConceded ?? 0), 0);
      const totalPoints = scouts.reduce((s, r) => s + (r.points ?? 0), 0);
      const roundsPlayed = RECENT_ROUNDS;

      const avgGoalsScored = totalGoals / roundsPlayed;
      const avgGoalsConceded = totalConceded / roundsPlayed;
      const avgPointsGenerated = totalPoints / Math.max(scouts.length, 1);

      const positionPoints: Record<string, number[]> = {};
      for (const s of scouts) {
        if (!positionPoints[s.position]) positionPoints[s.position] = [];
        positionPoints[s.position]!.push(s.points ?? 0);
      }
      const posAvg = Object.entries(positionPoints).map(([pos, pts]) => ({
        pos,
        avg: pts.reduce((a, b) => a + b, 0) / pts.length,
      })).sort((a, b) => b.avg - a.avg);
      const bestPositions = posAvg.slice(0, 2).map((p) => p.pos);

      const offensiveStrength = Math.min(1, avgGoalsScored / 2.5);
      const defensiveStrength = Math.max(0, 1 - avgGoalsConceded / 2.5);

      return { avgGoalsScored, avgGoalsConceded, avgPointsGenerated, offensiveStrength, defensiveStrength, bestPositions };
    }

    type DifficultyLevel = "fácil" | "médio" | "difícil";

    const confrontos = await Promise.all(
      matches.map(async (match) => {
        const homeClub = match.homeClubId ? clubMap.get(match.homeClubId) ?? null : null;
        const awayClub = match.awayClubId ? clubMap.get(match.awayClubId) ?? null : null;

        const homeStats = match.homeClubId ? await getClubStats(match.homeClubId) : null;
        const awayStats = match.awayClubId ? await getClubStats(match.awayClubId) : null;

        const homeGoalExpectation = ((homeStats?.offensiveStrength ?? 0.5) + (1 - (awayStats?.defensiveStrength ?? 0.5))) / 2;
        const awayGoalExpectation = ((awayStats?.offensiveStrength ?? 0.5) + (1 - (homeStats?.defensiveStrength ?? 0.5))) / 2;

        const homeDifficulty: DifficultyLevel =
          awayGoalExpectation > 0.6 ? "difícil" : awayGoalExpectation > 0.35 ? "médio" : "fácil";
        const awayDifficulty: DifficultyLevel =
          homeGoalExpectation > 0.6 ? "difícil" : homeGoalExpectation > 0.35 ? "médio" : "fácil";

        const recommendedPositionsHome: string[] = [];
        if (homeStats && homeStats.offensiveStrength > 0.5) {
          recommendedPositionsHome.push("ATA", "MEI");
        }
        if (awayStats && awayStats.defensiveStrength < 0.4) {
          if (!recommendedPositionsHome.includes("ATA")) recommendedPositionsHome.push("ATA");
        }
        if (homeStats && homeStats.defensiveStrength > 0.6) {
          recommendedPositionsHome.push("GOL", "ZAG");
        }

        const recommendedPositionsAway: string[] = [];
        if (awayStats && awayStats.offensiveStrength > 0.5) {
          recommendedPositionsAway.push("ATA", "MEI");
        }
        if (homeStats && homeStats.defensiveStrength < 0.4) {
          if (!recommendedPositionsAway.includes("ATA")) recommendedPositionsAway.push("ATA");
        }
        if (awayStats && awayStats.defensiveStrength > 0.6) {
          recommendedPositionsAway.push("GOL", "ZAG");
        }

        return {
          matchId: match.id,
          round,
          matchDate: match.matchDate,
          stadium: match.stadium,
          homeClub: homeClub ? { id: homeClub.id, name: homeClub.name, abbreviation: homeClub.abbreviation, badgeUrl: homeClub.badgeUrl } : null,
          awayClub: awayClub ? { id: awayClub.id, name: awayClub.name, abbreviation: awayClub.abbreviation, badgeUrl: awayClub.badgeUrl } : null,
          homeStats: homeStats ? {
            offensiveStrength: Number(homeStats.offensiveStrength.toFixed(2)),
            defensiveStrength: Number(homeStats.defensiveStrength.toFixed(2)),
            avgGoalsScored: Number(homeStats.avgGoalsScored.toFixed(2)),
            avgGoalsConceded: Number(homeStats.avgGoalsConceded.toFixed(2)),
            bestPositions: homeStats.bestPositions,
          } : null,
          awayStats: awayStats ? {
            offensiveStrength: Number(awayStats.offensiveStrength.toFixed(2)),
            defensiveStrength: Number(awayStats.defensiveStrength.toFixed(2)),
            avgGoalsScored: Number(awayStats.avgGoalsScored.toFixed(2)),
            avgGoalsConceded: Number(awayStats.avgGoalsConceded.toFixed(2)),
            bestPositions: awayStats.bestPositions,
          } : null,
          homeGoalExpectation: Number(homeGoalExpectation.toFixed(2)),
          awayGoalExpectation: Number(awayGoalExpectation.toFixed(2)),
          homeDifficulty,
          awayDifficulty,
          recommendedPositionsHome: [...new Set(recommendedPositionsHome)],
          recommendedPositionsAway: [...new Set(recommendedPositionsAway)],
        };
      })
    );

    res.json({ confrontos, round });
  } catch (error) {
    console.error("[confrontos route]", error);
    res.status(500).json({ error: "Failed to compute confrontos" });
  }
});

export default router;
