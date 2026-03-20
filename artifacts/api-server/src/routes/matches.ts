import { Router } from "express";
import axios from "axios";
import { db } from "@workspace/db";
import { matchesTable, clubsTable, playerScoutRoundTable, playersTable } from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getClubStrengthFromMatches } from "../repositories/matchRepository";
import { syncMatchesFromCartolaApi } from "../helpers/matchSyncHelper";

const router = Router();

/**
 * Converts a form result array (e.g. ["v","v","d","e","v"]) to an estimated
 * offensive/defensive strength when no historical match score data exists.
 * V=win (+0.07 each), D=loss (-0.07 each), E=draw (no change).
 * Range is clamped to [0.2, 0.8] around the neutral 0.5.
 */
function strengthFromForm(form: string[] | null): { offensiveStrength: number; defensiveStrength: number } {
  if (!form || form.length === 0) return { offensiveStrength: 0.5, defensiveStrength: 0.5 };
  let wins = 0, losses = 0;
  for (const r of form.slice(0, 5)) {
    if (r === "v") wins++;
    else if (r === "d") losses++;
  }
  const momentum = (wins - losses) / 5; // -1.0 to +1.0
  return {
    offensiveStrength: Math.min(0.8, Math.max(0.2, 0.5 + momentum * 0.25)),
    defensiveStrength: Math.min(0.8, Math.max(0.2, 0.5 + momentum * 0.2)),
  };
}

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

        // Derive strength from form arrays (last 5 results) as fallback / supplement
        const homeFormStrength = strengthFromForm(match.homeForm);
        const awayFormStrength = strengthFromForm(match.awayForm);

        // Blend historical data (if available) with form-based estimate.
        // When history exists: 70% historical + 30% form. When no history: 100% form.
        const blendStrength = (
          hist: typeof homeStrength,
          formS: typeof homeFormStrength
        ) => {
          if (!hist || hist.matchesAnalyzed === 0) {
            return { ...formS, avgGoalsScored: 0, avgGoalsConceded: 0 };
          }
          const w = 0.7;
          return {
            offensiveStrength: hist.offensiveStrength * w + formS.offensiveStrength * (1 - w),
            defensiveStrength: hist.defensiveStrength * w + formS.defensiveStrength * (1 - w),
            avgGoalsScored: hist.avgGoalsScored,
            avgGoalsConceded: hist.avgGoalsConceded,
          };
        };

        const homeStats = blendStrength(homeStrength, homeFormStrength);
        const awayStats = blendStrength(awayStrength, awayFormStrength);

        const formBasedHomeGoalExp = (homeStats.offensiveStrength + (1 - awayStats.defensiveStrength)) / 2;
        const formBasedAwayGoalExp = (awayStats.offensiveStrength + (1 - homeStats.defensiveStrength)) / 2;

        const formBasedHomeGoalExpNorm = formBasedHomeGoalExp;
        const formBasedAwayGoalExpNorm = formBasedAwayGoalExp;

        const xgSource: "xg_article" | "form_estimate" =
          match.homeXg != null ? "xg_article" : "form_estimate";

        // Difficulty from xG: use raw xG thresholds calibrated to Brasileirão data.
        // League avg ≈ 1.35 gols/team/game. "fácil" < 1.15, "difícil" > 1.45, "médio" otherwise.
        // For form-based, keep existing normalized thresholds.
        let homeDifficulty: DifficultyLevel;
        let awayDifficulty: DifficultyLevel;
        let homeGoalExpectation: number;
        let awayGoalExpectation: number;

        if (match.homeXg != null && match.awayXg != null) {
          homeGoalExpectation = match.homeXg;
          awayGoalExpectation = match.awayXg;
          homeDifficulty = match.awayXg > 1.55 ? "difícil" : match.awayXg < 1.15 ? "fácil" : "médio";
          awayDifficulty = match.homeXg > 1.55 ? "difícil" : match.homeXg < 1.15 ? "fácil" : "médio";
        } else {
          homeGoalExpectation = formBasedHomeGoalExpNorm;
          awayGoalExpectation = formBasedAwayGoalExpNorm;
          homeDifficulty = awayGoalExpectation > 0.6 ? "difícil" : awayGoalExpectation > 0.35 ? "médio" : "fácil";
          awayDifficulty = homeGoalExpectation > 0.6 ? "difícil" : homeGoalExpectation > 0.35 ? "médio" : "fácil";
        }

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
          homeXg: match.homeXg ?? null,
          awayXg: match.awayXg ?? null,
          xgSource,
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
