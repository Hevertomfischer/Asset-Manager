import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("../lib/logger", () => ({ createLogger: () => ({ warn }) }));
const TEST_SECRET = "admin-middleware-test-only";
let server: Server;
let url: string;

beforeAll(async () => {
  vi.stubEnv("ADMIN_SECRET", TEST_SECRET);
  const { adminAuthMiddleware } = await import("../middlewares/adminAuth");
  const app = express();
  app.use((req, _res, next) => {
    const role = req.headers["x-test-role"];
    req.isAuthenticated = (() => !!role) as typeof req.isAuthenticated;
    if (role) req.user = { id: 123, role } as Express.User;
    next();
  });
  app.use("/api", adminAuthMiddleware);
  app.use((_req, res) => { res.sendStatus(200); });
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
beforeEach(() => warn.mockClear());
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.unstubAllEnvs();
});

describe("Admin authorization — every method", () => {
  test.each(["/admin/users", "/admin/feedback"])("common user receives 403 on GET %s", async (path) => {
    const res = await fetch(`${url}${path}`, { headers: { "x-test-role": "user" } });
    expect(res.status).toBe(403);
    expect(warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      method: "GET", path, userId: 123,
    }));
  });
  test.each(["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"])("%s never grants ordinary users or visitors access", async (method) => {
    const ordinary = await fetch(`${url}/admin/users`, { method, headers: { "x-test-role": "user" } });
    const visitor = await fetch(`${url}/admin/users`, { method });
    expect(ordinary.status).toBe(403);
    expect(visitor.status).toBe(401);
    expect(warn).toHaveBeenCalledTimes(2);
  });
  test.each(["GET", "HEAD", "OPTIONS", "POST", "PUT", "PATCH", "DELETE"])("admin session receives 200 for %s without a secret header", async (method) => {
    expect((await fetch(`${url}/admin/users`, { method, headers: { "x-test-role": "admin" } })).status).toBe(200);
    expect(warn).not.toHaveBeenCalled();
  });
  test.each(["GET", "POST"])("valid script header receives 200 for %s without a session", async (method) => {
    expect((await fetch(`${url}/admin/users`, { method, headers: { "x-admin-secret": TEST_SECRET } })).status).toBe(200);
  });
  test("invalid header does not authorize a visitor or ordinary user", async () => {
    for (const role of ["", "user"]) {
      const res = await fetch(`${url}/admin/users`, {
        method: "POST", headers: { "x-admin-secret": "wrong-test-header", ...(role ? { "x-test-role": role } : {}) },
      });
      expect(res.status).toBe(role ? 403 : 401);
    }
    expect(JSON.stringify(warn.mock.calls)).not.toContain("wrong-test-header");
  });
  test("case-insensitive Express paths remain protected", async () => {
    expect((await fetch(`${url}/ADMIN/users`, { headers: { "x-test-role": "user" } })).status).toBe(403);
  });
  test("public endpoints pass without a session", async () => {
    expect((await fetch(`${url}/sync/status`)).status).toBe(200);
  });
});
