import { db } from "@workspace/db";
import { playersTable } from "@workspace/db/schema";
import type { Player } from "@workspace/db/schema";
import type { GeProbablePlayer } from "../providers/geProbablesProvider";
import { upsertAvailability, getScoutsByPlayer } from "../repositories/projectionRepository";

const PROBABLE_STATUS = "Provável";
const INJURY_STATUS = "Contundido";
const SUSPENSION_STATUS = "Suspenso";
const DOUBT_STATUS = "Dúvida";

function normalizePlayerName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function calculatePlayProbability(status: string | null, isProbable: boolean): number {
  if (status === INJURY_STATUS) return 0.05;
  if (status === SUSPENSION_STATUS) return 0.02;
  if (status === DOUBT_STATUS) return isProbable ? 0.6 : 0.3;
  if (isProbable) return 0.9;
  if (status === PROBABLE_STATUS) return 0.88;
  return 0.7;
}

function calculateExpectedMinutes(playProbability: number, recentAvgMinutes: number): number {
  const baseMinutes = recentAvgMinutes > 0 ? recentAvgMinutes : 75;
  return Math.round(playProbability * baseMinutes);
}

function calculateRiskScore(playProbability: number, status: string | null): number {
  let risk = 1.0 - playProbability;
  if (status === INJURY_STATUS) risk = Math.max(risk, 0.9);
  if (status === SUSPENSION_STATUS) risk = Math.max(risk, 0.95);
  if (status === DOUBT_STATUS) risk = Math.max(risk, 0.4);
  return Math.min(1, Math.max(0, risk));
}

export async function runAvailabilityEngine(
  round: number,
  probables: GeProbablePlayer[]
): Promise<void> {
  const players = await db.query.playersTable.findMany();
  const probableNamesMap = new Map<string, boolean>();

  for (const p of probables) {
    probableNamesMap.set(normalizePlayerName(p.name), p.probable);
  }

  for (const player of players) {
    const normalizedName = normalizePlayerName(player.nickname ?? player.name);
    const isProbable = probableNamesMap.get(normalizedName) ?? false;

    const recentScouts = await getScoutsByPlayer(player.id, 5);
    const recentAvgMinutes =
      recentScouts.length > 0
        ? recentScouts.reduce((sum, s) => sum + (s.minutesPlayed ?? 0), 0) / recentScouts.length
        : 0;

    const playProbability = calculatePlayProbability(player.status, isProbable);
    const expectedMinutes = calculateExpectedMinutes(playProbability, recentAvgMinutes);
    const riskScore = calculateRiskScore(playProbability, player.status);

    const probableStatus = isProbable ? PROBABLE_STATUS : (player.status ?? "Indefinido");
    const injuryStatus = player.status === INJURY_STATUS ? INJURY_STATUS : null;
    const suspensionStatus = player.status === SUSPENSION_STATUS ? SUSPENSION_STATUS : null;

    await upsertAvailability({
      playerId: player.id,
      round,
      source: "availability_engine",
      probableStatus,
      playProbability,
      expectedMinutes,
      injuryStatus,
      suspensionStatus,
      note: `Auto-calculated from status: ${player.status ?? "unknown"}, probable: ${isProbable}`,
    });
  }

  console.log(`[availabilityEngine] Processed ${players.length} players for round ${round}`);
}

export function getPlayerAvailabilitySync(
  player: Player,
  probableNamesMap: Map<string, boolean>
): { playProbability: number; expectedMinutes: number; riskScore: number } {
  const normalizedName = normalizePlayerName(player.nickname ?? player.name);
  const isProbable = probableNamesMap.get(normalizedName) ?? false;
  const playProbability = calculatePlayProbability(player.status, isProbable);
  const expectedMinutes = calculateExpectedMinutes(playProbability, 75);
  const riskScore = calculateRiskScore(playProbability, player.status);
  return { playProbability, expectedMinutes, riskScore };
}
