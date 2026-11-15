import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  schedule: vi.fn(), select: vi.fn(), values: vi.fn(), observe: vi.fn(), notify: vi.fn(),
  etl: vi.fn(), historical: vi.fn(), events: vi.fn(), status: 4 as number | undefined,
  configuration: {} as Record<string, string>, order: [] as string[],
}));
vi.mock("node-cron", () => ({ default: { validate: () => true, schedule: mocks.schedule } }));
vi.mock("axios", () => ({ default: { get: async () => ({
  data: { status_mercado: mocks.status, rodada_atual: 35, fechamento: { timestamp: 1794618000 } },
}) } }));
vi.mock("@workspace/db", () => ({ db: {
  select: mocks.select, insert: () => ({ values: mocks.values }),
} }));
vi.mock("../etl/etlPipeline", () => ({ runCurrentRoundETL: mocks.etl, syncHistoricalRound: mocks.historical }));
vi.mock("../services/syncLease", () => ({
  isSyncingLocally: () => false,
  withSyncLease: async (_resource: string, work: () => Promise<unknown>) => ({ executed: true, result: await work() }),
}));
vi.mock("../services/projectionLockService", () => ({ observeProjectionMarket: mocks.observe }));
vi.mock("../services/notificationService", () => ({
  createMarketNotification: mocks.notify, generateEtlNotifications: mocks.events,
  generateRoundResultNotifications: async () => {},
}));
vi.mock("../lib/logger", () => ({ createLogger: () => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(),
}) }));
import { checkMarketStatus, runFullSyncJob, startSyncJob } from "../jobs/syncJob";
const dialect = new PgDialect();
beforeEach(() => {
  vi.clearAllMocks();
  mocks.status = 4;
  mocks.configuration = { marketStatus: "open", lastKnownRound: "35" };
  mocks.order = [];
  mocks.select.mockReturnValue({ from: () => ({ where: (condition: Parameters<PgDialect["sqlToQuery"]>[0]) => ({
    limit: async () => {
      const key = String(dialect.sqlToQuery(condition).params[0]);
      return mocks.configuration[key] ? [{ key, value: mocks.configuration[key] }] : [];
    },
  }) }) });
  mocks.values.mockImplementation((value: { key: string; value: string }) => ({
    onConflictDoUpdate: async () => {
      mocks.configuration[value.key] = value.value;
      mocks.order.push("persist");
    },
  }));
  mocks.observe.mockImplementation(async () => { mocks.order.push("freeze"); });
  mocks.notify.mockImplementation(async () => { mocks.order.push("notify"); });
  mocks.etl.mockResolvedValue({ success: true, round: 35, errors: [] });
});
afterAll(() => vi.unstubAllEnvs());

test.each([undefined, "false"])("no in-process cron unless explicitly enabled: %s", (flag) => {
  vi.stubEnv("ENABLE_IN_PROCESS_CRON", flag);
  startSyncJob();
  expect(mocks.schedule).not.toHaveBeenCalled();
  expect(mocks.observe).not.toHaveBeenCalled();
});
test("closing market freezes projections before notification and persisted status", async () => {
  const outcome = await checkMarketStatus();
  expect(outcome).toMatchObject({ executed: true, result: { marketStatus: "closed" } });
  expect(mocks.observe).toHaveBeenCalledWith(4, 35, 1794618000);
  expect(mocks.notify).toHaveBeenCalledWith("market_close", 35);
  expect(mocks.order).toEqual(["freeze", "notify", "persist"]);
});
test("unchanged market status never duplicates its notification", async () => {
  mocks.configuration.marketStatus = "closed";
  await checkMarketStatus();
  expect(mocks.notify).not.toHaveBeenCalled();
  expect(mocks.order).toEqual(["freeze", "persist"]);
});
test("invalid source data does not advance the market observation timestamp", async () => {
  mocks.status = undefined;
  await expect(checkMarketStatus()).rejects.toThrow("inválido");
  expect(mocks.values).not.toHaveBeenCalled();
});
test("failed full ETL does not run closed-round follow-ups or notifications", async () => {
  mocks.etl.mockResolvedValue({ success: false, round: 35, errors: ["source failed"] });
  expect(await runFullSyncJob()).toMatchObject({ executed: true, result: { success: false } });
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.events).not.toHaveBeenCalled();
});
test("explicitly enabled development cron uses hourly full and 15-minute market checks", async () => {
  vi.stubEnv("ENABLE_IN_PROCESS_CRON", "true");
  startSyncJob();
  expect(mocks.schedule.mock.calls.map((call) => call[0])).toEqual(["0 * * * *", "*/15 * * * *"]);
  await vi.waitFor(() => expect(mocks.order).toEqual(["freeze", "notify", "persist"]));
});
