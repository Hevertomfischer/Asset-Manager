import { beforeEach, expect, test, vi } from "vitest";
const m = vi.hoisted(() => ({ existing: vi.fn(), events: [] as string[], insert: vi.fn() }));
vi.mock("@workspace/db", () => {
  const tx = {
    execute: async () => { m.events.push("lock"); },
    query: { playerScoutRoundTable: { findFirst: m.existing } },
    delete: () => ({ where: async () => { m.events.push("delete-duplicates"); } }),
    update: () => ({ set: (v: unknown) => ({ where: () => ({ returning: async () => {
      m.events.push("update-canonical"); return [{ id: 1, ...(v as object) }];
    } }) }) }),
    insert: m.insert,
  };
  return { db: { transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } };
});
import { insertScoutRound } from "../repositories/projectionRepository";
beforeEach(() => { vi.clearAllMocks(); m.events.length = 0; });
test("consolida antes de trocar source, evitando colisão com o índice antigo de três colunas", async () => {
  m.existing.mockResolvedValue({ id: 1, source: "cartola_api", points: 0 });
  const data = await insertScoutRound({ playerId: 10, round: 34, source: "historical_cartola", points: 7.5 });
  expect(m.events).toEqual(["lock", "delete-duplicates", "update-canonical"]);
  expect(data).toMatchObject({ id: 1, source: "historical_cartola", points: 7.5 });
  expect(m.insert).not.toHaveBeenCalled();
});
test("CSV não sobrescreve pontuação final oficial", async () => {
  const canonical = { id: 1, source: "historical_cartola", points: 7.5 };
  m.existing.mockResolvedValue(canonical);
  expect(await insertScoutRound({ playerId: 10, round: 34, source: "csv_2026", points: 99 })).toBe(canonical);
  expect(m.events).toEqual(["lock"]);
});
test("repetir o reparo atualiza a mesma linha em vez de duplicar", async () => {
  m.existing.mockResolvedValue({ id: 1, source: "historical_cartola" });
  await insertScoutRound({ playerId: 10, round: 34, source: "historical_cartola", points: 0 });
  await insertScoutRound({ playerId: 10, round: 34, source: "historical_cartola", points: 0 });
  expect(m.insert).not.toHaveBeenCalled();
  expect(m.events.filter((e) => e === "update-canonical")).toHaveLength(2);
});
