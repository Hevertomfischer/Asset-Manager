import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ validate: vi.fn() }));
vi.mock("../routes/mcpOauth", () => ({ validateMcpBearerToken: mocks.validate }));
vi.mock("../lib/logger", () => ({ createLogger: () => ({ warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() }) }));
let server: Server;
let origin: string;
beforeAll(async () => {
  // Even if somebody configures an old shared token, it must not bypass OAuth.
  vi.stubEnv("MCP_ACCESS_TOKEN", "unit-legacy-token");
  const { default: router } = await import("../routes/mcp");
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => { mocks.validate.mockReset(); mocks.validate.mockResolvedValue(null); });
test("a configured static legacy token is refused and receives discovery", async () => {
  const response = await fetch(`${origin}/api/mcp`, { headers: { Authorization: "Bearer unit-legacy-token" } });
  expect(response.status).toBe(401);
  expect(mocks.validate).toHaveBeenCalledWith("unit-legacy-token");
  expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
});
test("unauthenticated MCP keeps resource_metadata discovery", async () => {
  const response = await fetch(`${origin}/api/mcp`);
  expect(response.status).toBe(401);
  expect(response.headers.get("www-authenticate")).toContain("/.well-known/oauth-protected-resource");
  expect(mocks.validate).not.toHaveBeenCalled();
});
