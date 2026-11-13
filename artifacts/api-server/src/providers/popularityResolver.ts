import { normalizePopularity } from "../lib/popularityRules";

/** Uma lista parcial só comprova ausência nas posições efetivamente cobertas. */
export function buildPopularityResolver(
  athletes: Array<{ atleta_id: number; posicao_id: number }>,
  counts: Map<string, number>,
  totalTeams: number | null,
) {
  const coveredPositions = new Set(athletes.filter((a) => counts.has(String(a.atleta_id))).map((a) => a.posicao_id));
  return (athlete: { atleta_id: number; posicao_id: number }) => {
    const raw = counts.get(String(athlete.atleta_id));
    const count = raw != null && Number.isSafeInteger(raw) && raw >= 0 ? raw : null;
    return {
      popularityCount: count,
      popularity: normalizePopularity(count, totalTeams),
      popularityListed: counts.has(String(athlete.atleta_id)) ? true : coveredPositions.has(athlete.posicao_id) ? false : null,
    };
  };
}
