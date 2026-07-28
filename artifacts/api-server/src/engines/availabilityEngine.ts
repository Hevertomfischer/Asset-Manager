import { db } from "@workspace/db";
import { matchesTable } from "@workspace/db/schema";
import type { Player } from "@workspace/db/schema";
import type { GeProbablePlayer } from "../providers/geProbablesProvider";
import type { CartolaStatusResult, PlayerStatusRecord } from "../providers/cartolaStatusProvider";
import { upsertAvailability, getScoutsByPlayer } from "../repositories/projectionRepository";
import { eq, and } from "drizzle-orm";

const PROBABLE_STATUS = "Provável";
const INJURY_STATUS = "Contundido";
const SUSPENSION_STATUS = "Suspenso";
const DOUBT_STATUS = "Dúvida";
const NULL_STATUS = "Nulo";

function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const PLAYED_LAST_ROUND_PENALTY = 0.10;

/**
 * Apply price-variation as a play-probability signal.
 *
 * Cartola FC market prices reflect player performance and availability:
 *   - Big price drop (≤-5 C$) → player very likely DNP or had a very poor game
 *   - Significant drop (≤-3 C$) → strong signal of underperformance / rotation
 *   - Moderate drop (≤-1.5 C$) → below-average last round
 *   - Big price rise (≥+3 C$) → player performed well, likely started
 *
 * This signal is independent from status/injury data and captures real-time
 * market information that correlates with actual availability.
 */
function applyPriceVariationSignal(base: number, priceVariation: number | null): number {
  if (priceVariation == null || priceVariation === 0) return base;

  if (priceVariation <= -5.0) return base * 0.55; // major drop: very likely DNP/injured
  if (priceVariation <= -3.0) return base * 0.72; // significant: likely poor performance/rotation
  if (priceVariation <= -1.5) return base * 0.87; // moderate: below average last round

  // Upward price signal: player performed well → more likely to start next round
  if (priceVariation >= 5.0) return Math.min(1.0, base * 1.10);
  if (priceVariation >= 3.0) return Math.min(1.0, base * 1.05);

  return base;
}

function calculatePlayProbability(
  status: string | null,
  isProbable: boolean,
  cartolaStatusRecord: PlayerStatusRecord | null,
  playedLastRound: boolean | null,
  priceVariation: number | null = null
): number {
  let base: number;

  if (cartolaStatusRecord !== null) {
    const p = cartolaStatusRecord.playProbability;
    base = cartolaStatusRecord.statusId === 2 && isProbable ? Math.max(p, 0.55) : p;
  } else if (status === INJURY_STATUS) {
    base = 0.05;
  } else if (status === SUSPENSION_STATUS) {
    base = 0.02;
  } else if (status === NULL_STATUS) {
    base = 0.5;
  } else if (status === DOUBT_STATUS) {
    base = isProbable ? 0.6 : 0.3;
  } else if (isProbable) {
    base = 0.9;
  } else if (status === PROBABLE_STATUS) {
    base = 0.88;
  } else {
    base = 0.7;
  }

  // Apply a confidence penalty only to players explicitly listed as Provável (or confirmed probable
  // by the GE feed) who sat out last round. This captures rotation/rest risk.
  const isProvavel = status === PROBABLE_STATUS || isProbable;
  if (isProvavel && playedLastRound === false) {
    base = Math.max(0, base - PLAYED_LAST_ROUND_PENALTY);
  }

  // Apply price-variation as a market signal for availability.
  // Only apply when there's no hard status override (injured/suspended already have low base).
  const hasHardStatus = status === INJURY_STATUS || status === SUSPENSION_STATUS || status === NULL_STATUS;
  if (!hasHardStatus) {
    base = applyPriceVariationSignal(base, priceVariation);
  }

  return base;
}

function calculateExpectedMinutes(playProbability: number, recentAvgMinutes: number): number {
  const baseMinutes = recentAvgMinutes > 0 ? recentAvgMinutes : 75;
  return Math.round(playProbability * baseMinutes);
}

function calculateRiskScore(playProbability: number, status: string | null): number {
  let risk = 1.0 - playProbability;
  if (status === INJURY_STATUS) risk = Math.max(risk, 0.9);
  if (status === SUSPENSION_STATUS) risk = Math.max(risk, 0.95);
  if (status === NULL_STATUS) risk = 1.0;
  if (status === DOUBT_STATUS) risk = Math.max(risk, 0.4);
  return Math.min(1, Math.max(0, risk));
}

export async function runAvailabilityEngine(
  round: number,
  probables: GeProbablePlayer[],
  cartolaStatus?: CartolaStatusResult
): Promise<void> {
  const players = await db.query.playersTable.findMany();

  // Build a set of club IDs with a valid (non-postponed) match this round.
  const validMatches = await db
    .select({ homeClubId: matchesTable.homeClubId, awayClubId: matchesTable.awayClubId })
    .from(matchesTable)
    .where(and(eq(matchesTable.round, round), eq(matchesTable.valid, true)));
  const validMatchClubIds = new Set<number>();
  for (const m of validMatches) {
    if (m.homeClubId) validMatchClubIds.add(m.homeClubId);
    if (m.awayClubId) validMatchClubIds.add(m.awayClubId);
  }

  const probableNamesMap = new Map<string, boolean>();

  for (const p of probables) {
    probableNamesMap.set(normalizePlayerName(p.name), p.probable);
  }

  const cartolaStatusMap = new Map<string, PlayerStatusRecord>();
  if (cartolaStatus) {
    for (const sr of cartolaStatus.players) {
      cartolaStatusMap.set(sr.externalId, sr);
    }
  }

  for (const player of players) {
    const normalizedName = normalizePlayerName(player.nickname ?? player.name);
    const isProbable = probableNamesMap.get(normalizedName) ?? false;

    const cartolaStatusRecord = player.externalId
      ? (cartolaStatusMap.get(player.externalId) ?? null)
      : null;

    const recentScouts = await getScoutsByPlayer(player.id, 5);
    const recentAvgMinutes =
      recentScouts.length > 0
        ? recentScouts.reduce((sum, s) => sum + (s.minutesPlayed ?? 0), 0) / recentScouts.length
        : 0;

    // Players from clubs with a postponed/invalid match cannot score this round.
    const hasNoValidMatch =
      player.clubId != null &&
      validMatchClubIds.size > 0 &&
      !validMatchClubIds.has(player.clubId);

    const effectiveStatus = cartolaStatusRecord?.statusLabel ?? player.status;
    const rawPlayProbability = calculatePlayProbability(effectiveStatus, isProbable, cartolaStatusRecord, player.playedLastRound ?? null, player.priceVariation ?? null);
    const playProbability = hasNoValidMatch ? 0 : rawPlayProbability;
    const expectedMinutes = calculateExpectedMinutes(playProbability, recentAvgMinutes);
    const riskScore = calculateRiskScore(playProbability, effectiveStatus);

    // Hard statuses from Cartola API take absolute priority over the probables feed.
    // A suspended, injured, or null player cannot be labelled "Provável".
    const hasHardStatus = effectiveStatus === SUSPENSION_STATUS
      || effectiveStatus === INJURY_STATUS
      || effectiveStatus === NULL_STATUS;
    const probableStatus = (!hasHardStatus && isProbable) ? PROBABLE_STATUS : (effectiveStatus ?? "Indefinido");
    const injuryStatus = effectiveStatus === INJURY_STATUS ? INJURY_STATUS : null;
    const suspensionStatus = effectiveStatus === SUSPENSION_STATUS ? SUSPENSION_STATUS : null;

    const statusSource = cartolaStatusRecord
      ? `cartola_status (id=${cartolaStatusRecord.statusId})`
      : `db_status`;

    await upsertAvailability({
      playerId: player.id,
      round,
      source: "availability_engine",
      probableStatus,
      playProbability,
      expectedMinutes,
      riskScore,
      injuryStatus,
      suspensionStatus,
      note: `status=${effectiveStatus ?? "unknown"} [${statusSource}], probable=${isProbable}`,
    });
  }

  const withCartolaStatus = players.filter((p) => p.externalId && cartolaStatusMap.has(p.externalId)).length;
  console.log(
    `[availabilityEngine] Processed ${players.length} players for round ${round}` +
      (cartolaStatus ? ` (${withCartolaStatus} enriched with cartola status data)` : "")
  );
}

export function getPlayerAvailabilitySync(
  player: Player,
  probableNamesMap: Map<string, boolean>,
  cartolaStatusMap?: Map<string, PlayerStatusRecord>
): { playProbability: number; expectedMinutes: number; riskScore: number } {
  const normalizedName = normalizePlayerName(player.nickname ?? player.name);
  const isProbable = probableNamesMap.get(normalizedName) ?? false;
  const cartolaStatusRecord = player.externalId && cartolaStatusMap
    ? (cartolaStatusMap.get(player.externalId) ?? null)
    : null;
  const effectiveStatus = cartolaStatusRecord?.statusLabel ?? player.status;
  const playProbability = calculatePlayProbability(effectiveStatus, isProbable, cartolaStatusRecord, player.playedLastRound ?? null, player.priceVariation ?? null);
  const expectedMinutes = calculateExpectedMinutes(playProbability, 75);
  const riskScore = calculateRiskScore(playProbability, effectiveStatus);
  return { playProbability, expectedMinutes, riskScore };
}
