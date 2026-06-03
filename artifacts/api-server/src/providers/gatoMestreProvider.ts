import axios from "axios";
import { z } from "zod";
import { db } from "@workspace/db";
import { dataCollectionLogTable, roundSnapshotTable } from "@workspace/db/schema";
import { createLogger } from "../lib/logger";
import crypto from "crypto";

const log = createLogger("gato-mestre");

const GATO_BASE = "https://www.gatomestre.com.br";

/**
 * Circuit-breaker: cache failures for 30 minutes to avoid hammering a dead
 * endpoint and flooding data_collection_log with repetitive error rows.
 */
let failureCache: { until: number; message: string } | null = null;
const FAILURE_CACHE_MS = 30 * 60 * 1000; // 30 min

const GatoPlayerStatSchema = z.object({
  player_id: z.string().or(z.number()).transform(String),
  player_name: z.string(),
  club_id: z.string().or(z.number()).optional().transform((v) => (v != null ? String(v) : undefined)),
  position: z.string().optional(),
  avg_points: z.number().optional(),
  std_dev: z.number().optional(),
  last_5_avg: z.number().optional(),
  home_avg: z.number().optional(),
  away_avg: z.number().optional(),
  price: z.number().optional(),
  value_ratio: z.number().optional(),
});

export type GatoPlayerStat = z.infer<typeof GatoPlayerStatSchema>;

async function logCollection(status: string, message: string) {
  try {
    await db.insert(dataCollectionLogTable).values({
      source: "gato_mestre",
      entityType: "stats",
      status,
      message,
    });
  } catch (err) {
    log.error("Failed to write collection log", { error: err instanceof Error ? err.message : String(err) });
  }
}

export async function fetchPlayerStats(round: number): Promise<GatoPlayerStat[]> {
  const source = "gato_mestre";

  // ── Circuit breaker: skip the network call if we recently failed ─────────
  if (failureCache && Date.now() < failureCache.until) {
    log.debug("GatoMestre circuit-breaker active — using snapshot fallback", {
      retryAfter: new Date(failureCache.until).toISOString(),
    });
    return getLastSnapshot(source);
  }

  try {
    const response = await axios.get(`${GATO_BASE}/estatisticas`, {
      timeout: 10000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CartolaIntel/1.0)",
        Accept: "application/json, text/html",
      },
    });

    // Reset circuit breaker on success
    failureCache = null;

    let rawData: unknown[] = [];

    if (Array.isArray(response.data)) {
      rawData = response.data as unknown[];
    } else if (response.data && typeof response.data === "object" && "atletas" in response.data) {
      rawData = (response.data as { atletas: unknown[] }).atletas;
    } else if (response.data && typeof response.data === "object" && "players" in response.data) {
      rawData = (response.data as { players: unknown[] }).players;
    }

    const stats: GatoPlayerStat[] = [];
    for (const item of rawData) {
      const parsed = GatoPlayerStatSchema.safeParse(item);
      if (parsed.success) {
        stats.push(parsed.data);
      }
    }

    const payloadStr = JSON.stringify(stats);
    const hash = crypto.createHash("sha256").update(payloadStr).digest("hex");

    await db.insert(roundSnapshotTable).values({
      round,
      source,
      payloadJson: { stats },
      hash,
    });

    await logCollection("success", `GatoMestre: fetched ${stats.length} player stats for round ${round}`);
    log.info(`Fetched ${stats.length} player stats for round ${round}`);
    return stats;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    // Arm the circuit breaker so we don't log 95+ identical errors per day
    failureCache = { until: Date.now() + FAILURE_CACHE_MS, message: msg };

    await logCollection("error", `GatoMestre failed: ${msg}`);
    log.warn("GatoMestre unreachable — will use snapshot fallback for 30 min", { error: msg });

    return getLastSnapshot(source);
  }
}

async function getLastSnapshot(source: string): Promise<GatoPlayerStat[]> {
  const lastSnapshot = await db.query.roundSnapshotTable
    .findFirst({
      where: (t, { eq }) => eq(t.source, source),
      orderBy: (t, { desc }) => [desc(t.collectedAt)],
    })
    .catch(() => null);

  if (lastSnapshot) {
    await logCollection("degraded", `Using last valid GatoMestre snapshot from ${lastSnapshot.collectedAt.toISOString()}`);
    const payload = lastSnapshot.payloadJson as { stats?: GatoPlayerStat[] };
    return payload?.stats ?? [];
  }

  return [];
}
