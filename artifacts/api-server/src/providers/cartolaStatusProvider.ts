import axios from "axios";
import { z } from "zod";
import { db } from "@workspace/db";
import { dataCollectionLogTable, roundSnapshotTable } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import crypto from "crypto";

const BASE_URL = "https://api.cartola.globo.com";
const SOURCE = "cartola_status";

const STATUS_ID_MAP: Record<number, string> = {
  2: "Dúvida",
  3: "Suspenso",
  5: "Contundido",
  6: "Nulo",
  7: "Provável",
};

const PLAY_PROBABILITY_BY_STATUS: Record<number, number> = {
  2: 0.45,
  3: 0.02,
  5: 0.05,
  6: 0.0,
  7: 0.9,
};

const AtletaStatusSchema = z.object({
  atleta_id: z.number(),
  nome: z.string(),
  apelido: z.string().optional(),
  clube_id: z.number(),
  posicao_id: z.number(),
  status_id: z.number(),
  preco_num: z.number().optional(),
});

const MarketStatusSchema = z.object({
  atletas: z.array(AtletaStatusSchema),
});

export type PlayerStatusRecord = {
  externalId: string;
  name: string;
  nickname: string | null;
  clubExternalId: string;
  statusId: number;
  statusLabel: string;
  playProbability: number;
  isUnavailable: boolean;
};

export type CartolaStatusResult = {
  round: number;
  players: PlayerStatusRecord[];
  unavailableCount: number;
  doubtCount: number;
  suspendedCount: number;
  injuredCount: number;
  nullCount: number;
};

async function logCollection(status: string, message: string, metadata?: unknown) {
  try {
    await db.insert(dataCollectionLogTable).values({
      source: SOURCE,
      entityType: "player_status",
      status,
      message,
      metadataJson: metadata ?? null,
    });
  } catch {
    console.error("[cartolaStatusProvider] Failed to write collection log");
  }
}

async function saveSnapshot(round: number, payload: unknown) {
  const payloadStr = JSON.stringify(payload);
  const hash = crypto.createHash("sha256").update(payloadStr).digest("hex");
  await db.insert(roundSnapshotTable).values({
    round,
    source: SOURCE,
    payloadJson: payload as Record<string, unknown>,
    hash,
  });
}

async function getLastSnapshot(): Promise<CartolaStatusResult | null> {
  const snapshot = await db.query.roundSnapshotTable
    .findFirst({
      where: (t) => eq(t.source, SOURCE),
      orderBy: (t) => [desc(t.collectedAt)],
    })
    .catch(() => null);

  if (!snapshot) return null;

  const payload = snapshot.payloadJson as { result?: CartolaStatusResult };
  return payload.result ?? null;
}

function buildResult(round: number, atletas: z.infer<typeof AtletaStatusSchema>[]): CartolaStatusResult {
  const players: PlayerStatusRecord[] = atletas.map((a) => {
    const statusId = a.status_id;
    const statusLabel = STATUS_ID_MAP[statusId] ?? "Indefinido";
    const playProbability = PLAY_PROBABILITY_BY_STATUS[statusId] ?? 0.7;
    const isUnavailable = statusId === 3 || statusId === 5 || statusId === 6;

    return {
      externalId: String(a.atleta_id),
      name: a.nome,
      nickname: a.apelido ?? null,
      clubExternalId: String(a.clube_id),
      statusId,
      statusLabel,
      playProbability,
      isUnavailable,
    };
  });

  const unavailableCount = players.filter((p) => p.isUnavailable).length;
  const doubtCount = players.filter((p) => p.statusId === 2).length;
  const suspendedCount = players.filter((p) => p.statusId === 3).length;
  const injuredCount = players.filter((p) => p.statusId === 5).length;
  const nullCount = players.filter((p) => p.statusId === 6).length;

  return { round, players, unavailableCount, doubtCount, suspendedCount, injuredCount, nullCount };
}

export async function fetchPlayerStatuses(round: number): Promise<CartolaStatusResult> {
  try {
    const response = await axios.get(`${BASE_URL}/atletas/mercado`, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CartolaIntel/1.0)",
        Accept: "application/json",
      },
    });

    const parsed = MarketStatusSchema.safeParse(response.data);
    if (!parsed.success) {
      await logCollection("error", `Zod validation failed: ${parsed.error.message}`);
      throw new Error(`Status provider validation failed: ${parsed.error.message}`);
    }

    const result = buildResult(round, parsed.data.atletas);

    await saveSnapshot(round, { result, fetchedAt: new Date().toISOString() });
    await logCollection(
      "success",
      `Fetched status for ${result.players.length} players (${result.unavailableCount} unavailable: ${result.injuredCount} injured, ${result.suspendedCount} suspended, ${result.doubtCount} doubt, ${result.nullCount} null) for round ${round}`,
      {
        round,
        total: result.players.length,
        unavailable: result.unavailableCount,
        doubt: result.doubtCount,
        suspended: result.suspendedCount,
        injured: result.injuredCount,
        nulo: result.nullCount,
      }
    );

    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await logCollection("error", msg);

    const lastSnapshot = await getLastSnapshot();
    if (lastSnapshot) {
      await logCollection("degraded", `Using last valid snapshot after error: ${msg}`);
      return lastSnapshot;
    }

    throw error;
  }
}

export function getUnavailablePlayers(result: CartolaStatusResult): PlayerStatusRecord[] {
  return result.players.filter((p) => p.isUnavailable || p.statusId === 2);
}
