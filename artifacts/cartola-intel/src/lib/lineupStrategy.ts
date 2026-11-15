export const VALID_STRATEGIES = ["safe", "aggressive", "cost-benefit", "antimassa", "valorizacao"] as const;
export type ValidStrategy = (typeof VALID_STRATEGIES)[number];
export const PRO_STRATEGIES = new Set<ValidStrategy>(["aggressive", "cost-benefit", "antimassa", "valorizacao"]);

export function parseStrategy(value: string | null | undefined): ValidStrategy | null {
  return value && (VALID_STRATEGIES as readonly string[]).includes(value) ? value as ValidStrategy : null;
}

export function resolveInitialStrategy(urlStrategy: string | null, preference: string | undefined, isPro: boolean): ValidStrategy {
  const requested = parseStrategy(urlStrategy) ?? parseStrategy(preference) ?? "safe";
  return !isPro && PRO_STRATEGIES.has(requested) ? "safe" : requested;
}
