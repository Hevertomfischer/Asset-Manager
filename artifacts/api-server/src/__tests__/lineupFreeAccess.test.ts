import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { lineupAccessPatchSchema } from "../services/lineupAccessConfig";

const state = vi.hoisted(() => ({
  generated: 0, paid: false, config: [] as { key: string; value: string }[],
  generate: vi.fn(), update: vi.fn(),
}));
vi.mock("../auth/passport", () => ({ isGoogleOAuthConfigured: () => false }));
vi.mock("../jobs/syncJob", () => ({ triggerFullSyncIfStale: vi.fn() }));
vi.mock("../optimizers/lineupOptimizer", () => ({ generateLineup: state.generate }));
vi.mock("../repositories/projectionRepository", () => ({ getLatestProjectionRound: async () => 35 }));
vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  return { db: {
    select: () => ({ from: (table: unknown) => {
      let rows: unknown[] = [];
      if (table === schema.adminConfigTable) rows = state.config;
      if (table === schema.subscriptionsTable) rows = state.paid ? [{ id: 1, plan: "pro" }] : [];
      if (table === schema.userPreferencesTable) rows = [{ defaultStrategy: "cost-benefit" }];
      if (table === schema.lineupSuggestionTable) rows = [{ total: state.generated }];
      const chain = { where: () => chain, limit: () => chain,
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) };
      return chain;
    } }),
    update: () => ({ set: () => ({ where: state.update }) }),
  } };
});

let server: Server;
let url: string;
beforeAll(async () => {
  vi.stubEnv("FOUNDER_ACCESS_CUTOFF_DATE", "2000-01-01T00:00:00Z");
  const [{ default: lineup }, { default: auth }] = await Promise.all([import("../routes/lineup"), import("../routes/auth")]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const loggedIn = req.headers["x-test-user"] === "free";
    req.isAuthenticated = (() => loggedIn) as typeof req.isAuthenticated;
    if (loggedIn) req.user = { id: 123, role: "user" } as Express.User;
    next();
  });
  app.use("/api", lineup, auth);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
beforeEach(() => {
  vi.clearAllMocks();
  state.generated = 0; state.paid = false; state.config = [];
  state.generate.mockImplementation(async () => {
    state.generated++;
    return { id: 1, round: 35, strategyType: "safe", players: [], reserves: [], expectedPoints: 80 };
  });
  state.update.mockResolvedValue(undefined);
});
afterAll(async () => { vi.unstubAllEnvs(); await new Promise<void>((resolve) => server.close(() => resolve())); });

function generate(loggedIn = true, strategy = "safe") {
  return fetch(url + "/lineup/generate", {
    method: "POST", headers: { "content-type": "application/json", ...(loggedIn ? { "x-test-user": "free" } : {}) },
    body: JSON.stringify({ round: 35, budget: 100, formation: "4-3-3", strategy }),
  });
}
it("após o Fundador, auth/me rebaixa a preferência antiga Pro para safe sem mudar a preferência salva", async () => {
  const response = await fetch(url + "/auth/me", { headers: { "x-test-user": "free" } });
  expect(await response.json()).toMatchObject({ isPro: false, plan: "free", preferences: { defaultStrategy: "safe" } });
});
it("primeiro Gerar de Free funciona após o corte; segundo respeita a cota default de 1", async () => {
  expect((await generate()).status).toBe(200);
  const second = await generate();
  expect(second.status).toBe(402);
  expect(await second.json()).toMatchObject({ reason: "round_quota", upgradeRequired: true });
  expect(state.generate).toHaveBeenCalledTimes(1);
});
it("visitante recebe 401 e convite de login por padrão, sem chamar o otimizador", async () => {
  const response = await generate(false);
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ reason: "login_required", error: "Entre com Google para gerar sua escalação grátis" });
  expect(state.generate).not.toHaveBeenCalled();
});
it("modo allowed libera geração anônima explicitamente", async () => {
  state.config = [{ key: "anonymousLineupMode", value: "allowed" }];
  expect((await generate(false)).status).toBe(200);
});
it("cota configurável permite duas gerações e bloqueia a terceira", async () => {
  state.config = [{ key: "freeLineupsPerRound", value: "2" }];
  expect((await generate()).status).toBe(200);
  expect((await generate()).status).toBe(200);
  expect((await generate()).status).toBe(402);
});
it("cota zero bloqueia sem gerar; política inválida não libera acesso", async () => {
  state.config = [{ key: "freeLineupsPerRound", value: "0" }];
  expect((await generate()).status).toBe(402);
  state.config = [{ key: "anonymousLineupMode", value: "invalid" }];
  expect((await generate(false)).status).toBe(500);
  expect(state.generate).not.toHaveBeenCalled();
});
it("estratégia Pro continua protegida para Free", async () => {
  const response = await generate(true, "cost-benefit");
  expect(response.status).toBe(402);
  expect(await response.json()).toMatchObject({ reason: "pro_strategy" });
});
it("Pro mantém preferência e não recebe a cota Free", async () => {
  state.paid = true; state.generated = 50;
  const response = await fetch(url + "/auth/me", { headers: { "x-test-user": "free" } });
  expect(await response.json()).toMatchObject({ isPro: true, preferences: { defaultStrategy: "cost-benefit" } });
  expect((await generate(true, "cost-benefit")).status).toBe(200);
});
it("patch parcial não injeta defaults nem reseta opções omitidas", () => {
  expect(lineupAccessPatchSchema.parse({})).toEqual({});
  expect(lineupAccessPatchSchema.parse({ freeLineupsPerRound: 2 })).toEqual({ freeLineupsPerRound: 2 });
  expect(lineupAccessPatchSchema.safeParse({ anonymousLineupMode: "invalid" }).success).toBe(false);
});
