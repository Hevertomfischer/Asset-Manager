import { Router } from "express";
import axios from "axios";
import { db } from "@workspace/db";
import { matchesTable, clubsTable, playerScoutRoundTable, playersTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getClubStrengthFromMatches } from "../repositories/matchRepository";
import { syncMatchesFromCartolaApi } from "../helpers/matchSyncHelper";

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
      await syncMatchesFromCartolaApi(round);
    } catch {
      console.warn("[matches route] Could not sync matches from /partidas API");
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

    let matches = await db
      .select()
      .from(matchesTable)
      .where(eq(matchesTable.round, round));

    if (matches.length === 0) {
      try {
        await syncMatchesFromCartolaApi(round);
        matches = await db
          .select()
          .from(matchesTable)
          .where(eq(matchesTable.round, round));
      } catch {
        console.warn("[confrontos route] Could not sync matches from /partidas API");
      }
    }

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

    async function getBestPositions(clubId: number): Promise<string[]> {
      const clubPlayers = playersByClub.get(clubId) ?? [];
      if (clubPlayers.length === 0) return [];

      const recentRoundMin = Math.max(1, round - RECENT_ROUNDS);
      const positionPoints: Record<string, number[]> = {};

      for (const player of clubPlayers) {
        const playerScouts = await db
          .select()
          .from(playerScoutRoundTable)
          .where(and(eq(playerScoutRoundTable.playerId, player.id)))
          .orderBy(desc(playerScoutRoundTable.round))
          .limit(RECENT_ROUNDS);

        for (const s of playerScouts) {
          if (s.round >= recentRoundMin) {
            if (!positionPoints[player.position]) positionPoints[player.position] = [];
            positionPoints[player.position]!.push(s.points ?? 0);
          }
        }
      }

      return Object.entries(positionPoints)
        .map(([pos, pts]) => ({ pos, avg: pts.reduce((a, b) => a + b, 0) / pts.length }))
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 2)
        .map((p) => p.pos);
    }

    type DifficultyLevel = "fácil" | "médio" | "difícil";

    const confrontos = await Promise.all(
      matches.map(async (match) => {
        const homeClub = match.homeClubId ? clubMap.get(match.homeClubId) ?? null : null;
        const awayClub = match.awayClubId ? clubMap.get(match.awayClubId) ?? null : null;

        const [homeStrength, awayStrength, homeBestPositions, awayBestPositions] = await Promise.all([
          match.homeClubId ? getClubStrengthFromMatches(match.homeClubId, round) : null,
          match.awayClubId ? getClubStrengthFromMatches(match.awayClubId, round) : null,
          match.homeClubId ? getBestPositions(match.homeClubId) : Promise.resolve([]),
          match.awayClubId ? getBestPositions(match.awayClubId) : Promise.resolve([]),
        ]);

        const homeStats = homeStrength ?? { avgGoalsScored: 0, avgGoalsConceded: 0, offensiveStrength: 0.5, defensiveStrength: 0.5 };
        const awayStats = awayStrength ?? { avgGoalsScored: 0, avgGoalsConceded: 0, offensiveStrength: 0.5, defensiveStrength: 0.5 };

        const homeGoalExpectation = (homeStats.offensiveStrength + (1 - awayStats.defensiveStrength)) / 2;
        const awayGoalExpectation = (awayStats.offensiveStrength + (1 - homeStats.defensiveStrength)) / 2;

        const homeDifficulty: DifficultyLevel =
          awayGoalExpectation > 0.6 ? "difícil" : awayGoalExpectation > 0.35 ? "médio" : "fácil";
        const awayDifficulty: DifficultyLevel =
          homeGoalExpectation > 0.6 ? "difícil" : homeGoalExpectation > 0.35 ? "médio" : "fácil";

        const recommendedPositionsHome: string[] = [];
        if (homeStats.offensiveStrength > 0.5) recommendedPositionsHome.push("ATA", "MEI");
        if (awayStats.defensiveStrength < 0.4 && !recommendedPositionsHome.includes("ATA")) recommendedPositionsHome.push("ATA");
        if (homeStats.defensiveStrength > 0.6) recommendedPositionsHome.push("GOL", "ZAG");

        const recommendedPositionsAway: string[] = [];
        if (awayStats.offensiveStrength > 0.5) recommendedPositionsAway.push("ATA", "MEI");
        if (homeStats.defensiveStrength < 0.4 && !recommendedPositionsAway.includes("ATA")) recommendedPositionsAway.push("ATA");
        if (awayStats.defensiveStrength > 0.6) recommendedPositionsAway.push("GOL", "ZAG");

        return {
          matchId: match.id,
          round,
          matchDate: match.matchDate,
          stadium: match.stadium,
          homeForm: match.homeForm ?? null,
          awayForm: match.awayForm ?? null,
          homeClub: homeClub ? { id: homeClub.id, name: homeClub.name, abbreviation: homeClub.abbreviation, badgeUrl: homeClub.badgeUrl } : null,
          awayClub: awayClub ? { id: awayClub.id, name: awayClub.name, abbreviation: awayClub.abbreviation, badgeUrl: awayClub.badgeUrl } : null,
          homeStats: {
            offensiveStrength: Number(homeStats.offensiveStrength.toFixed(2)),
            defensiveStrength: Number(homeStats.defensiveStrength.toFixed(2)),
            avgGoalsScored: Number(homeStats.avgGoalsScored.toFixed(2)),
            avgGoalsConceded: Number(homeStats.avgGoalsConceded.toFixed(2)),
            bestPositions: homeBestPositions,
          },
          awayStats: {
            offensiveStrength: Number(awayStats.offensiveStrength.toFixed(2)),
            defensiveStrength: Number(awayStats.defensiveStrength.toFixed(2)),
            avgGoalsScored: Number(awayStats.avgGoalsScored.toFixed(2)),
            avgGoalsConceded: Number(awayStats.avgGoalsConceded.toFixed(2)),
            bestPositions: awayBestPositions,
          },
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
