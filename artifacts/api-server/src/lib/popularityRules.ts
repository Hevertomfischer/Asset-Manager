export * from "@workspace/popularity-rules";
import { isDifferential, isTrap, label, readPopularitySignals } from "@workspace/popularity-rules";

export function cleanPopularityExplanation(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const signals = readPopularitySignals(value);
  return { ...value, ...signals, isTrap: isTrap(signals), isDifferential: isDifferential(signals), popularityLabel: label(signals) };
}
