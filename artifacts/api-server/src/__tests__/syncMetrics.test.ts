import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ values: vi.fn() }));
vi.mock("@workspace/db", () => ({ db: { insert: () => ({ values: mocks.values }) } }));
import { isFullSyncDegraded, FULL_SYNC_STALE_MS, measureFullSync } from "../services/syncMetrics";
beforeEach(() => {
  mocks.values.mockReset();
  mocks.values.mockImplementation(() => ({ onConflictDoUpdate: async () => {} }));
});
test("stale means more than two hours, not provider degradation", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  expect(isFullSyncDegraded(null, now)).toBe(true);
  expect(isFullSyncDegraded("invalid", now)).toBe(true);
  expect(isFullSyncDegraded(new Date(now - FULL_SYNC_STALE_MS).toISOString(), now)).toBe(false);
  expect(isFullSyncDegraded(new Date(now - FULL_SYNC_STALE_MS - 1).toISOString(), now)).toBe(true);
});
test("successful ETL advances the timestamp and records duration", async () => {
  await measureFullSync(async () => ({ success: true, round: 35 }));
  const records = mocks.values.mock.calls.map((call) => call[0]);
  expect(records).toContainEqual(expect.objectContaining({ key: "lastFullSyncAt" }));
  expect(records).toContainEqual(expect.objectContaining({ key: "lastFullSyncDurationMs" }));
  expect(records).toContainEqual(expect.objectContaining({ metadataJson: expect.objectContaining({ success: true, durationMs: expect.any(Number) }) }));
});
test("failed or partial ETL never claims a fresh successful sync", async () => {
  await measureFullSync(async () => ({ success: false, round: 35 }));
  expect(mocks.values.mock.calls.some((call) => call[0].key === "lastFullSyncAt")).toBe(false);
});
test("a thrown ETL error also records duration without advancing freshness", async () => {
  await expect(measureFullSync(async () => { throw new Error("source failed"); })).rejects.toThrow("source failed");
  expect(mocks.values.mock.calls.some((call) => call[0].key === "lastFullSyncAt")).toBe(false);
});
