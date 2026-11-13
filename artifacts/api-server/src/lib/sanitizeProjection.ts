/**
 * Explicit public allowlist: new engine signals stay private until reviewed.
 * Never mutate the stored explanation (or another viewer's cached result).
 */
const FREE_EXPLANATION_FIELDS = new Set([
  "expectedPoints", "floorPoints", "ceilingPoints", "riskScore",
  "playProbability", "expectedMinutes", "position", "price",
  "averagePoints", "isHome", "gamesPlayed",
]);

export function sanitizeExplanationForPlan(explanation: unknown, isPro: boolean): Record<string, unknown> | null {
  if (!explanation || typeof explanation !== "object" || Array.isArray(explanation)) return null;
  const entries = Object.entries(explanation);
  return Object.fromEntries(isPro ? entries : entries.filter(([key, value]) =>
    FREE_EXPLANATION_FIELDS.has(key) && (value === null || ["number", "string", "boolean"].includes(typeof value)),
  ));
}

/** Remove raw popularity evidence as well as the computed explanation signals. */
export function sanitizePlayerForPlan<T extends object>(player: T, isPro: boolean): T {
  if (isPro) return { ...player };
  return Object.fromEntries(Object.entries(player).filter(([key]) => !key.toLowerCase().startsWith("popularity"))) as T;
}
