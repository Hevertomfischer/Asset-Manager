import { db } from "@workspace/db";
import type { Player } from "@workspace/db/schema";
import type { GeProbablePlayer } from "../providers/geProbablesProvider";
import type { CartolaStatusResult, PlayerStatusRecord } from "../providers/cartolaStatusProvider";
import { upsertAvailability, getScoutsByPlayer } from "../repositories/projectionRepository";

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

function calculatePlayProbability(
  status: string | null,
  isProbable: boolean,
  cartolaStatusRecord: PlayerStatusRecord | null,
  playedLastRound: boolean | null
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
    base = 0.0;
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

    const effectiveStatus = cartolaStatusRecord?.statusLabel ?? player.status;
    const playProbability = calculatePlayProbability(effectiveStatus, isProbable, cartolaStatusRecord, player.playedLastRound ?? null);
    const expectedMinutes = calculateExpectedMinutes(playProbability, recentAvgMinutes);
    const riskScore = calculateRiskScore(playProbability, effectiveStatus);

    const probableStatus = isProbable ? PROBABLE_STATUS : (effectiveStatus ?? "Indefinido");
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
  const playProbability = calculatePlayProbability(effectiveStatus, isProbable, cartolaStatusRecord, player.playedLastRound ?? null);
  const expectedMinutes = calculateExpectedMinutes(playProbability, 75);
  const riskScore = calculateRiskScore(playProbability, effectiveStatus);
  return { playProbability, expectedMinutes, riskScore };
}
