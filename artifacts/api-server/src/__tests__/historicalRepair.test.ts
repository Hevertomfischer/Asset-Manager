import { beforeEach, expect, test, vi } from "vitest";
const m = vi.hoisted(() => ({
  market: vi.fn(), sync: vi.fn(), calibrate: vi.fn(), config: null as null | { key: string; value: string },
  query: vi.fn(), release: vi.fn(),
}));
vi.mock("axios", () => ({ default: { get: m.market } }));
vi.mock("../etl/etlPipeline", () => ({ syncHistoricalRound: m.sync }));
vi.mock("../services/projectionCalibrationService", () => ({ calibrateProjectionWeights: m.calibrate }));
vi.mock("@workspace/db", () => ({ db: {
  query: { adminConfigTable: { findFirst: async () => m.config } },
  insert: () => ({ values: (v: typeof m.config) => ({ onConflictDoUpdate: async () => { m.config = v; } }) }),
  execute: async () => ({ rowCount: 0 }),
}, pool: { connect: async () => ({ query: m.query, release: m.release }) } }));
import { getHistoricalRepairProgress, startHistoricalRepair } from "../services/historicalRepairService";
beforeEach(() => {
  vi.clearAllMocks(); m.config = null;
  m.query.mockResolvedValue({ rows: [{ acquired: true }] });
  m.market.mockResolvedValue({ data: { rodada_atual: 4 } });
  m.sync.mockResolvedValue({ upserted: 2, missingPlayers: 0 });
  m.calibrate.mockResolvedValue({ calibration: { totalPairs: 6 } });
});
test("force em todas as rodadas fechadas; calibra somente depois e libera a conexão", async () => {
  await startHistoricalRepair();
  await vi.waitFor(() => expect(m.release).toHaveBeenCalled());
  expect(m.sync.mock.calls).toEqual([[1, { force: true }], [2, { force: true }], [3, { force: true }]]);
  expect(m.calibrate).toHaveBeenCalledOnce();
  expect(await getHistoricalRepairProgress()).toMatchObject({ status: "completed", completedRounds: 3, upserted: 6 });
});
test("falha da fonte interrompe a sequência e não calibra sobre dados incompletos", async () => {
  m.sync.mockRejectedValueOnce(new Error("fonte indisponível"));
  await startHistoricalRepair();
  await vi.waitFor(() => expect(m.release).toHaveBeenCalled());
  expect(m.sync).toHaveBeenCalledOnce();
  expect(m.calibrate).not.toHaveBeenCalled();
  expect(await getHistoricalRepairProgress()).toMatchObject({ status: "failed", completedRounds: 0 });
});
test("um reparo interrompido por reinício fica disponível para repetição", async () => {
  m.config = { key: "historicalRepair", value: JSON.stringify({ status: "running", completedRounds: 2 }) };
  expect(await getHistoricalRepairProgress()).toMatchObject({ status: "failed", completedRounds: 2 });
  expect(m.release).toHaveBeenCalledOnce();
});
test("não inicia um segundo reparo quando outro processo detém a trava", async () => {
  m.query.mockResolvedValueOnce({ rows: [{ acquired: false }] });
  await expect(startHistoricalRepair()).rejects.toThrow("outro processo");
  expect(m.sync).not.toHaveBeenCalled();
  expect(m.release).toHaveBeenCalledOnce();
});
