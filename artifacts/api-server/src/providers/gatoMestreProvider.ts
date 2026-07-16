/**
 * Gato Mestre / Cartola popularity provider
 *
 * Fetches per-player "times_escalados" data using a Globo session cookie (GLBID).
 * Results are cached in the round_snapshot table for 2 hours to protect API limits.
 *
 * Setup: set the GLOBO_GLBID environment variable to a valid GLBID cookie value.
 * How to obtain it:
 *   1. Log in to cartola.globo.com in your browser.
 *   2. Open DevTools → Application → Cookies → cartola.globo.com
 *   3. Copy the value of the "GLBID" cookie.
 *   4. Add it as the GLOBO_GLBID secret in the Replit project.
 * The cookie is typically valid for weeks; renew when requests start returning 401/403.
 */

import axios from "axios";
import crypto from "crypto";
import { db } from "@workspace/db";
import { roundSnapshotTable, dataCollectionLogTable } from "@workspace/db/schema";
import { desc, eq, and, gt } from "drizzle-orm";

const GATO_MESTRE_BASE = "https://api.gatomestre.globo.com";
const CARTOLA_BASE = "https://api.cartola.globo.com";
const SNAPSHOT_SOURCE = "gato_mestre_popularity";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

async function log(status: string, message: string) {
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

function buildAuthHeaders(): Record<string, string> {
  const glbId = process.env.GLOBO_GLBID ?? "";
  return {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
    "Origin": "https://gatomestre.ge.globo.com",
    "Referer": "https://gatomestre.ge.globo.com/",
    ...(glbId ? { "Cookie": `GLBID=${glbId}` } : {}),
  };
}

/**
 * Tries the Gato Mestre mais-escalados API.
 * Returns a map of atleta_id → times_escalados on success.
 */
async function fetchFromGatoMestre(round: number): Promise<Record<string, number>> {
  const year = new Date().getFullYear();
  const res = await axios.get(
    `${GATO_MESTRE_BASE}/api/v2/mais-escalados/temporada/${year}`,
    {
      headers: buildAuthHeaders(),
      timeout: 12000,
      validateStatus: (s) => s < 500,
    }
  );

  if (res.status === 401 || res.status === 403) {
    throw new Error(`GLBID cookie rejected (HTTP ${res.status}) — please renew GLOBO_GLBID`);
  }
  if (res.status !== 200) {
    throw new Error(`Gato Mestre API returned HTTP ${res.status}`);
  }

  const data = res.data;
  await log(
    "info",
    `GM raw keys=${JSON.stringify(Object.keys(data ?? {})).slice(0, 120)}, preview=${JSON.stringify(data).slice(0, 300)}`
  );

  return parsePopularityResponse(data);
}

/**
 * Tries the Cartola /mercado/selecao API (also requires GLBID for full data).
 * This endpoint returns the "selecao do mercado" — the most-picked lineup.
 */
async function fetchFromCartolaSelecao(): Promise<Record<string, number>> {
  const res = await axios.get(`${CARTOLA_BASE}/mercado/selecao`, {
    headers: {
      ...buildAuthHeaders(),
      "User-Agent": "application/postscript",
    },
    timeout: 12000,
    validateStatus: (s) => s < 500,
  });

  if (res.status !== 200) {
    throw new Error(`Cartola /mercado/selecao returned HTTP ${res.status}`);
  }

  const data = res.data;
  await log(
    "info",
    `Cartola selecao raw: ${JSON.stringify(data).slice(0, 400)}`
  );

  return parsePopularityResponse(data);
}

/**
 * Parses various response shapes into atleta_id → times_escalados map.
 */
function parsePopularityResponse(data: unknown): Record<string, number> {
  const popularity: Record<string, number> = {};

  if (!data || typeof data !== "object") return popularity;

  // Shape A: array of atleta objects
  const candidates: Array<Record<string, unknown>> = Array.isArray(data)
    ? (data as Array<Record<string, unknown>>)
    : Array.isArray((data as Record<string, unknown>).atletas)
      ? ((data as Record<string, unknown>).atletas as Array<Record<string, unknown>>)
      : Array.isArray((data as Record<string, unknown>).jogadores)
        ? ((data as Record<string, unknown>).jogadores as Array<Record<string, unknown>>)
        : Array.isArray((data as Record<string, unknown>).players)
          ? ((data as Record<string, unknown>).players as Array<Record<string, unknown>>)
          : [];

  for (const a of candidates) {
    const id = a.atleta_id ?? a.id ?? a.atletaId;
    const count =
      a.times_escalados ?? a.escalacoes ?? a.count ?? a.total ?? a.timesEscalados;
    if (id != null && count != null) {
      popularity[String(id)] = Number(count);
    }
  }

  // Shape B: keyed object { "atleta_id": N } or { "atleta_id": { times_escalados: N } }
  if (Object.keys(popularity).length === 0) {
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (!/^\d+$/.test(key)) continue;
      if (typeof value === "number") {
        popularity[key] = value;
      } else if (typeof value === "object" && value !== null) {
        const v = value as Record<string, unknown>;
        const count = v.times_escalados ?? v.escalacoes ?? v.count ?? v.total;
        if (count != null) popularity[key] = Number(count);
      }
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
 * Uses a 2-hour DB cache. Falls back to stale cache on error.
 * Requires GLOBO_GLBID env var to be set with a valid Globo session cookie.
 */
export async function fetchPopularityMap(round: number): Promise<Map<string, number>> {
  const glbId = process.env.GLOBO_GLBID;

  if (!glbId) {
    // No GLBID configured — check for stale cache before giving up
    const stale = await loadStaleCache(round);
    if (stale && Object.keys(stale).length > 0) {
      await log("degraded", `No GLOBO_GLBID set — using stale cache for round ${round}`);
      return new Map(Object.entries(stale));
    }
    await log(
      "degraded",
      "GLOBO_GLBID env var not set. Set it to enable per-player popularity. " +
        "Get it from: cartola.globo.com → DevTools → Application → Cookies → GLBID"
    );
    return new Map();
  }

  // 1. Try fresh cache
  const cached = await loadFromCache(round);
  if (cached && Object.keys(cached).length > 0) {
    await log("info", `Popularity cache HIT: ${Object.keys(cached).length} players, round ${round}`);
    return new Map(Object.entries(cached));
  }

  // 2. Fetch from APIs (try Gato Mestre first, then Cartola selecao)
  const sources: Array<[string, () => Promise<Record<string, number>>]> = [
    ["gato_mestre", () => fetchFromGatoMestre(round)],
    ["cartola_selecao", () => fetchFromCartolaSelecao()],
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

      await log("degraded", `${name} returned 0 popularity entries — trying next source`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await log("error", `${name} failed: ${msg}`);
    }
  }

  // 3. Fallback to stale cache
  const stale = await loadStaleCache(round);
  if (stale && Object.keys(stale).length > 0) {
    await log("degraded", `Using stale popularity cache for round ${round}`);
    return new Map(Object.entries(stale));
  }

  return new Map();
}
