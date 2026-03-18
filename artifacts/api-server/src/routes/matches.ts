import { Router } from "express";
import axios from "axios";
import { db } from "@workspace/db";
import { matchesTable, clubsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
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
        const clubs = await db.select().from(clubsTable);
        const clubMap = new Map(clubs.map((c) => [c.id, c]));

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

export default router;
