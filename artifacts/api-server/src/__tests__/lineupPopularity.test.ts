import { afterAll, beforeAll, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

// Access checks must stop before optimization and work without live credentials.
vi.mock("@workspace/db", () => ({
  db: { select: () => ({ from: () => ({ where: async () => [] }) }) },
}));
vi.mock("../jobs/syncJob", () => ({ triggerFullSyncIfStale: vi.fn() }));

vi.mock("../services/accessService", () => ({ isPro: async () => false }));
vi.mock("../services/popularityFeatureService", async (original) => {
  const actual = await original<typeof import("../services/popularityFeatureService")>();
  return { ...actual, getPopularityFeatureStatus: async () => actual.evaluatePopularityFeatures({
    lastCollectionAt: new Date().toISOString(), lastSuccessfulCollectionAt: new Date().toISOString(),
    coverage: 20, collectionSucceeded: true,
  }) };
});
let server: Server;
let url: string;
beforeAll(async () => {
  vi.stubEnv("POPULARITY_FORCE_FAILURE", "true");
  const { default: router } = await import("../routes/lineup");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    req.user = { id: -1 } as Express.User;
    next();
  });
  app.use("/api", router);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

it.each(["generate", "compare-formations"])("bloqueia Antimassa com 409 em %s antes de gerar/consumir cota", async (route) => {
  const response = await fetch(`${url}/api/lineup/${route}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ budget: 100, formation: "4-3-3", strategy: "antimassa" }),
  });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ popularityFeaturesEnabled: false, error: expect.stringContaining("calibração") });
});

it("sem falha simulada e com coleta suficiente, preserva o acesso Pro normal", async () => {
  vi.stubEnv("POPULARITY_FORCE_FAILURE", "");
  const response = await fetch(`${url}/api/lineup/generate`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ budget: 100, strategy: "antimassa" }),
  });
  expect(response.status).toBe(402);
});
