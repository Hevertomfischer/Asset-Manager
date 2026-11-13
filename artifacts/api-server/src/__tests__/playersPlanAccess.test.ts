import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { sanitizeExplanationForPlan } from "../lib/sanitizeProjection";

const state = vi.hoisted(() => ({ enabled: true, paid: false, subscriptionReads: 0 }));
const player = { id: 1, name: "Atleta teste", nickname: "Teste", position: "ATA", clubId: 1, price: 10,
  popularity: 0.1, popularityCount: 100, popularityListed: true };
const explanation = { expectedPoints: 8, riskScore: 0.2, popularityVersion: 2, popularity: 0.1,
  popularityListed: true, differentialScore: 7, isTrap: false, isDifferential: true, shortAvg: 4, mediumAvg: 5,
  futureProSignal: { secret: true } };
const projection = { id: 1, playerId: 1, round: 35, expectedPoints: 8, explanationJson: explanation };

vi.mock("../services/popularityFeatureService", () => ({
  getPopularityFeatureStatus: async () => ({ popularityFeaturesEnabled: state.enabled }),
}));
vi.mock("../repositories/playerRepository", () => ({ getPlayerById: async () => player }));
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  return { db: { select: () => ({ from: (table: unknown) => {
    let rows: unknown[] = [];
    if (table === schema.playersTable) rows = [player];
    if (table === schema.playerProjectionTable) rows = [projection];
    if (table === schema.clubsTable) rows = [{ id: 1, name: "Clube", abbreviation: "TST" }];
    if (table === schema.subscriptionsTable) {
      state.subscriptionReads++;
      rows = state.paid ? [{ id: 1, plan: "pro" }] : [];
    }
    const chain = {
      where: () => chain, orderBy: () => chain, limit: () => chain,
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
    };
    return chain;
  } }) } };
});

let server: Server;
let url: string;
beforeAll(async () => {
  // Exercise the real accessService after the campaign, without changing workspace env or accounts.
  vi.stubEnv("FOUNDER_ACCESS_CUTOFF_DATE", "2000-01-01T00:00:00Z");
  const { default: router } = await import("../routes/players");
  const app = express();
  app.use((req, _res, next) => {
    const loggedIn = req.headers["x-test-user"] === "free";
    req.isAuthenticated = (() => loggedIn) as typeof req.isAuthenticated;
    if (loggedIn) req.user = { id: 123 } as Express.User;
    next();
  });
  app.use("/api", router);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
beforeEach(() => { state.enabled = true; state.paid = false; state.subscriptionReads = 0; });
afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

it.each(["/players?round=35", "/players/1", "/players/projections/current?round=35"])(
  "Free após o corte recebe 200 e nenhum sinal Pro em %s", async (path) => {
    const response = await fetch(url + "/api" + path, { headers: { "x-test-user": "free" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const json = await response.json();
    const serialized = JSON.stringify(json);
    for (const key of ["popularity", "popularityCount", "popularityListed", "isTrap", "isDifferential", "differentialScore", "shortAvg", "futureProSignal"]) {
      expect(serialized).not.toContain(`"${key}"`);
    }
    expect(serialized).toContain('"expectedPoints":8');
    expect(state.subscriptionReads).toBeGreaterThan(0);
    if (path.includes("/current")) expect(json).toMatchObject({ limited: true, proTeaser: { differentials: 1, traps: 0 } });
  },
);
it("anônimo também recebe projeções básicas sanitizadas", async () => {
  const response = await fetch(url + "/api/players/projections/current?round=35");
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ limited: true });
  expect(state.subscriptionReads).toBe(0);
});
it("preserva os detalhes do usuário com plano Pro real", async () => {
  state.paid = true;
  const response = await fetch(url + "/api/players/projections/current?round=35", { headers: { "x-test-user": "free" } });
  const json = await response.json();
  expect(json).toMatchObject({
    limited: false,
    projections: [{ explanationJson: { differentialScore: 7, popularity: 0.1, isDifferential: true } }],
  });
});
it("não inventa teaser quando a popularidade está em calibração", async () => {
  state.enabled = false;
  const json = await (await fetch(url + "/api/players/projections/current?round=35")).json();
  expect(json).toMatchObject({ proTeaser: { differentials: 0, traps: 0 } });
});
it("sanitização é imutável, recusa valores inválidos e bloqueia campos novos por padrão", () => {
  expect(sanitizeExplanationForPlan(null, false)).toBeNull();
  expect(sanitizeExplanationForPlan([], false)).toBeNull();
  expect(sanitizeExplanationForPlan(explanation, false)).toEqual({ expectedPoints: 8, riskScore: 0.2 });
  expect(explanation.differentialScore).toBe(7);
  expect(sanitizeExplanationForPlan(explanation, true)).toEqual(explanation);
});
