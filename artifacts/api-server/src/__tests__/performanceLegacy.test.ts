import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { PerformanceStats } from "@workspace/api-zod";
const m = vi.hoisted(() => ({ select: vi.fn(), gate: vi.fn() }));
vi.mock("@workspace/db", () => ({ db: { select: m.select } }));
vi.mock("../services/popularityFeatureService", () => ({ getPopularityFeatureStatus: m.gate }));
import router from "../routes/stats";
let server: Server, url: string;
let projections: Record<string, unknown>[];
beforeAll(async () => {
  const app = express(); app.use("/api", router);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/stats/performance`;
});
const readStats = async () => await (await fetch(url)).json() as PerformanceStats;
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
beforeEach(() => {
  vi.clearAllMocks(); vi.spyOn(Date, "now").mockReturnValue(Date.now() + 3600000);
  m.gate.mockResolvedValue({ popularityFeaturesEnabled: false });
  projections = [
    { playerId: 1, round: 34, expectedPoints: 10, position: "MEI", lockedAt: null, explanationJson: {} },
    { playerId: 2, round: 35, expectedPoints: 5, position: "GOL", lockedAt: new Date(), explanationJson: {} },
  ];
  let count = 0;
  m.select.mockImplementation(() => {
    const rows = count++ % 2 === 0 ? projections : [
      { playerId: 1, round: 34, points: 0, source: "historical_cartola" },
      { playerId: 2, round: 35, points: 6, source: "historical_cartola" },
    ];
    const chain = { from: () => chain, innerJoin: () => chain, where: async () => rows };
    return chain;
  });
});
test("legado não contamina MAE, contagem ou rodadas da série confiável", async () => {
  const data = await readStats();
  expect(data.season).toMatchObject({ totalRounds: 1, totalDataPoints: 1, mae: 1 });
  expect(data.legacy.season).toMatchObject({ totalRounds: 1, totalDataPoints: 1, mae: 10 });
  expect(data.byRound[0].round).toBe(35);
  expect(data.legacy.byRound[0].round).toBe(34);
});
test("sem congelamento, série confiável fica vazia mas legado permanece acessível", async () => {
  projections.forEach((p) => p.lockedAt = null);
  const data = await readStats();
  expect(data.empty).toBe(true);
  expect(data.season.mae).toBeNull();
  expect(data.legacy.season.totalDataPoints).toBe(2);
});
test("fonte desabilitada omite os cards, inclusive se havia resultado habilitado no cache", async () => {
  m.gate.mockResolvedValueOnce({ popularityFeaturesEnabled: true });
  expect((await readStats()).differentials).toBeDefined();
  const data = await readStats();
  expect(data).not.toHaveProperty("differentials");
  expect(data).not.toHaveProperty("traps");
  expect(data.legacy).not.toHaveProperty("differentials");
});
test("quartil alto sem popularidade conhecida não vira diferencial nem armadilha", async () => {
  m.gate.mockResolvedValue({ popularityFeaturesEnabled: true });
  const data = await readStats();
  expect(data.differentials?.total).toBe(0);
  expect(data.traps?.total).toBe(0);
});
test("usa popularidade e sinais congelados da própria projeção", async () => {
  m.gate.mockResolvedValue({ popularityFeaturesEnabled: true });
  projections[1].explanationJson = { popularityVersion: 2, popularity: 0.1, popularityListed: true };
  const data = await readStats();
  expect(data.differentials).toEqual({ total: 1, hits: 1, hitRate: 100 });
});
