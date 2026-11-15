import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), isSyncing: vi.fn(), error: vi.fn(), popularity: vi.fn(),
}));
vi.mock("@workspace/db", () => ({ db: { select: mocks.select } }));
vi.mock("../services/syncLease", () => ({ isSyncingGlobally: mocks.isSyncing }));
vi.mock("../lib/logger", () => ({ createLogger: () => ({ error: mocks.error }) }));
vi.mock("../services/popularityFeatureService", () => ({ getPopularityFeatureStatus: mocks.popularity }));
import syncRouter from "../routes/sync";

let server: Server;
let url: string;
let config: { key: string; value: string; updatedAt?: Date }[];
let sources: { status: string }[][];
beforeAll(async () => {
  const app = express();
  app.use("/api", syncRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sync/status`;
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
beforeEach(() => {
  vi.clearAllMocks();
  config = [
    { key: "lastFullSyncAt", value: "2026-11-13T10:00:00.000Z" },
    { key: "marketStatus", value: "open", updatedAt: new Date("2026-11-13T10:30:00.000Z") },
  ];
  sources = Array.from({ length: 5 }, () => [{ status: "success" }]);
  let index = 0;
  mocks.select.mockImplementation(() => {
    const current = index++;
    return { from: () => ({ where: () => current === 0 ? Promise.resolve(config) : {
      orderBy: () => ({ limit: () => Promise.resolve(sources[current - 1]) }),
    } }) };
  });
  mocks.isSyncing.mockReturnValue(false);
  mocks.popularity.mockResolvedValue({
    popularityFeaturesEnabled: false, lastCollectionAt: null, lastSuccessfulCollectionAt: null,
    coverage: 0, minimumCoverage: 20, maxAgeHours: 24, reason: "no_data",
  });
});
test("public status preserves fields and exposes only aggregate provider health", async () => {
  const response = await fetch(url);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({
    lastSyncAt: config[0]!.value, marketStatus: "open", isRunning: false,
    lastFullSyncAt: config[0]!.value, lastFullSyncDurationMs: null, degraded: true,
    providersDegraded: false, lastMarketCheckAt: "2026-11-13T10:30:00.000Z",
    popularityFeaturesEnabled: false,
    popularity: { lastCollectionAt: null, lastSuccessfulCollectionAt: null, coverage: 0, minimumCoverage: 20, maxAgeHours: 24, reason: "no_data" },
  });
});
test("reports provider errors and recent degraded observations", async () => {
  sources[1] = [{ status: "error" }];
  expect(await (await fetch(url)).json()).toMatchObject({ providersDegraded: true });
});
test("a recent degraded observation is reflected even after latest success", async () => {
  sources[3] = [{ status: "success" }, { status: "degraded" }];
  expect(await (await fetch(url)).json()).toMatchObject({ providersDegraded: true });
});
test("missing observations remain nullable rather than inventing timestamps", async () => {
  config = [];
  sources = Array.from({ length: 5 }, () => []);
  mocks.isSyncing.mockReturnValue(true);
  expect(await (await fetch(url)).json()).toEqual({
    lastSyncAt: null, marketStatus: null, isRunning: true,
    lastFullSyncAt: null, lastFullSyncDurationMs: null, degraded: true,
    providersDegraded: false, lastMarketCheckAt: null,
    popularityFeaturesEnabled: false,
    popularity: { lastCollectionAt: null, lastSuccessfulCollectionAt: null, coverage: 0, minimumCoverage: 20, maxAgeHours: 24, reason: "no_data" },
  });
});
test("database failure returns 500 and logs a failure", async () => {
  mocks.select.mockImplementation(() => { throw new Error("test database unavailable"); });
  expect((await fetch(url)).status).toBe(500);
  expect(mocks.error).toHaveBeenCalled();
});
test("fresh successful sync is not degraded and exposes its measured duration", async () => {
  config[0]!.value = new Date().toISOString();
  config.push({ key: "lastFullSyncDurationMs", value: "1467000" });
  expect(await (await fetch(url)).json()).toMatchObject({ degraded: false, lastFullSyncDurationMs: 1467000 });
});
