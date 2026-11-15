/**
 * Gato Mestre / Cartola popularity provider
 *
 * Primary source: public Gato Mestre API — no authentication required.
 * URL: https://api.gatomestre.globo.com/api/v2/mais-escalados/temporada/{year}/rodadas/{round}
 * Returns the "mais escalados" selection (12 starters + reserves) with per-player
 * `escalacoes` counts. Grows as the round progresses; returns all positions for
 * completed rounds.
 *
 * Somente fonte pública e cache: fallbacks autenticados removidos por aprovação do produto.
 *
 * Results are cached in the round_snapshot table for 2 hours.
 */

import axios from "axios";
import crypto from "crypto";
import { db } from "@workspace/db";
import { roundSnapshotTable, dataCollectionLogTable } from "@workspace/db/schema";
import { desc, eq, and, gt } from "drizzle-orm";
import { createLogger } from "../lib/logger";
import { isPopularityFailureForced } from "../services/popularityFeatureService";
const logger = createLogger("gato-mestre");

const GATO_MESTRE_BASE = "https://api.gatomestre.globo.com";
const SNAPSHOT_SOURCE = "gato_mestre_popularity";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

async function log(status: string, message: string) {
  if (status === "error" || status === "degraded") logger.warn(message);
  else logger.info(message);
  try {
    await db.insert(dataCollectionLogTable).values({
      source: "gato_mestre",
      entityType: "popularity",
      status,
      message,
    });
  } catch {
    // non-critical
  }
}

type GatoMestrePlayer = {
  Atleta?: { atleta_id?: number };
  escalacoes?: number;
};

type GatoMestreResponse = {
  selecao?: GatoMestrePlayer[];
  reservas?: GatoMestrePlayer[];
  capitaes?: GatoMestrePlayer[];
  banco_de_reservas?: GatoMestrePlayer[];
};

/**
 * PRIMARY SOURCE — no authentication required.
 * Calls the public Gato Mestre mais-escalados API directly.
 * Returns the optimal "mais escalados" lineup for the round with escalation counts.
 * For ongoing rounds, returns players added so far (grows throughout the week).
 * For completed rounds, returns the full 12-player selection + reserves.
 */
async function fetchFromPublicPage(round: number): Promise<Record<string, number>> {
  const year = new Date().getFullYear();
  const url = `${GATO_MESTRE_BASE}/api/v2/mais-escalados/temporada/${year}/rodadas/${round}`;

  const res = await axios.get<GatoMestreResponse>(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json",
      "Accept-Encoding": "gzip",
      "Origin": "https://gatomestre.ge.globo.com",
      "Referer": "https://gatomestre.ge.globo.com/mais-escalados-do-cartola/",
    },
    timeout: 12000,
    validateStatus: (s) => s < 500,
  });

  if (res.status !== 200) {
    throw new Error(`Public mais-escalados API returned HTTP ${res.status} for round ${round}`);
  }

  const data = res.data;
  // Votos de capitão e presença no banco não são contagens de titularidade.
  // Não misturar esses universos nem sobrescrever a seleção principal.
  const allPlayers: GatoMestrePlayer[] = [
    ...(data.selecao ?? []),
  ];

  const popularity: Record<string, number> = {};
  for (const player of allPlayers) {
    const id = player.Atleta?.atleta_id;
    const count = player.escalacoes;
    if (id != null && count != null && Number.isSafeInteger(count) && count >= 0) {
      popularity[String(id)] = count;
    }
  }

  return popularity;
}

async function loadFromCache(round: number): Promise<Record<string, number> | null> {
  const twoHoursAgo = new Date(Date.now() - CACHE_TTL_MS);
  const snapshot = await db.query.roundSnapshotTable
    .findFirst({
      where: (t) =>
        and(eq(t.source, SNAPSHOT_SOURCE), eq(t.round, round), gt(t.collectedAt, twoHoursAgo)),
      orderBy: (t) => [desc(t.collectedAt)],
    })
    .catch(() => null);

  if (!snapshot) return null;
  return snapshot.payloadJson as Record<string, number>;
}

async function loadStaleCache(round: number): Promise<Record<string, number> | null> {
  const snapshot = await db.query.roundSnapshotTable
    .findFirst({
      where: (t) => and(eq(t.source, SNAPSHOT_SOURCE), eq(t.round, round)),
      orderBy: (t) => [desc(t.collectedAt)],
    })
    .catch(() => null);

  if (!snapshot) return null;
  return snapshot.payloadJson as Record<string, number>;
}

async function saveToCache(round: number, popularity: Record<string, number>) {
  const payloadStr = JSON.stringify(popularity);
  const hash = crypto.createHash("sha256").update(payloadStr).digest("hex");
  await db.insert(roundSnapshotTable).values({
    round,
    source: SNAPSHOT_SOURCE,
    payloadJson: popularity as unknown as Record<string, unknown>,
    hash,
  });
}

/**
 * Returns a Map<atleta_id_string, times_escalados> for the given round.
 *
 * Source priority:
 *   1. DB cache (2-hour TTL)
 *   2. Public mais-escalados API (no auth needed) — primary
 *   3. Stale DB cache (mesma rodada)
 */
export async function fetchPopularityMap(round: number): Promise<Map<string, number>> {
  if (isPopularityFailureForced()) {
    await log("degraded", "Popularity source failure simulated with POPULARITY_FORCE_FAILURE");
    return new Map();
  }
  // 1. Try fresh cache
  const cached = await loadFromCache(round);
  if (cached && Object.keys(cached).length > 0) {
    await log("info", `Popularity cache HIT: ${Object.keys(cached).length} players, round ${round}`);
    return new Map(Object.entries(cached));
  }

  // 2. Try sources in priority order
  const sources: Array<[string, () => Promise<Record<string, number>>]> = [
    ["public_api", () => fetchFromPublicPage(round)],
  ];

  for (const [name, fetchFn] of sources) {
    try {
      const popularity = await fetchFn();
      const count = Object.keys(popularity).length;

      if (count > 0) {
        await saveToCache(round, popularity);
        await log("success", `Popularity from ${name}: ${count} players cached for round ${round}`);
        return new Map(Object.entries(popularity));
      }

      await log("degraded", `${name} returned 0 entries — trying next source`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await log("error", `${name} failed: ${msg}`);
    }
  }

  // 3. Fallback to stale cache
  const stale = await loadStaleCache(round);
  if (stale && Object.keys(stale).length > 0) {
    await log("degraded", `Using stale popularity cache for round ${round} (${Object.keys(stale).length} players)`);
    return new Map(Object.entries(stale));
  }

  await log("degraded", `No popularity data available for round ${round}`);
  return new Map();
}
