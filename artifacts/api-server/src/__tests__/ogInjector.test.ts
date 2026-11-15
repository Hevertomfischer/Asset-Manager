import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  where: vi.fn(),
}));
vi.mock("fs/promises", () => ({ readFile: mocks.readFile }));
vi.mock("@workspace/db", () => ({
  db: { select: () => ({ from: () => ({ where: mocks.where }) }) },
}));
vi.mock("../services/ogStats", () => ({
  getOgStats: async () => ({ seasonMae: null, lastRound: null, lastRoundMae: null, totalRounds: 0 }),
}));
import { createDynamicOgMiddleware, createOgMiddleware } from "../middlewares/ogInjector";

const html = '<html><head><title>Genérico</title><meta property="og:title" content="Genérico" /></head><body><div id="root"></div></body></html>';
const indexHtmlPath = "/deployment/artifacts/cartola-intel/dist/public/index.html";
const options = { indexHtmlPath, publicUrl: "https://mitometro.com.br" };
let server: Server;
let origin: string;

beforeAll(async () => {
  const app = express();
  app.use(createOgMiddleware(["/", "/desempenho"], options));
  app.use(createDynamicOgMiddleware(options));
  app.use((_req, res) => { res.status(404).send("fallback"); });
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.readFile.mockResolvedValue(html);
  mocks.where.mockResolvedValue([{ name: "Jogador", nickname: "Teste & Companhia", position: "ATA" }]);
});

test("round HTML uses the build passed by app.ts, not the working directory", async () => {
  const response = await fetch(`${origin}/rodada/30`, { headers: { "user-agent": "facebookexternalhit/1.1" } });
  const body = await response.text();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/html");
  expect(mocks.readFile).toHaveBeenCalledWith(indexHtmlPath, "utf-8");
  expect(body).toContain('property="og:title" content="Rodada 30 Cartola FC: Projeções e Análise | Mitometro"');
  expect(body).toContain('property="og:url" content="https://mitometro.com.br/rodada/30"');
  expect(body).toContain('property="og:image" content="https://mitometro.com.br/opengraph.jpg"');
  expect(body.match(/property="og:title"/g)).toHaveLength(1);
});

test("the cached round keeps its specific OG and absolute image", async () => {
  await fetch(`${origin}/rodada/31`);
  const body = await (await fetch(`${origin}/rodada/31`)).text();
  expect(body).toContain("Rodada 31 Cartola FC");
  expect(body).toContain("https://mitometro.com.br/opengraph.jpg");
});

test("player metadata is specific and safely escaped", async () => {
  const body = await (await fetch(`${origin}/jogador/teste-123`)).text();
  expect(body).toContain("Teste &amp; Companhia: histórico de projeção e análise");
  expect(body).toContain('property="og:url" content="https://mitometro.com.br/jogador/teste-123"');
});

test("exact public routes also use the same frontend build", async () => {
  const body = await (await fetch(`${origin}/desempenho`)).text();
  expect(body).toContain("Desempenho do Modelo de Projeção | Mitometro");
  expect(mocks.readFile).toHaveBeenCalledWith(indexHtmlPath, "utf-8");
});

test("missing frontend build falls through without serving a broken response", async () => {
  mocks.readFile.mockRejectedValue(new Error("ENOENT"));
  expect((await fetch(`${origin}/rodada/32`)).status).toBe(404);
});

test("unmatched routes do not read the frontend build", async () => {
  expect((await fetch(`${origin}/api/anything`)).status).toBe(404);
  expect(mocks.readFile).not.toHaveBeenCalled();
});
