import { beforeEach, expect, test, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { playerScoutRoundTable } from "@workspace/db/schema";

const m = vi.hoisted(() => ({
  existing: vi.fn(), fence: vi.fn(), scouts: vi.fn(), write: vi.fn(), execute: vi.fn(),
  insert: vi.fn(), canGenerate: vi.fn(),
}));
vi.mock("@workspace/db", () => {
  const tx = {
    execute: m.execute,
    query: {
      playerProjectionTable: { findFirst: m.existing },
      adminConfigTable: { findFirst: m.fence },
    },
    update: () => ({ set: m.write }),
    insert: m.insert,
  };
  return { db: { transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
    query: { playerScoutRoundTable: { findMany: m.scouts } } } };
});
vi.mock("../services/projectionLockService", () => ({ canGenerateProjections: m.canGenerate }));
import { getScoutsByPlayer, lockRoundProjections, upsertProjection } from "../repositories/projectionRepository";
import { runProjectionEngine } from "../engines/projectionEngine";

const generatedAt = new Date("2026-11-13T12:00:00Z");
const lockedAt = new Date("2026-11-13T13:00:00Z");
beforeEach(() => {
  vi.clearAllMocks();
  m.existing.mockResolvedValue({ id: 1, playerId: 10, round: 35, expectedPoints: 8, generatedAt, lockedAt: null });
  m.fence.mockResolvedValue(null);
  m.write.mockReturnValue({ where: () => ({ returning: async () => [{ id: 1, expectedPoints: 20 }] }) });
  m.insert.mockReturnValue({ values: () => ({ onConflictDoNothing: async () => {}, returning: async () => [{ id: 2 }] }) });
});
test("projeção congelada mantém valor, generated_at e locked_at originais", async () => {
  const original = { id: 1, playerId: 10, round: 35, expectedPoints: 8, generatedAt, lockedAt };
  m.existing.mockResolvedValue(original);
  expect(await upsertProjection({ playerId: 10, round: 35, expectedPoints: 99, lockedAt: null })).toEqual(original);
  expect(m.write).not.toHaveBeenCalled();
  expect(m.insert).not.toHaveBeenCalled();
});
test("barreira da rodada impede jogador novo depois do congelamento", async () => {
  m.existing.mockResolvedValue(null); m.fence.mockResolvedValue({ value: lockedAt.toISOString() });
  expect(await upsertProjection({ playerId: 11, round: 35, expectedPoints: 99 })).toBeNull();
  expect(m.insert).not.toHaveBeenCalled();
});
test("rodada aberta ainda atualiza normalmente, sem aceitar lockedAt do chamador", async () => {
  await upsertProjection({ playerId: 10, round: 35, expectedPoints: 20, lockedAt });
  expect(m.write).toHaveBeenCalledWith(expect.objectContaining({ expectedPoints: 20, generatedAt: expect.any(Date) }));
  expect(m.write.mock.calls[0][0]).not.toHaveProperty("lockedAt");
});
test("congelamento usa a mesma trava transacional e não altera generated_at", async () => {
  expect(await lockRoundProjections(35)).toBe(1);
  expect(m.execute).toHaveBeenCalledOnce();
  expect(m.write).toHaveBeenCalledWith({ lockedAt: expect.any(Date) });
});
test("scouts da rodada R e futuros, e antigos scouts parciais, não entram na forma", async () => {
  m.scouts.mockResolvedValue([]);
  await getScoutsByPlayer(10, 7, 35);
  const args = m.scouts.mock.calls[0][0];
  const query = new PgDialect().sqlToQuery(args.where(playerScoutRoundTable));
  expect(query.sql).toContain('"round" <');
  expect(query.sql).toContain('"source" <>');
  expect(query.params).toEqual([10, "cartola_api", 35]);
  expect(args.limit).toBe(7);
});
test("motor não inicia cálculos com mercado fechado", async () => {
  m.canGenerate.mockResolvedValue(false);
  expect(await runProjectionEngine(35)).toBe(false);
  expect(m.write).not.toHaveBeenCalled();
  expect(m.scouts).not.toHaveBeenCalled();
});
