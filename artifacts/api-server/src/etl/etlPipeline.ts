import { db } from "@workspace/db";
import { dataCollectionLogTable, playerScoutRoundTable } from "@workspace/db/schema";
import { fetchMarket } from "../providers/cartolaApiProvider";
import { fetchProbables } from "../providers/geProbablesProvider";
import { fetchHistoricalRound } from "../providers/historicalCartolaProvider";
import { mapCartolaScoutToColumns } from "../lib/mapCartolaScoutToColumns";
import { fetchPlayerStatuses } from "../providers/cartolaStatusProvider";
import type { CartolaStatusResult } from "../providers/cartolaStatusProvider";
import { upsertClub, findClubByExternalId } from "../repositories/clubRepository";
import { upsertPlayer, findPlayerByExternalId } from "../repositories/playerRepository";
import { syncMatchesFromCartolaApi, syncHistoricalMatchesFromCartolaApi } from "../helpers/matchSyncHelper";
import { syncXgFromFootystats } from "../helpers/geXgHelper";
import {
  insertScoutRound,
} from "../repositories/projectionRepository";
import { runAvailabilityEngine } from "../engines/availabilityEngine";
import { runProjectionEngine } from "../engines/projectionEngine";
import { canGenerateProjections } from "../services/projectionLockService";
import { applyMpvToDatabase } from "../services/mpvService";
import { roundSnapshotTable } from "@workspace/db/schema";
import { desc, eq, and } from "drizzle-orm";
import crypto from "crypto";
import { refreshPopularityFeatures } from "../services/popularityFeatureService";
import { createLogger } from "../lib/logger";
import { invalidateStatsCaches } from "../routes/stats";
import { requireSyncLease } from "../services/syncLease";
import { measureFullSync } from "../services/syncMetrics";
const logger = createLogger("etl");

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
    logger.error("Failed to write ETL log entry");
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
  return requireSyncLease("full-sync", () => measureFullSync(runCurrentRoundETLUnlocked));
}

async function runCurrentRoundETLUnlocked(): Promise<ETLResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  logger.info("Starting current round sync");

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
    await refreshPopularityFeatures().catch((e) => logger.warn("Falha ao reavaliar popularidade", { error: String(e) }));
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
          popularityCount: player.popularityCount,
          popularityListed: player.popularityListed,
          priceVariation: player.priceVariation,
          playedLastRound: player.playedLastRound,
          gamesPlayed: player.gamesPlayed,
          // Use official value from Cartola API when available; formula fallback
          // in Step 2b will only fill players where this is still NULL.
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
    await refreshPopularityFeatures().catch((e) => logger.warn("Falha ao reavaliar popularidade", { error: String(e) }));
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

  // No feature requires live scouts. Persist ONLY official final scores through
  // syncHistoricalRound, after the round advances. Partial /atletas/pontuados
  // values must not enter form, MPV, teams or backtests.

  // === Step 2b: Compute MPV via formula (fallback for players without API value) ===
  try {
    const mpvUpdated = await applyMpvToDatabase(false); // overwrite=false: only fills NULLs
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
    if (await canGenerateProjections(round)) {
      projectionsGenerated = await runProjectionEngine(round);
      await logETL("etl", "projections", "success", `Projection engine complete for round ${round}`);
    } else {
      await logETL("etl", "projections", "skipped", `Mercado fechado: projeções preservadas da rodada ${round}`);
    }
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

export async function syncHistoricalRound(round: number, options: { force?: boolean } = {}): Promise<{ upserted: number; missingPlayers: number }> {
  // Always sync historical match results (scores + form) for this round —
  // this feeds getClubStrengthFromMatches and matchupScore in the projection engine.
  try {
    const matchesUpserted = await syncHistoricalMatchesFromCartolaApi(round);
    logger.info("Historical matches synchronized", { round, matchesUpserted });
  } catch (error) {
    logger.warn("Historical match sync degraded", { round, error: String(error) });
    // Non-fatal: continue to player scout sync
  }

  try {
    const scouts = await fetchHistoricalRound(round, options);

    const players = await db.query.playersTable.findMany();
    const playerMap = new Map(players.map((p) => [p.externalId, p]));

    let inserted = 0;
    let missingPlayers = 0;
    for (const scout of scouts) {
      let player = playerMap.get(String(scout.atleta_id));
      if (!player && scout.apelido && scout.posicao_id) {
        const position = ({ 1: "GOL", 2: "LAT", 3: "ZAG", 4: "MEI", 5: "ATA", 6: "TEC" } as Record<number, string>)[scout.posicao_id];
        if (position) {
          // Historic athletes may have left the current market. Preserve their
          // official identity without inventing a current club, price or status.
          player = await upsertPlayer({
            externalSource: "cartola_api", externalId: String(scout.atleta_id),
            name: scout.apelido, nickname: scout.apelido, position, status: "Nulo",
          });
          playerMap.set(String(scout.atleta_id), player);
        }
      }
      if (!player) { missingPlayers++; continue; }

      // Official points are authoritative, including exactly zero and negatives.
      // Reconstructing from events loses bonus rules and must never repair history.
      const rawScouts = (scout.scout ?? {}) as Record<string, number | undefined>;
      const points = scout.pontos_num;
      if (points == null || !Number.isFinite(points)) throw new Error(`Pontuação oficial ausente: ${scout.atleta_id}`);

      await insertScoutRound({
        playerId: player.id,
        round,
        source: "historical_cartola",
        points,
        minutesPlayed: null,
        ...mapCartolaScoutToColumns(rawScouts),
      });
      inserted++;
    }

    // Live snapshots are never final evidence. Remove stale rows left behind
    // for players no longer present in the official completed-round response.
    await db.delete(playerScoutRoundTable).where(and(
      eq(playerScoutRoundTable.round, round), eq(playerScoutRoundTable.source, "cartola_api"),
    ));
    logger.info("Pontuações finais ressincronizadas", { round, upserted: inserted, missingPlayers, force: options.force ?? false });
    invalidateStatsCaches();
    return { upserted: inserted, missingPlayers };
  } catch (error) {
    logger.error("Historical scout sync failed", { round, error: String(error) });
    throw error;
  }
}
