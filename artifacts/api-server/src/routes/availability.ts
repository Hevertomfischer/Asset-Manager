import { Router } from "express";
import { db } from "@workspace/db";
import { playerAvailabilityTable, playersTable, clubsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import axios from "axios";

const router = Router();

router.get("/availability/current", async (req, res) => {
  try {
    const { round } = req.query as Record<string, string>;

    let currentRound = round ? Number(round) : null;
    if (!currentRound) {
      try {
        const r = await axios.get("https://api.cartola.globo.com/mercado/status", { timeout: 5000 });
        currentRound = (r.data as { rodada_atual?: number }).rodada_atual ?? 1;
      } catch {
        currentRound = 1;
      }
    }

    const availabilities = await db
      .select()
      .from(playerAvailabilityTable)
      .where(eq(playerAvailabilityTable.round, currentRound));

    const players = await db.select().from(playersTable);
    const clubs = await db.select().from(clubsTable);
    const playerMap = new Map(players.map((p) => [p.id, p]));
    const clubMap = new Map(clubs.map((c) => [c.id, c]));

    const enriched = availabilities.map((avail) => {
      const player = playerMap.get(avail.playerId);
      const club = player?.clubId ? clubMap.get(player.clubId) : null;
      return {
        ...avail,
        player: player
          ? {
              id: player.id,
              name: player.name,
              nickname: player.nickname,
              position: player.position,
              club: club ? { id: club.id, name: club.name, abbreviation: club.abbreviation } : null,
            }
          : null,
      };
    });

    res.json({ availability: enriched, round: currentRound });
  } catch (error) {
    console.error("[availability route]", error);
    res.status(500).json({ error: "Failed to fetch availability" });
  }
});

export default router;
