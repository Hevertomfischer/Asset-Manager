import { db } from "@workspace/db";
import { dataCollectionLogTable } from "@workspace/db/schema";
import { fetchMarket, fetchScouts } from "../providers/cartolaApiProvider";
import { fetchProbables } from "../providers/geProbablesProvider";
import { fetchPlayerStats } from "../providers/gatoMestreProvider";
import { fetchHistoricalRound } from "../providers/historicalCartolaProvider";
import { fetchPlayerStatuses } from "../providers/cartolaStatusProvider";
import type { CartolaStatusResult } from "../providers/cartolaStatusProvider";
import { upsertClub, findClubByExternalId } from "../repositories/clubRepository";
import { upsertPlayer, findPlayerByExternalId } from "../repositories/playerRepository";
import { upsertMatch } from "../repositories/matchRepository";
import {
  insertScoutRound,
  getScoutsByRound,
} from "../repositories/projectionRepository";
import { runAvailabilityEngine } from "../engines/availabilityEngine";
import { runProjectionEngine } from "../engines/projectionEngine";
import { roundSnapshotTable } from "@workspace/db/schema";
import { desc, eq, and } from "drizzle-orm";
import axios from "axios";
import crypto from "crypto";

export interface ETLResult {
  success: boolean;
  round: number;
  clubsUpserted: number;
  playersUpserted: number;
  matchesUpserted: number;
  scoutsInserted: number;
  availabilityProcessed: boolean;
  projectionsGenerated: boolean;
  errors: string[];
  warnings: string[];
}

async function logETL(source: string, entityType: string, status: string, message: string) {
  try {
    await db.insert(dataCollectionLogTable).values({ source, entityType, status, message });
  } catch {
    console.error("[etl] Failed to write log entry");
  }
}

async function getLastSnapshot(source: string): Promise<Record<string, unknown> | null> {
  const snapshot = await db.query.roundSnapshotTable
    .findFirst({
      where: (t) => eq(t.source, source),
      orderBy: (t) => [desc(t.collectedAt)],
    })
    .catch(() => null);
  return snapshot ? (snapshot.payloadJson as Record<string, unknown>) : null;
}

async function saveSnapshot(round: number, source: string, payload: unknown) {
  const payloadStr = JSON.stringify(payload);
  const hash = crypto.createHash("sha256").update(payloadStr).digest("hex");
  await db.insert(roundSnapshotTable).values({
    round,
    source,
    payloadJson: payload as Record<string, unknown>,
    hash,
  });
}

export async function runCurrentRoundETL(): Promise<ETLResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log("[ETL] Starting current round sync...");

  let round = 1;
  let clubsUpserted = 0;
  let playersUpserted = 0;
  let matchesUpserted = 0;
  let scoutsInserted = 0;

  // === Step 1: Fetch market data (players + clubs) — with fallback ===
  try {
    const marketData = await fetchMarket();
    round = marketData.round.roundNumber;

    await logETL("etl", "market", "success", `Round ${round} market fetch complete`);

    for (const club of marketData.clubs) {
      try {
        await upsertClub(club);
        clubsUpserted++;
      } catch (e) {
        warnings.push(`Failed to upsert club ${club.externalId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    for (const player of marketData.players) {
      try {
        const clubRecord = await findClubByExternalId(player.externalSource, player.clubExternalId);
        await upsertPlayer({
          externalSource: player.externalSource,
          externalId: player.externalId,
          clubId: clubRecord?.id ?? null,
          name: player.name,
          nickname: player.nickname,
          position: player.position,
          status: player.status,
          price: player.price,
          averagePoints: player.averagePoints,
          popularity: player.popularity,
          priceVariation: player.priceVariation,
          playedLastRound: player.playedLastRound,
          gamesPlayed: player.gamesPlayed,
        });
        playersUpserted++;
      } catch (e) {
        warnings.push(`Failed to upsert player ${player.externalId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await logETL("etl", "players", "success", `Upserted ${playersUpserted} players, ${clubsUpserted} clubs for round ${round}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`Market fetch failed: ${msg}`);
    await logETL("etl", "market", "error", msg);

    // Fallback: try to get round number from last snapshot
    const lastSnapshot = await getLastSnapshot("cartola_api");
    if (lastSnapshot?.round && typeof lastSnapshot.round === "object") {
      const r = lastSnapshot.round as { roundNumber?: number };
      round = r.roundNumber ?? 1;
      await logETL("etl", "market", "degraded", `Using last snapshot for round ${round}`);
    }
  }

  // === Step 2: Fetch current-round scouts ===
  try {
    const scouts = await fetchScouts(round);
    const players = await db.query.playersTable.findMany();
    const playerMap = new Map(players.map((p) => [p.externalId, p]));
    const existingScouts = await getScoutsByRound(round);
    const existingPlayerIds = new Set(existingScouts.map((s) => s.playerId));

    for (const [atletaId, scoutData] of scouts.entries()) {
      const player = playerMap.get(atletaId);
      if (!player || existingPlayerIds.has(player.id)) continue;

      try {
        await insertScoutRound({
          playerId: player.id,
          round,
          source: "cartola_api",
          points: scoutData["pontos"] ?? null,
          minutesPlayed: null,
          goals: scoutData["G"] ?? null,
          assists: scoutData["A"] ?? null,
          shots: scoutData["FT"] ?? null,
          shotsOnTarget: scoutData["FD"] ?? null,
          tackles: scoutData["DS"] ?? null,
          interceptions: scoutData["DE"] ?? null,
          foulsSuffered: scoutData["FS"] ?? null,
          foulsCommitted: scoutData["FC"] ?? null,
          saves: scoutData["GS"] ?? null,
          goalsConceded: scoutData["GC"] ?? null,
          cleanSheet: scoutData["SG"] ?? null,
          yellowCards: scoutData["CA"] ?? null,
          redCards: scoutData["CV"] ?? null,
          penaltyMissed: scoutData["PP"] ?? null,
          penaltySaved: scoutData["PS"] ?? null,
          ownGoals: null,
        });
        scoutsInserted++;
      } catch {
        // ignore individual scout insert failures
      }
    }

    await logETL("etl", "scouts", "success", `Inserted ${scoutsInserted} scout records for round ${round}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    warnings.push(`Scout fetch degraded: ${msg}`);
    await logETL("etl", "scouts", "degraded", msg);
  }

  // === Step 3: Fetch matches from Cartola rounds API ===
  try {
    const matchesRes = await axios.get(`https://api.cartola.globo.com/rodadas`, { timeout: 10000 });
    const roundData = Array.isArray(matchesRes.data)
      ? (matchesRes.data as Array<{ rodada_id?: number; partidas?: unknown[] }>).find(
          (r) => r.rodada_id === round
        )
      : null;

    if (roundData?.partidas) {
      await saveSnapshot(round, "cartola_api_matches", { partidas: roundData.partidas });

      for (const partida of roundData.partidas as Array<{
        partida_id?: number;
        clube_casa_id?: number;
        clube_visitante_id?: number;
        partida_data?: string;
        local?: string;
        status?: string;
      }>) {
        try {
          const homeClub = await findClubByExternalId("cartola_api", String(partida.clube_casa_id ?? ""));
          const awayClub = await findClubByExternalId("cartola_api", String(partida.clube_visitante_id ?? ""));

          await upsertMatch({
            externalSource: "cartola_api",
            externalId: String(partida.partida_id ?? Math.random()),
            round,
            homeClubId: homeClub?.id ?? null,
            awayClubId: awayClub?.id ?? null,
            matchDate: partida.partida_data ? new Date(partida.partida_data) : null,
            stadium: partida.local ?? null,
            status: partida.status ?? null,
          });
          matchesUpserted++;
        } catch {
          // ignore individual match failures
        }
      }
    }

    await logETL("etl", "matches", "success", `Upserted ${matchesUpserted} matches for round ${round}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    warnings.push(`Match sync degraded: ${msg}`);
    await logETL("etl", "matches", "degraded", msg);
  }

  // === Step 4: GE Prováveis ===
  let probables: Awaited<ReturnType<typeof fetchProbables>> = [];
  try {
    probables = await fetchProbables(round);
    await logETL("etl", "probables", "success", `Fetched ${probables.length} probables`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    warnings.push(`Probables fetch degraded: ${msg}`);
    await logETL("etl", "probables", "degraded", msg);
  }

  // === Step 4b: Cartola Status Provider ===
  let cartolaStatusResult: CartolaStatusResult | undefined;
  try {
    cartolaStatusResult = await fetchPlayerStatuses(round);
    await logETL(
      "etl",
      "player_status",
      "success",
      `Cartola status: ${cartolaStatusResult.players.length} players, ${cartolaStatusResult.unavailableCount} unavailable`
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    warnings.push(`Cartola status fetch degraded: ${msg}`);
    await logETL("etl", "player_status", "degraded", msg);
  }

  // === Step 5: GatoMestre stats (best-effort) ===
  try {
    await fetchPlayerStats(round);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    warnings.push(`GatoMestre degraded: ${msg}`);
  }

  // === Step 6: Availability engine ===
  let availabilityProcessed = false;
  try {
    await runAvailabilityEngine(round, probables, cartolaStatusResult);
    availabilityProcessed = true;
    await logETL("etl", "availability", "success", `Availability engine complete for round ${round}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`Availability engine failed: ${msg}`);
    await logETL("etl", "availability", "error", msg);
  }

  // === Step 7: Projection engine ===
  let projectionsGenerated = false;
  try {
    await runProjectionEngine(round);
    projectionsGenerated = true;
    await logETL("etl", "projections", "success", `Projection engine complete for round ${round}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`Projection engine failed: ${msg}`);
    await logETL("etl", "projections", "error", msg);
  }

  return {
    success: errors.length === 0,
    round,
    clubsUpserted,
    playersUpserted,
    matchesUpserted,
    scoutsInserted,
    availabilityProcessed,
    projectionsGenerated,
    errors,
    warnings,
  };
}

export async function syncHistoricalRound(round: number): Promise<void> {
  try {
    const scouts = await fetchHistoricalRound(round);
    const existing = await getScoutsByRound(round);

    if (existing.length > 0) {
      console.log(`[ETL] Round ${round} scouts already in DB, skipping insert`);
      return;
    }

    const players = await db.query.playersTable.findMany();
    const playerMap = new Map(players.map((p) => [p.externalId, p]));

    for (const scout of scouts) {
      const player = playerMap.get(String(scout.atleta_id));
      if (!player) continue;

      await insertScoutRound({
        playerId: player.id,
        round: scout.rodada_id,
        source: "historical_cartola",
        points: scout.pontos_num ?? null,
        minutesPlayed: null,
        goals: scout.scout?.G ?? null,
        assists: scout.scout?.A ?? null,
        shots: scout.scout?.FT ?? null,
        shotsOnTarget: scout.scout?.FD ?? null,
        tackles: scout.scout?.DS ?? null,
        interceptions: scout.scout?.DE ?? null,
        foulsSuffered: scout.scout?.FS ?? null,
        foulsCommitted: scout.scout?.FC ?? null,
        saves: scout.scout?.GS ?? null,
        goalsConceded: scout.scout?.GC ?? null,
        cleanSheet: scout.scout?.SG ?? null,
        yellowCards: scout.scout?.CA ?? null,
        redCards: scout.scout?.CV ?? null,
        penaltyMissed: scout.scout?.PP ?? null,
        penaltySaved: scout.scout?.PS ?? null,
        ownGoals: null,
      });
    }

    console.log(`[ETL] Saved ${scouts.length} historical scouts for round ${round}`);
  } catch (error) {
    console.error(`[ETL] Historical sync failed for round ${round}:`, error);
    throw error;
  }
}
