import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ run: vi.fn(), error: vi.fn() }));
vi.mock("../jobs/syncJob", () => ({ runCronJob: mocks.run }));
vi.mock("../lib/logger", () => ({ createLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: mocks.error }) }));
import { createInternalCronRouter } from "../routes/internalCron";
let server: Server;
let base: string;
const headers = { "x-cron-secret": "unit-test-scheduler-secret" };
beforeAll(async () => {
  const app = express();
  app.use("/api", createInternalCronRouter(50));
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/internal/cron`;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", "unit-test-scheduler-secret");
  mocks.run.mockResolvedValue({ executed: true, result: { success: true, round: 35 } });
});
test("missing configured secret is explicit 503, not public access", async () => {
  vi.stubEnv("CRON_SECRET", undefined);
  expect((await fetch(`${base}/full-sync`, { method: "POST" })).status).toBe(503);
  expect(mocks.run).not.toHaveBeenCalled();
});
test.each([undefined, "wrong"])("missing or wrong supplied secret returns 401", async (secret) => {
  const response = await fetch(`${base}/full-sync`, { method: "POST", headers: secret ? { "x-cron-secret": secret } : {} });
  expect(response.status).toBe(401);
  expect(mocks.run).not.toHaveBeenCalled();
});
test("unknown job is rejected without execution", async () => {
  expect((await fetch(`${base}/unsupported`, { method: "POST", headers })).status).toBe(404);
  expect(mocks.run).not.toHaveBeenCalled();
});
test.each(["full-sync", "market-check"])("%s succeeds with a valid secret", async (job) => {
  const response = await fetch(`${base}/${job}`, { method: "POST", headers });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ job, status: "completed", success: true });
  expect(mocks.run).toHaveBeenCalledWith(job);
});
test("busy resource is reported as skipped", async () => {
  mocks.run.mockResolvedValue({ executed: false, reason: "already_running" });
  expect(await (await fetch(`${base}/full-sync`, { method: "POST", headers })).json())
    .toMatchObject({ status: "skipped", reason: "already_running" });
});
test("partial and thrown failures return 502", async () => {
  mocks.run.mockResolvedValueOnce({ executed: true, result: { success: false, round: 35 } });
  expect((await fetch(`${base}/full-sync`, { method: "POST", headers })).status).toBe(502);
  mocks.run.mockRejectedValueOnce(new Error("source failed"));
  expect((await fetch(`${base}/full-sync`, { method: "POST", headers })).status).toBe(502);
});
test("long job returns 202 and continues after the response", async () => {
  let complete!: (value: unknown) => void;
  let finished = false;
  mocks.run.mockImplementation(() => new Promise((resolve) => {
    complete = (value) => { finished = true; resolve(value); };
  }));
  const response = await fetch(`${base}/full-sync`, { method: "POST", headers });
  expect(response.status).toBe(202);
  expect(response.headers.get("location")).toBe("/api/sync/status");
  expect(await response.json()).toMatchObject({ status: "running", durable: false });
  expect(finished).toBe(false);
  complete({ executed: true, result: { success: true, round: 35 } });
  await new Promise((resolve) => setImmediate(resolve));
  expect(finished).toBe(true);
});
