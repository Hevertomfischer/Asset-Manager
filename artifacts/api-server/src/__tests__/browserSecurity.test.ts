import express from "express";
import session from "express-session";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { createBrowserCors, sessionCookieOptions } from "../lib/browserSecurity";

vi.mock("../lib/logger", () => ({ createLogger: () => ({ warn: vi.fn() }) }));
const allowed = "https://mitometro.com.br,https://claude.ai";
const servers: Server[] = [];
let production: string;
let development: string;

async function listen(environment: string) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(createBrowserCors(environment, allowed));
  app.use(session({
    secret: "unit-test-session-secret-not-a-real-credential",
    resave: false, saveUninitialized: false, cookie: sessionCookieOptions(environment),
  }));
  app.get("/authorize", (req, res) => {
    req.session.mcpOauthPending = {
      responseType: "code", clientId: "unit", redirectUri: "https://claude.ai/api/mcp/auth_callback",
      state: "unit-state", codeChallenge: "a".repeat(43), codeChallengeMethod: "S256",
    };
    res.redirect("/api/auth/google");
  });
  app.get("/api/auth/google/callback", (req, res) => {
    res.json({ pendingPreserved: req.session.mcpOauthPending?.state === "unit-state" });
  });
  app.use((_req, res) => {
    res.set("WWW-Authenticate", 'Bearer resource_metadata="https://mitometro.com.br/.well-known/oauth-protected-resource"');
    res.status(401).json({ error: "OAuth required" });
  });
  const server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  production = await listen("production");
  development = await listen("development");
});
afterAll(async () => { await Promise.all(servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve())))); });

test("production refuses to start without an explicit origin allowlist", () => {
  expect(() => createBrowserCors("production", "")).toThrow("ALLOWED_ORIGINS");
});
test.each(["*", "https://*.example.com", "null", "https://example.com/path", "https://u:p@example.com"])(
  "rejects unsafe origin configuration %s", (origin) => {
    expect(() => createBrowserCors("production", origin)).toThrow("ALLOWED_ORIGINS");
  },
);
test("development keeps unrestricted CORS even without ALLOWED_ORIGINS", () => {
  expect(() => createBrowserCors("development", "")).not.toThrow();
});
test.each(["https://mitometro.com.br", "https://claude.ai"])(
  "allows %s and exposes the MCP discovery header", async (origin) => {
    const response = await fetch(`${production}/api/mcp`, { headers: { Origin: origin } });
    expect(response.status).toBe(401);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-expose-headers")).toContain("WWW-Authenticate");
    expect(response.headers.get("www-authenticate")).toContain("resource_metadata");
    expect(response.headers.get("vary")).toContain("Origin");
  },
);
test.each(["https://evil.example", "https://mitometro.com.br.evil.example", "null"])(
  "blocks the untrusted origin %s", async (origin) => {
    const response = await fetch(`${production}/api/mcp`, { headers: { Origin: origin } });
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  },
);
test("native clients without Origin still receive OAuth discovery", async () => {
  const response = await fetch(`${production}/api/mcp`);
  expect(response.status).toBe(401);
  expect(response.headers.get("www-authenticate")).toContain("resource_metadata");
});
test("allowed MCP preflight supports Authorization, JSON and protocol headers", async () => {
  const response = await fetch(`${production}/api/mcp`, {
    method: "OPTIONS",
    headers: { Origin: "https://claude.ai", "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type,mcp-protocol-version" },
  });
  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
  expect(response.headers.get("access-control-allow-headers")).toContain("mcp-protocol-version");
});
test("blocked preflight never reaches the handler", async () => {
  expect((await fetch(`${production}/api/mcp`, {
    method: "OPTIONS", headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" },
  })).status).toBe(403);
});
test("admin preflight still requires authentication rather than short-circuiting to 204", async () => {
  expect((await fetch(`${production}/api/admin/users`, {
    method: "OPTIONS", headers: { Origin: "https://mitometro.com.br", "Access-Control-Request-Method": "GET" },
  })).status).toBe(401);
});
test("secure production cookie preserves pending MCP authorization across a Google callback", async () => {
  const response = await fetch(`${production}/authorize`, {
    redirect: "manual", headers: { "X-Forwarded-Proto": "https" },
  });
  const cookie = response.headers.get("set-cookie") ?? "";
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("SameSite=Lax");
  expect(cookie).toContain("; Secure");
  const callback = await fetch(`${production}/api/auth/google/callback`, {
    headers: { Cookie: cookie.split(";")[0]!, "X-Forwarded-Proto": "https" },
  });
  expect(await callback.json()).toEqual({ pendingPreserved: true });
});
test("production does not issue the secure cookie over plain HTTP", async () => {
  const response = await fetch(`${production}/authorize`, { redirect: "manual" });
  expect(response.headers.get("set-cookie")).toBeNull();
});
test("development retains insecure cookies and wildcard CORS", async () => {
  const response = await fetch(`${development}/authorize`, {
    redirect: "manual", headers: { Origin: "https://any.example" },
  });
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(response.headers.get("set-cookie")).not.toContain("; Secure");
});
