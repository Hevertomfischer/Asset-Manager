import { Router } from "express";
import { db } from "@workspace/db";
import {
  playersTable,
  clubsTable,
  playerProjectionTable,
  playerAvailabilityTable,
} from "@workspace/db/schema";
import { eq, and, gte, lte, SQL, desc } from "drizzle-orm";
import { getPlayerById } from "../repositories/playerRepository";
import { requirePro } from "../middlewares/requirePro";
import axios from "axios";

async function resolveCurrentRound(override?: string): Promise<number> {
  if (override) return Number(override);
  try {
    const r = await axios.get("https://api.cartola.globo.com/mercado/status", { timeout: 5000 });
    const data = r.data as { rodada_atual?: number };
    return data.rodada_atual ?? 1;
  } catch {
    return 1;
  }
}

const router = Router();

router.get("/players", async (req, res) => {
  try {
    const {
      position,
      clubId,
      minPrice,
      maxPrice,
      probableOnly,
      minProjection,
      round,
    } = req.query as Record<string, string>;

    const currentRound = await resolveCurrentRound(round);
    const conditions: SQL[] = [];

    if (position) conditions.push(eq(playersTable.position, position));
    if (clubId) conditions.push(eq(playersTable.clubId, Number(clubId)));
    if (minPrice) conditions.push(gte(playersTable.price, Number(minPrice)));
    if (maxPrice) conditions.push(lte(playersTable.price, Number(maxPrice)));

    const players = conditions.length
      ? await db.select().from(playersTable).where(and(...conditions))
      : await db.select().from(playersTable);

    const projections = await db
      .select()
      .from(playerProjectionTable)
      .where(eq(playerProjectionTable.round, currentRound));

    const availabilities = await db
      .select()
      .from(playerAvailabilityTable)
      .where(eq(playerAvailabilityTable.round, currentRound));

    const clubs = await db.select().from(clubsTable);

    const projMap = new Map(projections.map((p) => [p.playerId, p]));
    const availMap = new Map(availabilities.map((a) => [a.playerId, a]));
    const clubMap = new Map(clubs.map((c) => [c.id, c]));

    let enriched = players.map((player) => {
      const proj = projMap.get(player.id);
      const avail = availMap.get(player.id);
      const club = player.clubId ? clubMap.get(player.clubId) : null;

      // Calculate baseAverage: average points minus goal-event contributions
      // Formula: (averagePoints * gamesPlayed - G*8 - A*5 - SG*5) / gamesPlayed
      let baseAverage: number | null = null;
      const scouts = player.cumulativeScouts;
      const gp = player.gamesPlayed;
      const avg = player.averagePoints;
      if (scouts != null && gp != null && gp > 0 && avg != null) {
        const totalPoints = avg * gp;
        const goalEvents = (scouts["G"] ?? 0) * 8 + (scouts["A"] ?? 0) * 5 + (scouts["SG"] ?? 0) * 5;
        const base = (totalPoints - goalEvents) / gp;
        baseAverage = Math.round(base * 100) / 100;
      }

      return {
        ...player,
        minimoParaValorizar: player.minimoParaValorizar ?? null,
        baseAverage,
        club: club ? { id: club.id, name: club.name, abbreviation: club.abbreviation, badgeUrl: club.badgeUrl } : null,
        projection: proj
          ? {
              expectedPoints: proj.expectedPoints,
              floorPoints: proj.floorPoints,
              ceilingPoints: proj.ceilingPoints,
              riskScore: proj.riskScore,
              recommendationScore: proj.recommendationScore,
              valueScore: proj.valueScore,
              explanationJson: proj.explanationJson,
            }
          : null,
        availability: avail
          ? {
              playProbability: avail.playProbability,
              expectedMinutes: avail.expectedMinutes,
              probableStatus: avail.probableStatus,
              injuryStatus: avail.injuryStatus,
              suspensionStatus: avail.suspensionStatus,
            }
          : null,
      };
    });

    if (probableOnly === "true") {
      enriched = enriched.filter((p) => (p.availability?.playProbability ?? 0) >= 0.7);
    }

    if (minProjection) {
      enriched = enriched.filter((p) => (p.projection?.expectedPoints ?? 0) >= Number(minProjection));
    }

    res.json({ players: enriched, total: enriched.length });
  } catch (error) {
    console.error("[players route]", error);
    res.status(500).json({ error: "Failed to fetch players" });
  }
});

router.get("/players/projections/current", requirePro, async (req, res) => {
  try {
    const { round } = req.query as Record<string, string>;
    const currentRound = await resolveCurrentRound(round);

    const projections = await db
      .select()
      .from(playerProjectionTable)
      .where(eq(playerProjectionTable.round, currentRound))
      .orderBy(desc(playerProjectionTable.recommendationScore));

    const players = await db.select().from(playersTable);
    const clubs = await db.select().from(clubsTable);
    const clubMap = new Map(clubs.map((c) => [c.id, c]));
    const playerMap = new Map(players.map((p) => [p.id, p]));

    const enriched = projections.map((proj) => {
      const player = playerMap.get(proj.playerId);
      const club = player?.clubId ? clubMap.get(player.clubId) : null;
      return {
        ...proj,
        player: player
          ? {
              id: player.id,
              name: player.name,
              nickname: player.nickname,
              position: player.position,
              price: player.price,
              averagePoints: player.averagePoints,
              club: club ? { id: club.id, name: club.name, abbreviation: club.abbreviation, badgeUrl: club.badgeUrl } : null,
            }
          : null,
      };
    });

    res.json({ projections: enriched, round: currentRound });
  } catch (error) {
    console.error("[projections route]", error);
    res.status(500).json({ error: "Failed to fetch projections" });
  }
});

router.get("/players/:id", async (req, res) => {
  try {
    const id = Number(req.params["id"]);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid player ID" });
      return;
    }

    const player = await getPlayerById(id);
    if (!player) {
      res.status(404).json({ error: "Player not found" });
      return;
    }

    const clubs = await db.select().from(clubsTable).where(player.clubId ? eq(clubsTable.id, player.clubId) : eq(clubsTable.id, 0));
    const club = clubs[0] ?? null;

    const projections = await db
      .select()
      .from(playerProjectionTable)
      .where(eq(playerProjectionTable.playerId, id))
      .orderBy(desc(playerProjectionTable.round))
      .limit(5);

    res.json({
      ...player,
      club: club ? { id: club.id, name: club.name, abbreviation: club.abbreviation, badgeUrl: club.badgeUrl } : null,
      projections,
    });
  } catch (error) {
    console.error("[player/:id route]", error);
    res.status(500).json({ error: "Failed to fetch player" });
  }
});

export default router;
