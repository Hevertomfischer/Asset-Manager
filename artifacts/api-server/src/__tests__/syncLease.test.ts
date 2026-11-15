import { EventEmitter } from "node:events";
import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  connect: vi.fn(), query: vi.fn(), info: vi.fn(), error: vi.fn(), failUnlock: false,
}));
vi.mock("@workspace/db", () => ({ pool: { connect: mocks.connect, query: mocks.query } }));
vi.mock("../lib/logger", () => ({ createLogger: () => ({ info: mocks.info, error: mocks.error }) }));
import { withSyncLease, requireSyncLease, SyncBusyError, isSyncingGlobally } from "../services/syncLease";

const held = new Set<number>();
const clients: ReturnType<typeof fakeClient>[] = [];
function fakeClient() {
  return Object.assign(new EventEmitter(), {
    query: vi.fn(async (sql: string, params: number[]) => {
      const id = params[1]!;
      if (sql.includes("pg_try_advisory_lock")) {
        const acquired = !held.has(id);
        if (acquired) held.add(id);
        return { rows: [{ acquired }] };
      }
      if (mocks.failUnlock) throw new Error("connection lost");
      return { rows: [{ released: held.delete(id) }] };
    }),
    release: vi.fn(),
  });
}
beforeEach(() => {
  vi.clearAllMocks(); held.clear(); clients.length = 0; mocks.failUnlock = false;
  mocks.connect.mockImplementation(async () => {
    const client = fakeClient(); clients.push(client); return client;
  });
});
test("two simultaneous full jobs execute only one body", async () => {
  let complete!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((r) => { entered = r; });
  const gate = new Promise<void>((r) => { complete = r; });
  let calls = 0;
  const first = withSyncLease("full-sync", async () => { calls++; entered(); await gate; return 42; });
  await started;
  const second = await withSyncLease("full-sync", async () => { calls++; return 99; });
  expect(second).toEqual({ executed: false, reason: "already_running" });
  expect(calls).toBe(1);
  complete();
  expect(await first).toEqual({ executed: true, result: 42 });
  expect(clients).toHaveLength(2);
  expect(clients[0]!.query.mock.calls.map((call) => call[0])).toEqual([
    "SELECT pg_try_advisory_lock($1, $2) AS acquired",
    "SELECT pg_advisory_unlock($1, $2) AS released",
  ]);
  expect(clients[1]!.query).toHaveBeenCalledTimes(1);
  expect(mocks.info).toHaveBeenCalled();
});
test("nested ETL and closed-round work retains the same dedicated client", async () => {
  const result = await requireSyncLease("full-sync", () =>
    requireSyncLease("full-sync", async () => "done"));
  expect(result).toBe("done");
  expect(clients).toHaveLength(1);
  expect(clients[0]!.release).toHaveBeenCalledWith(false);
});
test("market observations are not blocked by a long full sync", async () => {
  await requireSyncLease("full-sync", async () => {
    expect(await withSyncLease("market-check", async () => "closed")).toEqual({ executed: true, result: "closed" });
  });
  expect(clients[0]!.query.mock.calls[0]![1]).toEqual([73503, 1]);
  expect(clients[1]!.query.mock.calls[0]![1]).toEqual([73503, 2]);
});
test("exception still unlocks and releases the dedicated client", async () => {
  await expect(requireSyncLease("full-sync", async () => { throw new Error("failed"); })).rejects.toThrow("failed");
  expect(held.size).toBe(0);
  expect(clients[0]!.release).toHaveBeenCalledWith(false);
});
test("unlock failure destroys the client instead of leaking the lease into the pool", async () => {
  mocks.failUnlock = true;
  await requireSyncLease("full-sync", async () => "done");
  expect(clients[0]!.release).toHaveBeenCalledWith(true);
});
test("direct ETL callers receive a readable busy error", async () => {
  held.add(1);
  await expect(requireSyncLease("full-sync", async () => "unreachable")).rejects.toBeInstanceOf(SyncBusyError);
});
test("status checks the database rather than an instance-local flag", async () => {
  mocks.query.mockResolvedValue({ rows: [{ running: true }] });
  expect(await isSyncingGlobally()).toBe(true);
  expect(mocks.query.mock.calls[0]![1]).toEqual([73503, 1]);
});
