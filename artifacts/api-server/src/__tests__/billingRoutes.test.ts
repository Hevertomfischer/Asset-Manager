import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), insert: vi.fn(), execute: vi.fn(), checkout: vi.fn(),
  getConfig: vi.fn(), payment: vi.fn(), signature: vi.fn(),
}));
vi.mock("@workspace/db", () => {
  const db = { select: mocks.select, insert: mocks.insert, execute: mocks.execute };
  return { db: { ...db, transaction: (fn: (tx: unknown) => unknown) => fn(db) } };
});
vi.mock("../services/billing/planConfig", async (original) => ({
  ...await original<typeof import("../services/billing/planConfig")>(),
  getPlanConfig: mocks.getConfig,
}));
vi.mock("../services/billing/mercadopagoProvider", () => ({ createCheckout: mocks.checkout }));
vi.mock("../services/billing/webhookValidator", () => ({ validateMpSignature: mocks.signature }));
vi.mock("mercadopago", () => ({
  default: class {},
  Payment: class { get = mocks.payment; },
}));
import billingRouter from "../routes/billing";
import { resolvePlanConfig } from "../services/billing/planConfig";
import { FOUNDER_ACCESS_CUTOFF } from "../services/accessService";

let server: Server;
let url: string;
let rows: unknown[][];
let inserted: Record<string, unknown>[];
let authenticated = true;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { if (authenticated) req.user = { id: 42 } as Express.User; next(); });
  app.use("/api", billingRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/billing`;
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MP_ACCESS_TOKEN", "unit-test-not-a-credential");
  authenticated = true;
  rows = [];
  inserted = [];
  mocks.getConfig.mockResolvedValue(resolvePlanConfig({ seasonPassYear: 2099 }));
  mocks.checkout.mockResolvedValue("https://checkout.example.test/");
  mocks.payment.mockResolvedValue({ status: "approved", external_reference: "42:pro_monthly" });
  mocks.select.mockImplementation(() => {
    const result = rows.shift() ?? [];
    const chain = { from: () => chain, where: () => chain, orderBy: () => chain, limit: async () => result };
    return chain;
  });
  mocks.insert.mockImplementation(() => ({ values: async (value: Record<string, unknown>) => { inserted.push(value); } }));
});
afterAll(() => vi.unstubAllEnvs());
const post = (path: string, body: unknown) => fetch(`${url}/${path}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

it("configuração é pública e contém preços efetivos sem dados privados", async () => {
  authenticated = false;
  const response = await fetch(`${url}/config`);
  expect(response.status).toBe(200);
  const body = await response.json() as { founderCutoff: string };
  expect(body).toMatchObject({ seasonPassYear: 2099, proMonthlyPrice: 19.9, seasonPassPrice: 99.9 });
  expect(body.founderCutoff).toBe(FOUNDER_ACCESS_CUTOFF.toISOString());
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("checkout de passe encerrado retorna 409 e não chama Mercado Pago", async () => {
  mocks.getConfig.mockResolvedValue(resolvePlanConfig({ seasonPassYear: 2020 }));
  const response = await post("checkout", { plan: "season_pass" });
  expect(response.status).toBe(409);
  expect((await response.json() as { error: string }).error).toContain("já encerrou");
  expect(mocks.checkout).not.toHaveBeenCalled();
});
it("checkout válido usa a mesma configuração que foi validada", async () => {
  const response = await post("checkout", { plan: "season_pass" });
  expect(response.status).toBe(200);
  expect(mocks.checkout).toHaveBeenCalledWith(42, "season_pass", await mocks.getConfig());
});
it("checkout continua exigindo sessão e um plano conhecido", async () => {
  authenticated = false;
  expect((await post("checkout", { plan: "season_pass" })).status).toBe(401);
  authenticated = true;
  expect((await post("checkout", { plan: "grant" })).status).toBe(400);
});
it("webhook soma prazo ativo, grava o tipo e mantém pagamentos anteriores", async () => {
  const existingEnd = new Date("2098-08-01T12:00:00Z");
  rows = [[], [{ currentPeriodEnd: existingEnd }]];
  const response = await post("webhook", { type: "payment", data: { id: 123 } });
  expect(response.status).toBe(200);
  expect(inserted).toHaveLength(1);
  expect(inserted[0]).toMatchObject({ userId: 42, billingPlan: "pro_monthly", externalId: "123" });
  expect((inserted[0].currentPeriodEnd as Date).getTime()).toBe(existingEnd.getTime() + 30 * 86_400_000);
  expect(inserted[0].currentPeriodStart).toEqual(existingEnd);
  expect(mocks.execute).toHaveBeenCalledOnce();
  // Uma reentrega antiga, mesmo após outra renovação, não soma dias novamente.
  rows = [[{ id: 1 }]];
  expect((await post("webhook", { type: "payment", data: { id: 123 } })).status).toBe(200);
  expect(inserted).toHaveLength(1);
});
it("webhook preserva a temporada vendida em vez da configuração alterada", async () => {
  const sold = resolvePlanConfig({ seasonPassYear: 2098 });
  mocks.payment.mockResolvedValue({
    status: "approved", external_reference: "42:season_pass", metadata: { billing_config: sold },
  });
  rows = [[], []];
  expect((await post("webhook", { type: "payment", data: { id: 124 } })).status).toBe(200);
  expect(inserted[0]).toMatchObject({ billingPlan: "season_pass", currentPeriodEnd: new Date(sold.seasonPassEndsAt) });
  expect(mocks.getConfig).not.toHaveBeenCalled();
});
it("webhook não grava assinatura vencida nem aceita tipos desconhecidos", async () => {
  mocks.payment.mockResolvedValue({ status: "approved", external_reference: "42:grant" });
  expect((await post("webhook", { type: "payment", data: { id: 125 } })).status).toBe(200);
  expect(inserted).toHaveLength(0);
  mocks.payment.mockResolvedValue({ status: "approved", external_reference: "42:season_pass" });
  mocks.getConfig.mockResolvedValue(resolvePlanConfig({ seasonPassYear: 2020 }));
  rows = [[], []];
  expect((await post("webhook", { type: "payment", data: { id: 126 } })).status).toBe(500);
  expect(inserted).toHaveLength(0);
});
it("assinatura retorna o início pago registrado para a conta", async () => {
  const start = new Date("2098-08-01T12:00:00Z");
  const end = new Date("2098-08-31T12:00:00Z");
  rows = [[{ plan: "pro", status: "active", currentPeriodStart: start, currentPeriodEnd: end }]];
  const response = await fetch(`${url}/subscription`);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    plan: "pro", currentPeriodStart: start.toISOString(), currentPeriodEnd: end.toISOString(),
  });
});
it("assinatura histórica sem início registrado retorna null, sem inventar data", async () => {
  rows = [[{ plan: "pro", status: "active", currentPeriodEnd: new Date("2098-08-31T12:00:00Z") }]];
  expect(await (await fetch(`${url}/subscription`)).json()).toMatchObject({ currentPeriodStart: null });
});
