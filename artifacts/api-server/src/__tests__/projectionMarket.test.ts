import { beforeEach, expect, test, vi } from "vitest";
const m = vi.hoisted(() => ({ get: vi.fn(), lock: vi.fn(), warn: vi.fn() }));
vi.mock("axios", () => ({ default: { get: m.get } }));
vi.mock("@workspace/db", () => ({ db: { query: { adminConfigTable: { findFirst: async () => null } } } }));
vi.mock("../repositories/projectionRepository", () => ({ lockRoundProjections: m.lock }));
vi.mock("../lib/logger", () => ({ createLogger: () => ({ warn: m.warn }) }));
import { canGenerateProjections, observeProjectionMarket } from "../services/projectionLockService";
beforeEach(() => { vi.clearAllMocks(); m.lock.mockResolvedValue(10); });
test("mercado aberto não congela", async () => {
  expect(await observeProjectionMarket(1, 35)).toBe(true);
  expect(m.lock).not.toHaveBeenCalled();
});
test("fechamento detectado com atraso congela mesmo após reinício e registra atraso", async () => {
  expect(await observeProjectionMarket(4, 35, Math.floor(Date.now() / 1000) - 60)).toBe(false);
  expect(m.lock).toHaveBeenCalledWith(35);
  expect(m.warn.mock.calls[0][1]).toMatchObject({ round: 35, locked: 10, delayMs: expect.any(Number) });
  expect(m.warn.mock.calls[0][1].delayMs).toBeGreaterThanOrEqual(60000);
});
test("mercado indisponível bloqueia escrita em vez de usar snapshot", async () => {
  m.get.mockRejectedValue(new Error("offline"));
  await expect(canGenerateProjections(35)).rejects.toThrow("offline");
});
test("recalcular uma rodada antiga não cria congelamento retroativo", async () => {
  m.get.mockResolvedValue({ data: { status_mercado: 1, rodada_atual: 35 } });
  expect(await canGenerateProjections(34)).toBe(false);
  expect(m.lock).not.toHaveBeenCalled();
});
