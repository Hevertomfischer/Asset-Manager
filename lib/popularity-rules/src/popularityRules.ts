/** Regras aprovadas em 13/11/2026. Valores de popularidade são frações, nunca contagens. */
export const POPULARITY_RULES = {
  differential: 0.15,
  trap: 0.60,
  trapRisk: 0.40,
  trapFormRatio: 0.70,
  highlightMinPoints: 5,
  highlightLimit: 5,
} as const;

export interface PopularitySignals {
  popularity?: number | null;
  /** false só quando a posição foi coberta pela lista da mesma rodada. */
  popularityListed?: boolean | null;
  expectedPoints?: number | null;
  riskScore?: number | null;
  shortAvg?: number | null;
  mediumAvg?: number | null;
}

export function knownPopularity(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

export function normalizePopularity(count: number | null | undefined, total: number | null | undefined): number | null {
  if (count == null || total == null || !Number.isFinite(count) || !Number.isFinite(total)
    || count < 0 || total <= 0 || count > total) return null;
  return count / total;
}

export function isTrap(signals: PopularitySignals): boolean {
  const popularity = knownPopularity(signals.popularity);
  return popularity !== null && popularity >= POPULARITY_RULES.trap
    && (signals.riskScore ?? 0) > POPULARITY_RULES.trapRisk
    && (signals.mediumAvg ?? 0) > 0
    && signals.shortAvg != null
    && signals.shortAvg < (signals.mediumAvg ?? 0) * POPULARITY_RULES.trapFormRatio;
}

export function isDifferential(signals: PopularitySignals): boolean {
  if (isTrap(signals)) return false;
  const popularity = knownPopularity(signals.popularity);
  return popularity !== null ? popularity < POPULARITY_RULES.differential : signals.popularityListed === false;
}

export function isDifferentialHighlight(signals: PopularitySignals): boolean {
  return isDifferential(signals) && (signals.expectedPoints ?? 0) >= POPULARITY_RULES.highlightMinPoints;
}

/** JSONs antigos misturavam contagem/percentual e defaults: não são evidência válida. */
export function readPopularitySignals(value: unknown): PopularitySignals {
  const signals = (value && typeof value === "object" ? value : {}) as PopularitySignals & { popularityVersion?: number };
  return {
    ...signals,
    popularity: signals.popularityVersion === 2 ? knownPopularity(signals.popularity) : null,
    popularityListed: signals.popularityVersion === 2 ? signals.popularityListed ?? null : null,
  };
}

/** Nunca substitui desconhecido por 0%, 50% ou outro percentual estimado. */
export function label(signals: PopularitySignals): string {
  const popularity = knownPopularity(signals.popularity);
  if (popularity !== null) return `${(popularity * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% de escalação`;
  return signals.popularityListed === false ? "Fora dos mais escalados" : "Popularidade indisponível";
}
