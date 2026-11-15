import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluatePopularityFeatures, getPopularityFeatureStatus, refreshPopularityFeatures } from "../services/popularityFeatureService";
import { isDifferential, isTrap, label } from "../lib/popularityRules";

const mocks = vi.hoisted(() => ({ config: vi.fn(), snapshot: vi.fn(), attempt: vi.fn(), write: vi.fn() }));
vi.mock("@workspace/db", () => ({ db: {
  query: {
    adminConfigTable: { findFirst: mocks.config },
    roundSnapshotTable: { findFirst: mocks.snapshot },
    dataCollectionLogTable: { findFirst: mocks.attempt },
  },
  insert: () => ({ values: () => ({ onConflictDoUpdate: mocks.write }) }),
} }));

const now = Date.parse("2026-11-13T20:00:00Z");
const healthy = {
  lastCollectionAt: new Date(now - 3600000).toISOString(),
  lastSuccessfulCollectionAt: new Date(now - 3600000).toISOString(),
  coverage: 20,
  collectionSucceeded: true,
};
beforeEach(() => { vi.stubEnv("POPULARITY_FORCE_FAILURE", ""); vi.clearAllMocks(); });
afterEach(() => vi.unstubAllEnvs());

describe("chave de recursos de popularidade", () => {
  it("libera com pelo menos 20 jogadores e sucesso recente", () => {
    expect(evaluatePopularityFeatures(healthy, now)).toMatchObject({ popularityFeaturesEnabled: true, reason: "ready" });
  });
  it.each([0, 3, 19])("não libera cobertura de %s jogadores", (coverage) => {
    expect(evaluatePopularityFeatures({ ...healthy, coverage }, now))
      .toMatchObject({ popularityFeaturesEnabled: false, reason: "insufficient_coverage" });
  });
  it("expira após 24 horas mesmo sem um novo ETL", () => {
    expect(evaluatePopularityFeatures({ ...healthy, lastSuccessfulCollectionAt: new Date(now - 86400001).toISOString() }, now))
      .toMatchObject({ popularityFeaturesEnabled: false, reason: "stale" });
  });
  it("a última tentativa falha bloqueia mesmo havendo cache recente com cobertura", () => {
    expect(evaluatePopularityFeatures({ ...healthy, collectionSucceeded: false }, now).popularityFeaturesEnabled).toBe(false);
  });
  it("sem coleta bem-sucedida bloqueia", () => {
    expect(evaluatePopularityFeatures({ ...healthy, lastSuccessfulCollectionAt: null }, now).popularityFeaturesEnabled).toBe(false);
  });
  it("a variável de simulação prevalece sobre uma coleta saudável", () => {
    vi.stubEnv("POPULARITY_FORCE_FAILURE", "true");
    expect(evaluatePopularityFeatures(healthy, now)).toMatchObject({ popularityFeaturesEnabled: false, reason: "forced_failure" });
  });
  it("desligada impede diferencial até para jogador comprovadamente fora da lista", () => {
    expect(isDifferential({ popularity: null, popularityListed: false, popularityFeaturesEnabled: false })).toBe(false);
    expect(isDifferential({ popularity: 0.05, popularityFeaturesEnabled: false })).toBe(false);
    expect(isTrap({ popularity: 0.9, riskScore: 0.8, shortAvg: 1, mediumAvg: 5, popularityFeaturesEnabled: false })).toBe(false);
    expect(label({ popularity: null, popularityListed: false, popularityFeaturesEnabled: false })).toBe("Em calibração");
  });
  it("falha de leitura do estado também bloqueia", async () => {
    mocks.snapshot.mockRejectedValueOnce(new Error("unavailable"));
    expect(await getPopularityFeatureStatus()).toMatchObject({ popularityFeaturesEnabled: false, reason: "unavailable" });
  });
  it("cada reavaliação usa a coleta e persiste sua cobertura, sem contar inferências", async () => {
    const collectedAt = new Date();
    mocks.snapshot.mockResolvedValueOnce({ collectedAt, payloadJson: { "1": 10, "2": 20, "3": 30 } });
    mocks.attempt.mockResolvedValueOnce({ collectedAt, status: "success" });
    mocks.write.mockResolvedValueOnce(undefined);
    expect(await refreshPopularityFeatures()).toMatchObject({ coverage: 3, popularityFeaturesEnabled: false });
    expect(mocks.write).toHaveBeenCalledOnce();
  });
});
