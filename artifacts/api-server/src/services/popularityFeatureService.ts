import { db } from "@workspace/db";
import { adminConfigTable } from "@workspace/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("popularity-features");
const CONFIG_KEY = "popularityFeatures";
export const POPULARITY_MIN_COVERAGE = 20;
export const POPULARITY_MAX_AGE_HOURS = 24;
export const POPULARITY_CALIBRATION_MESSAGE = "A estratégia Antimassa está em calibração. Precisamos de uma coleta de popularidade com pelo menos 20 jogadores nas últimas 24 horas. Escolha outra estratégia.";

export interface PopularityCollectionHealth {
  lastCollectionAt: string | null;
  lastSuccessfulCollectionAt: string | null;
  coverage: number;
  collectionSucceeded: boolean;
}
export type PopularityFeatureReason = "ready" | "no_data" | "source_error" | "stale" | "insufficient_coverage" | "forced_failure" | "unavailable";

/** Simulação operacional: não lê nem precisa de credenciais da fonte. */
export function isPopularityFailureForced(): boolean {
  return ["1", "true"].includes(process.env.POPULARITY_FORCE_FAILURE ?? "");
}

export function evaluatePopularityFeatures(health: PopularityCollectionHealth, now = Date.now()) {
  const coverage = Number.isSafeInteger(health.coverage) && health.coverage >= 0 ? health.coverage : 0;
  const lastSuccess = health.lastSuccessfulCollectionAt ? Date.parse(health.lastSuccessfulCollectionAt) : NaN;
  let reason: PopularityFeatureReason = "ready";
  if (isPopularityFailureForced()) reason = "forced_failure";
  else if (!Number.isFinite(lastSuccess)) reason = "no_data";
  else if (health.collectionSucceeded !== true) reason = "source_error";
  else if (now - lastSuccess > POPULARITY_MAX_AGE_HOURS * 3600000 || lastSuccess > now) reason = "stale";
  else if (coverage < POPULARITY_MIN_COVERAGE) reason = "insufficient_coverage";
  return {
    popularityFeaturesEnabled: reason === "ready",
    lastCollectionAt: health.lastCollectionAt ?? null,
    lastSuccessfulCollectionAt: health.lastSuccessfulCollectionAt ?? null,
    coverage,
    minimumCoverage: POPULARITY_MIN_COVERAGE,
    maxAgeHours: POPULARITY_MAX_AGE_HOURS,
    reason,
  };
}

async function readCollectionHealth(): Promise<PopularityCollectionHealth> {
  const [snapshot, attempt] = await Promise.all([
    db.query.roundSnapshotTable.findFirst({
      where: (t) => eq(t.source, "gato_mestre_popularity"),
      orderBy: (t) => [desc(t.collectedAt)],
    }),
    db.query.dataCollectionLogTable.findFirst({
      where: (t) => and(eq(t.source, "gato_mestre"), inArray(t.status, ["success", "error", "degraded"])),
      orderBy: (t) => [desc(t.collectedAt)],
    }),
  ]);
  const payload = snapshot?.payloadJson;
  const coverage = payload && typeof payload === "object" && !Array.isArray(payload)
    ? Object.values(payload).filter((count) => Number.isSafeInteger(count) && Number(count) >= 0).length : 0;
  return {
    lastCollectionAt: attempt?.collectedAt.toISOString() ?? snapshot?.collectedAt.toISOString() ?? null,
    lastSuccessfulCollectionAt: snapshot?.collectedAt.toISOString() ?? null,
    coverage,
    collectionSucceeded: !!snapshot && attempt?.status === "success",
  };
}

export async function refreshPopularityFeatures() {
  const health = await readCollectionHealth();
  await db.insert(adminConfigTable).values({ key: CONFIG_KEY, value: JSON.stringify(health) })
    .onConflictDoUpdate({ target: adminConfigTable.key, set: { value: JSON.stringify(health), updatedAt: new Date() } });
  const status = evaluatePopularityFeatures(health);
  log.info("Popularidade reavaliada", { enabled: status.popularityFeaturesEnabled, coverage: status.coverage, reason: status.reason });
  return status;
}

export async function getPopularityFeatureStatus() {
  try {
    // O ETL persiste a avaliação, mas uma leitura nunca ignora uma falha posterior
    // da fonte nem prolonga uma chave true depois das 24 horas.
    const health = await readCollectionHealth();
    return evaluatePopularityFeatures(health);
  } catch (error) {
    log.warn("Popularidade indisponível; recursos bloqueados", { error: error instanceof Error ? error.message : String(error) });
    return { ...evaluatePopularityFeatures({ lastCollectionAt: null, lastSuccessfulCollectionAt: null, coverage: 0, collectionSucceeded: false }), reason: "unavailable" as PopularityFeatureReason };
  }
}
