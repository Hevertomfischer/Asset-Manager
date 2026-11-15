import express from "express";
import session from "express-session";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[][], inserted: [] as { table: unknown; values: Record<string, unknown> }[],
  where: vi.fn(), failSelect: false,
}));
vi.mock("@workspace/db", () => ({ db: {
  select: () => ({ from: () => ({ where: (condition: unknown) => {
    mocks.where(condition);
    return { limit: async () => {
      if (mocks.failSelect) throw new Error("DB unavailable");
      return mocks.rows.shift() ?? [];
    } };
  } }) }),
  insert: (table: unknown) => ({ values: async (values: Record<string, unknown>) => { mocks.inserted.push({ table, values }); } }),
  update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ id: 1 }] }) }) }),
} }));
vi.mock("../services/accessService", () => ({ isPro: async () => true }));
vi.mock("../lib/logger", () => ({ createLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) }));
import router, { validateMcpBearerToken } from "../routes/mcpOauth";
import { mcpAccessTokensTable } from "@workspace/db/schema";
import { hashMcpAccessToken, isS256Challenge, verifyS256Pkce } from "../lib/mcpTokenSecurity";

// Public RFC 7636 Appendix B vector, not a real account credential.
const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
const redirectUri = "https://claude.ai/api/mcp/auth_callback";
const dialect = new PgDialect();
let server: Server;
let origin: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(session({ secret: "unit-test-only", resave: false, saveUninitialized: false }));
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => req.get("X-Unit-Authenticated") === "yes") as typeof req.isAuthenticated;
    if (req.isAuthenticated()) req.user = { id: 42, email: "unit@example.test", name: "Unit", avatarUrl: null, role: "user" };
    next();
  });
  // Unit harness only, never mounted in the application.
  app.post("/seed-legacy-pending", (req, res) => {
    req.session.mcpOauthPending = {
      responseType: "code", clientId: "claude", redirectUri, state: "test-state",
      codeChallenge: challenge, codeChallengeMethod: "plain",
    };
    res.json({ ok: true });
  });
  app.use(router);
  await new Promise<void>((resolve) => { server = app.listen(0, "127.0.0.1", () => resolve()); });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
beforeEach(() => { mocks.rows = []; mocks.inserted = []; mocks.failSelect = false; vi.clearAllMocks(); });

function authorize(method?: string) {
  const query = new URLSearchParams({ response_type: "code", client_id: "claude", redirect_uri: redirectUri,
    code_challenge: challenge, state: "test-state" });
  if (method !== undefined) query.set("code_challenge_method", method);
  return `${origin}/authorize?${query}`;
}
function tokenBody() {
  return { grant_type: "authorization_code", code: "unit-code", code_verifier: verifier,
    redirect_uri: redirectUri, client_id: "mcp_unit" };
}
function authCode(method = "S256") {
  return { id: 1, userId: 42, clientId: "mcp_unit", redirectUri, codeChallenge: challenge, codeChallengeMethod: method };
}

test("SHA-256 stores a deterministic digest, never the bearer value", () => {
  expect(hashMcpAccessToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
test("RFC 7636 S256 vector is accepted", () => {
  expect(isS256Challenge(challenge, "S256")).toBe(true);
  expect(verifyS256Pkce(verifier, challenge, "S256")).toBe(true);
});
test.each(["plain", "S512", ""])("PKCE method %s never validates", (method) => {
  expect(verifyS256Pkce(verifier, verifier, method)).toBe(false);
});
test.each(["short", "a".repeat(129), `${verifier}!`])("rejects invalid verifier %s", (value) => {
  expect(verifyS256Pkce(value, challenge, "S256")).toBe(false);
});
test.each(["plain", "S512", undefined])("authorize rejects method %s before login", async (method) => {
  const response = await fetch(authorize(method), { redirect: "manual" });
  expect(response.status).toBe(400);
  expect(mocks.where).not.toHaveBeenCalled();
});
test("S256 preserves pending authorization before the Google redirect", async () => {
  const response = await fetch(authorize("S256"), { redirect: "manual" });
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe("/api/auth/google?next=mcp");
  expect(response.headers.get("set-cookie")).toContain("connect.sid");
});
test.each(["GET", "POST"])("rejects a legacy plain session on %s /authorize", async (method) => {
  const seed = await fetch(`${origin}/seed-legacy-pending`, { method: "POST" });
  const response = await fetch(`${origin}/authorize`, {
    method, headers: { Cookie: seed.headers.get("set-cookie")!.split(";")[0]!, "X-Unit-Authenticated": "yes" },
  });
  expect(response.status).toBe(400);
  expect(mocks.inserted).toHaveLength(0);
});
test("token exchange returns the bearer once but inserts only its hash", async () => {
  mocks.rows.push([authCode()]);
  const response = await fetch(`${origin}/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(tokenBody()),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json() as { access_token: string; token_type: string };
  expect(body.access_token).toMatch(/^[a-f0-9]{96}$/);
  expect(body.token_type).toBe("Bearer");
  const stored = mocks.inserted.find((entry) => entry.table === mcpAccessTokensTable)!.values;
  expect(stored.tokenHash).toBe(hashMcpAccessToken(body.access_token));
  expect(stored).not.toHaveProperty("token");
});
test("old plain auth codes cannot be exchanged", async () => {
  mocks.rows.push([authCode("plain")]);
  const response = await fetch(`${origin}/token`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tokenBody()),
  });
  expect(response.status).toBe(400);
  expect(mocks.inserted).toHaveLength(0);
});
test("wrong S256 verifier cannot be exchanged", async () => {
  mocks.rows.push([authCode()]);
  const response = await fetch(`${origin}/token`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...tokenBody(), code_verifier: "a".repeat(43) }),
  });
  expect(response.status).toBe(400);
  expect(mocks.inserted).toHaveLength(0);
});
test("bearer lookup uses the hash and requires an unexpired row", async () => {
  const bearer = "unit-test-bearer";
  mocks.rows.push([{ userId: 42 }]);
  expect(await validateMcpBearerToken(bearer)).toBe(42);
  const query = dialect.sqlToQuery(mocks.where.mock.calls[0]![0]);
  expect(query.sql).toContain('"token_hash" =');
  expect(query.sql).toContain('"expires_at" >');
  expect(query.params[0]).toBe(hashMcpAccessToken(bearer));
  expect(query.params).not.toContain(bearer);
});
test("missing tokens and database errors fail closed", async () => {
  expect(await validateMcpBearerToken("missing")).toBeNull();
  mocks.failSelect = true;
  expect(await validateMcpBearerToken("missing")).toBeNull();
});
