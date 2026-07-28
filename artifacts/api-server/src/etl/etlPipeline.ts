import { db } from "@workspace/db";
import { dataCollectionLogTable, playerScoutRoundTable } from "@workspace/db/schema";
import { fetchMarket, fetchScouts } from "../providers/cartolaApiProvider";
import { fetchProbables } from "../providers/geProbablesProvider";
import { fetchHistoricalRound } from "../providers/historicalCartolaProvider";
import { SCOUT_SCORING } from "../config/projectionWeights";
import { fetchPlayerStatuses } from "../providers/cartolaStatusProvider";
import type { CartolaStatusResult } from "../providers/cartolaStatusProvider";
import { upsertClub, findClubByExternalId } from "../repositories/clubRepository";
import { upsertPlayer, findPlayerByExternalId } from "../repositories/playerRepository";
import { syncMatchesFromCartolaApi, syncHistoricalMatchesFromCartolaApi } from "../helpers/matchSyncHelper";
import { syncXgFromFootystats } from "../helpers/geXgHelper";
import {
  insertScoutRound,
  getScoutsByRound,
} from "../repositories/projectionRepository";
import { runAvailabilityEngine } from "../engines/availabilityEngine";
import { runProjectionEngine } from "../engines/projectionEngine";
import { applyMpvToDatabase } from "../services/mpvService";
import { roundSnapshotTable } from "@workspace/db/schema";
import { desc, eq, and, isNull } from "drizzle-orm";
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
  xgMatchesUpdated: number;
  xgClubsMapped: number;
  xgDegraded: boolean;
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
  let xgMatchesUpdated = 0;
  let xgClubsMapped = 0;
  let xgDegraded = false;

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
          minimoParaValorizar: player.minimoParaValorizar,
          cumulativeScouts: player.cumulativeScouts,
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

  // === Step 2b: Compute MPV via formula (fills NULL values only) ===
  try {
    const mpvUpdated = await applyMpvToDatabase(false);
    await logETL("etl", "mpv", "success", `MPV formula applied to ${mpvUpdated} players for round ${round}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    warnings.push(`MPV calculation degraded: ${msg}`);
    await logETL("etl", "mpv", "degraded", msg);
  }

  // === Step 3: Fetch matches from Cartola /partidas API ===
  try {
    matchesUpserted = await syncMatchesFromCartolaApi(round);
    await logETL("etl", "matches", "success", `Upserted ${matchesUpserted} matches for round ${round}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    warnings.push(`Match sync degraded: ${msg}`);
    await logETL("etl", "matches", "degraded", msg);
  }

  // === Step 3b: Auto-sync xG after matches are loaded ===
  // Only run if matches were actually upserted — avoids noisy "No matches found" warnings
  // when the match sync degraded and there is nothing to apply xG rates to yet.
  if (matchesUpserted > 0) try {
    const xgResult = await syncXgFromFootystats(round);
    xgMatchesUpdated = xgResult.matchesUpdated;
    xgClubsMapped = xgResult.clubsMapped;
    xgDegraded = xgResult.degraded ?? false;
    await logETL(
      "footystats_xg",
      "xg",
      xgResult.matchesUpdated > 0 ? "success" : "degraded",
      `xG auto-sync round ${round}: ${xgResult.matchesUpdated} matches updated, ${xgResult.clubStatsParsed} team stats parsed (historical), ${xgResult.clubsMapped} clubs mapped`
    );
    if (xgResult.warnings.length > 0) {
      warnings.push(...xgResult.warnings.map((w) => `[xG] ${w}`));
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    warnings.push(`xG auto-sync degraded: ${msg}`);
    await logETL("footystats_xg", "xg", "degraded", `xG auto-sync failed for round ${round}: ${msg}`);
  }

  // === Step 4: Cartola Status Provider ===
  // Must run before Step 4b (prováveis derivation) so its snapshot is available.
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

  // === Step 4b: Prováveis (derivados do Cartola Status) ===
  // Antes eram obtidos por scraping do GE Globo (URL fora do ar desde mai/2026).
  // Agora derivamos do snapshot do Cartola Status salvo no passo anterior.
  let probables: Awaited<ReturnType<typeof fetchProbables>> = [];
  try {
    probables = await fetchProbables(round);
    await logETL("etl", "probables", "success", `Derivados ${probables.length} prováveis/dúvidas do Cartola Status`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    warnings.push(`Probables fetch degraded: ${msg}`);
    await logETL("etl", "probables", "degraded", msg);
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
    xgMatchesUpdated,
    xgClubsMapped,
    xgDegraded,
  };
}

function computePointsFromRawScouts(s: Record<string, number | undefined>): number {
  let pts = 0;
  for (const [key, value] of Object.entries(s)) {
    if (value != null && SCOUT_SCORING[key] != null) {
      pts += value * SCOUT_SCORING[key]!;
    }
  }
  return Math.round(pts * 100) / 100;
}

export async function syncHistoricalRound(round: number): Promise<void> {
  // Always sync historical match results (scores + form) for this round —
  // this feeds getClubStrengthFromMatches and matchupScore in the projection engine.
  try {
    const matchesUpserted = await syncHistoricalMatchesFromCartolaApi(round);
    console.log(`[ETL] Synced ${matchesUpserted} historical match records for round ${round}`);
  } catch (error) {
    console.warn(`[ETL] Historical match sync degraded for round ${round}:`, error instanceof Error ? error.message : error);
    // Non-fatal: continue to player scout sync
  }

  try {
    const scouts = await fetchHistoricalRound(round);
    const existing = await getScoutsByRound(round);

    // If existing records already have real points, skip
    const hasRealPoints = existing.some((e) => e.points != null && e.points > 0);
    if (hasRealPoints) {
      console.log(`[ETL] Round ${round} scouts already have real points in DB, skipping`);
      return;
    }

    // If there are existing records but with null points, delete them so we can re-insert
    if (existing.length > 0) {
      console.log(`[ETL] Round ${round}: deleting ${existing.length} null-point records for re-sync`);
      await db
        .delete(playerScoutRoundTable)
        .where(
          and(
            eq(playerScoutRoundTable.round, round),
            isNull(playerScoutRoundTable.points)
          )
        );
    }

    const players = await db.query.playersTable.findMany();
    const playerMap = new Map(players.map((p) => [p.externalId, p]));

    let inserted = 0;
    for (const scout of scouts) {
      const player = playerMap.get(String(scout.atleta_id));
      if (!player) continue;

      // Prefer API points; fall back to computing from raw scouts
      const rawScouts = (scout.scout ?? {}) as Record<string, number | undefined>;
      const computedPoints = computePointsFromRawScouts(rawScouts);
      const points = scout.pontos_num != null ? scout.pontos_num : (computedPoints !== 0 ? computedPoints : null);

      await insertScoutRound({
        playerId: player.id,
        round: scout.rodada_id,
        source: "historical_cartola",
        points,
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
      inserted++;
    }

    console.log(`[ETL] Saved ${inserted} historical scouts for round ${round} (${scouts.length} from API)`);
  } catch (error) {
    console.error(`[ETL] Historical scout sync failed for round ${round}:`, error);
    throw error;
  }
}
