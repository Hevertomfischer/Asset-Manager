import { describe, expect, it } from "vitest";
import { cleanPopularityExplanation, isDifferential, isDifferentialHighlight, isTrap, label, normalizePopularity, readPopularitySignals } from "../lib/popularityRules";
import { buildPopularityResolver } from "../providers/popularityResolver";

describe("popularidade conhecida, desconhecida e listas parciais", () => {
  it("converte contagens em fração usando o total da mesma rodada", () => {
    expect(normalizePopularity(112081, 173498)).toBeCloseTo(0.6460074468);
    expect(normalizePopularity(0, 173498)).toBe(0);
  });
  it.each([[null, 100], [10, null], [10, 0], [101, 100], [-1, 100], [NaN, 100], [10, Infinity]])(
    "não inventa percentual para count=%s total=%s", (count, total) => {
      expect(normalizePopularity(count, total)).toBeNull();
    },
  );
  it("distingue fora da lista, posição não coberta e percentual conhecido", () => {
    const athletes = [{ atleta_id: 1, posicao_id: 5 }, { atleta_id: 2, posicao_id: 5 }, { atleta_id: 3, posicao_id: 1 }];
    const resolve = buildPopularityResolver(athletes, new Map([["1", 70]]), 100);
    expect(resolve(athletes[0]!)).toEqual({ popularity: 0.7, popularityCount: 70, popularityListed: true });
    expect(resolve(athletes[1]!)).toEqual({ popularity: null, popularityCount: null, popularityListed: false });
    expect(resolve(athletes[2]!)).toEqual({ popularity: null, popularityCount: null, popularityListed: null });
    expect(isDifferential(resolve(athletes[1]!))).toBe(true);
    expect(isDifferential(resolve(athletes[2]!))).toBe(false);
  });
  it("sem denominador mantém contagem, mas não produz percentual nem armadilha", () => {
    const resolve = buildPopularityResolver([{ atleta_id: 1, posicao_id: 5 }], new Map([["1", 70]]), null);
    expect(resolve({ atleta_id: 1, posicao_id: 5 })).toMatchObject({ popularityCount: 70, popularity: null });
    expect(isTrap({ ...resolve({ atleta_id: 1, posicao_id: 5 }), riskScore: 0.9, shortAvg: 1, mediumAvg: 5 })).toBe(false);
  });
  it("sem fonte não presume ausência da lista", () => {
    expect(buildPopularityResolver([{ atleta_id: 1, posicao_id: 5 }], new Map(), 100)({ atleta_id: 1, posicao_id: 5 }))
      .toEqual({ popularity: null, popularityCount: null, popularityListed: null });
  });
  it("limiares aprovados são exclusivos em 15% e inclusivos em 60%", () => {
    expect(isDifferential({ popularity: 0.149 })).toBe(true);
    expect(isDifferential({ popularity: 0.15 })).toBe(false);
    const form = { riskScore: 0.401, shortAvg: 3, mediumAvg: 5 };
    expect(isTrap({ ...form, popularity: 0.599 })).toBe(false);
    expect(isTrap({ ...form, popularity: 0.60 })).toBe(true);
    expect(isTrap({ ...form, popularity: null })).toBe(false);
    expect(isTrap({ ...form, popularity: 0.8, riskScore: 0.4 })).toBe(false);
    expect(isTrap({ ...form, popularity: 0.8, shortAvg: 3.5 })).toBe(false);
  });
  it("destaques exigem pelo menos cinco pontos projetados", () => {
    expect(isDifferentialHighlight({ popularityListed: false, expectedPoints: 4.99 })).toBe(false);
    expect(isDifferentialHighlight({ popularityListed: false, expectedPoints: 5 })).toBe(true);
  });
  it("rótulos desconhecidos não contêm percentuais", () => {
    expect(label({ popularity: null, popularityListed: false })).toBe("Fora dos mais escalados");
    expect(label({ popularity: null })).toBe("Popularidade indisponível");
    expect(label({ popularity: 500000 })).toBe("Popularidade indisponível");
    expect(label({ popularity: 0 })).toBe("0% de escalação");
  });
  it("não interpreta defaults e contagens de JSONs antigos como evidência", () => {
    expect(readPopularitySignals({ popularity: 0.005 }).popularity).toBeNull();
    expect(readPopularitySignals({ popularity: 0.65, popularityVersion: 2 }).popularity).toBe(0.65);
    expect(cleanPopularityExplanation({ popularity: 0.005, isTrap: true, averagePoints: 7 }))
      .toMatchObject({ popularity: null, isTrap: false, isDifferential: false, averagePoints: 7 });
  });
});
