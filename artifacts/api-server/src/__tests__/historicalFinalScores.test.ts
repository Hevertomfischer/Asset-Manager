import { beforeEach, expect, test, vi } from "vitest";
const m = vi.hoisted(() => ({ get: vi.fn(), snapshot: vi.fn(), save: vi.fn() }));
vi.mock("axios", () => ({ default: { get: m.get } }));
vi.mock("@workspace/db", () => ({ db: {
  insert: () => ({ values: m.save }),
  query: { roundSnapshotTable: { findFirst: m.snapshot } },
} }));
import { fetchHistoricalRound } from "../providers/historicalCartolaProvider";
beforeEach(() => vi.clearAllMocks());
test("importa pontuacao oficial exata, inclusive zero e valores negativos, sem reconstruir scouts", async () => {
  m.get.mockResolvedValue({ data: { atletas: {
    10: { pontuacao: 0, scout: null },
    11: { pontuacao: -2.7, scout: { GS: 3 } },
    12: { pontuacao: 7.9, pontos_num: 99, scout: { G: 1 } },
  } } });
  expect((await fetchHistoricalRound(34, { force: true })).map((s) => s.pontos_num)).toEqual([0, -2.7, 7.9]);
});
test("force nunca reutiliza snapshot quando a fonte oficial cai", async () => {
  m.get.mockRejectedValue(new Error("offline"));
  m.snapshot.mockResolvedValue({ payloadJson: { scouts: [{ atleta_id: 10, pontos_num: 99 }] } });
  await expect(fetchHistoricalRound(34, { force: true })).rejects.toThrow("offline");
  expect(m.snapshot).not.toHaveBeenCalled();
});
test("não inventa zero ou pontuação por scout quando o ponto oficial está ausente", async () => {
  m.get.mockResolvedValue({ data: { atletas: { 10: { scout: { G: 1 } } } } });
  await expect(fetchHistoricalRound(34, { force: true })).rejects.toThrow("pontuação ausente");
});
test("resposta vazia não vira reparo bem-sucedido nem avança a rodada", async () => {
  m.get.mockResolvedValue({ data: { atletas: {} } });
  await expect(fetchHistoricalRound(34, { force: true })).rejects.toThrow("não devolveu pontuações finais");
});
