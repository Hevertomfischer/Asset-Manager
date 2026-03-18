import { db } from "@workspace/db";
import { dataCollectionLogTable } from "@workspace/db/schema";
import { fetchMarket, fetchScouts } from "../providers/cartolaApiProvider";
import { fetchProbables } from "../providers/geProbablesProvider";
import { fetchPlayerStats } from "../providers/gatoMestreProvider";
import { fetchHistoricalRound } from "../providers/historicalCartolaProvider";
import { upsertClub, findClubByExternalId } from "../repositories/clubRepository";
import { upsertPlayer } from "../repositories/playerRepository";
import { upsertMatch, getMatchesByRound } from "../repositories/matchRepository";
import { insertScoutRound, getScoutsByRound } from "../repositories/projectionRepository";
import { runAvailabilityEngine } from "../engines/availabilityEngine";
import { runProjectionEngine } from "../engines/projectionEngine";

export interface ETLResult {
  success: boolean;
  round: number;
  clubsUpserted: number;
  playersUpserted: number;
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

export async function runCurrentRoundETL(): Promise<ETLResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log("[ETL] Starting current round sync...");

  let round = 1;
  let clubsUpserted = 0;
  let playersUpserted = 0;

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
        });
        playersUpserted++;
      } catch (e) {
        warnings.push(`Failed to upsert player ${player.externalId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await logETL("etl", "players", "success", `Upserted ${playersUpserted} players, ${clubsUpserted} clubs`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`Market fetch failed: ${msg}`);
    await logETL("etl", "market", "error", msg);
  }

  let probables: Awaited<ReturnType<typeof fetchProbables>> = [];
  try {
    probables = await fetchProbables(round);
    await logETL("etl", "probables", "success", `Fetched ${probables.length} probables`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    warnings.push(`Probables fetch degraded: ${msg}`);
    await logETL("etl", "probables", "degraded", msg);
  }

  try {
    await fetchPlayerStats(round);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    warnings.push(`GatoMestre degraded: ${msg}`);
  }

  let availabilityProcessed = false;
  try {
    await runAvailabilityEngine(round, probables);
    availabilityProcessed = true;
    await logETL("etl", "availability", "success", `Availability engine complete for round ${round}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`Availability engine failed: ${msg}`);
    await logETL("etl", "availability", "error", msg);
  }

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
