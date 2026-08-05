/**
 * OAuth 2.0 Authorization Server para o MCP remoto do Mitometro.
 *
 * Endpoints montados FORA do prefixo /api para que o Claude Desktop
 * (e qualquer cliente MCP moderno) consiga descobri-los via metadados.
 *
 *   GET  /.well-known/oauth-authorization-server  — RFC 8414 discovery
 *   GET  /authorize                               — tela de consentimento / login
 *   POST /authorize                               — processa decisão do usuário
 *   POST /token                                   — troca code por access_token (PKCE)
 */

import { Router, type Request, type Response } from "express";
import { createHash, randomBytes } from "crypto";
import { db } from "@workspace/db";
import { mcpAuthCodesTable, mcpAccessTokensTable } from "@workspace/db/schema";
import { eq, and, gt, lt } from "drizzle-orm";
import { isPro } from "../services/accessService";
import { createLogger } from "../lib/logger";

// ── Allowlist de redirect_uri / clients ───────────────────────────────────────
// Claude Desktop usa sempre https://claude.ai/api/mcp/auth_callback.
// Adicione URIs extras via MCP_ALLOWED_REDIRECT_URIS (comma-separated).
// NUNCA aceitar redirect_uri arbitrário — vetor de exfiltração de auth code.

function getAllowedRedirectUris(): Set<string> {
  const uris = new Set(["https://claude.ai/api/mcp/auth_callback"]);
  const extra = process.env["MCP_ALLOWED_REDIRECT_URIS"];
  if (extra) {
    for (const u of extra.split(",").map((s) => s.trim()).filter(Boolean)) {
      uris.add(u);
    }
  }
  return uris;
}

const log = createLogger("mcp-oauth");

// ── Configuração ──────────────────────────────────────────────────────────────

const CODE_TTL_MS = 5 * 60 * 1000;         // 5 minutos
const TOKEN_TTL_S = parseInt(process.env["MCP_TOKEN_TTL_SECONDS"] ?? "3600", 10);
const TOKEN_TTL_MS = TOKEN_TTL_S * 1000;

// ── Utilitários ───────────────────────────────────────────────────────────────

function buildIssuer(req: Request): string {
  if (process.env["APP_URL"]) return process.env["APP_URL"].replace(/\/$/, "");
  if (process.env["REPLIT_DEV_DOMAIN"]) return `https://${process.env["REPLIT_DEV_DOMAIN"]}`;
  const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "localhost";
  return `${proto}://${host}`;
}

/** base64url sem padding — padrão exigido pelo PKCE (RFC 7636). */
function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/** Verifica code_verifier contra code_challenge armazenado. */
function verifyPkce(codeVerifier: string, codeChallenge: string, method: string): boolean {
  if (method === "S256") {
    const digest = base64url(createHash("sha256").update(codeVerifier).digest());
    return digest === codeChallenge;
  }
  // plain (não recomendado, mas parte do spec)
  return codeVerifier === codeChallenge;
}

// ── Limpeza periódica de registros expirados ──────────────────────────────────

setInterval(async () => {
  const now = new Date();
  try {
    await db.delete(mcpAuthCodesTable).where(lt(mcpAuthCodesTable.expiresAt, now));
    await db.delete(mcpAccessTokensTable).where(lt(mcpAccessTokensTable.expiresAt, now));
  } catch {
    // silencioso — falha não crítica
  }
}, 10 * 60 * 1000); // a cada 10 min

// ── HTML da tela de consentimento ─────────────────────────────────────────────

function consentHtml(params: {
  userName: string | null;
  userEmail: string;
  clientId: string;
}): string {
  const { userName, userEmail, clientId } = params;
  const displayName = userName ?? userEmail;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Autorizar acesso — Mitometro</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #f1f5f9;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1rem;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 1rem;
      padding: 2rem;
      max-width: 420px;
      width: 100%;
      text-align: center;
    }
    .logo { font-size: 2rem; margin-bottom: 0.5rem; }
    h1 { font-size: 1.25rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.25rem; }
    .subtitle { font-size: 0.875rem; color: #94a3b8; margin-bottom: 1.5rem; }
    .scope-box {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 0.5rem;
      padding: 1rem;
      text-align: left;
      margin-bottom: 1.5rem;
    }
    .scope-box p { font-size: 0.8rem; color: #64748b; margin-bottom: 0.5rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    .scope-item { display: flex; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.4rem; }
    .scope-item .icon { color: #22c55e; font-size: 0.875rem; flex-shrink: 0; margin-top: 0.1rem; }
    .scope-item span { font-size: 0.875rem; color: #cbd5e1; }
    .account {
      font-size: 0.8rem;
      color: #64748b;
      margin-bottom: 1.5rem;
    }
    .account strong { color: #94a3b8; }
    .client-id {
      font-size: 0.75rem;
      color: #475569;
      background: #0f172a;
      border-radius: 0.25rem;
      padding: 0.2rem 0.5rem;
      display: inline-block;
      margin-bottom: 1.5rem;
      word-break: break-all;
    }
    .actions { display: flex; gap: 0.75rem; }
    button {
      flex: 1;
      padding: 0.75rem;
      border-radius: 0.5rem;
      border: none;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    button:hover { opacity: 0.85; }
    .btn-allow { background: #16a34a; color: #fff; }
    .btn-deny  { background: #1e293b; color: #94a3b8; border: 1px solid #334155; }
    form { display: contents; }
    .warning { font-size: 0.75rem; color: #64748b; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">⚽</div>
    <h1>Mitometro</h1>
    <p class="subtitle">Solicitação de acesso ao Claude</p>

    <div class="scope-box">
      <p>Permissões solicitadas</p>
      <div class="scope-item"><span class="icon">✓</span><span>Ver projeções de pontuação da rodada atual</span></div>
      <div class="scope-item"><span class="icon">✓</span><span>Gerar escalações otimizadas (usa seu plano)</span></div>
      <div class="scope-item"><span class="icon">✓</span><span>Consultar detalhes e histórico de jogadores</span></div>
      <div class="scope-item"><span class="icon">✓</span><span>Listar confrontos e análises da rodada</span></div>
    </div>

    <p class="account">Conectado como <strong>${escapeHtml(displayName)}</strong></p>
    <div class="client-id">Cliente: ${escapeHtml(clientId)}</div>

    <div class="actions">
      <form method="POST" action="/authorize">
        <button type="submit" name="decision" value="deny" class="btn-deny">Negar</button>
      </form>
      <form method="POST" action="/authorize">
        <button type="submit" name="decision" value="allow" class="btn-allow">Permitir acesso</button>
      </form>
    </div>
    <p class="warning">Você pode revogar o acesso a qualquer momento fazendo logout e reconectando.</p>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Router ────────────────────────────────────────────────────────────────────

const mcpOauthRouter = Router();

// ── GET /.well-known/oauth-authorization-server ───────────────────────────────

mcpOauthRouter.get("/.well-known/oauth-authorization-server", (req: Request, res: Response) => {
  const issuer = buildIssuer(req);
  res.json({
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

// ── GET /authorize ────────────────────────────────────────────────────────────

mcpOauthRouter.get("/authorize", (req: Request, res: Response) => {
  const q = req.query as Record<string, string | undefined>;
  const fromQuery = q["response_type"] != null;

  // ── Resolve parâmetros: query (request inicial) OU sessão (retorno do Google login) ──
  // Após o Google login o callback redireciona para /authorize SEM query params;
  // nesse caso retomamos os parâmetros salvos em req.session.mcpOauthPending.
  let responseType: string;
  let redirectUri: string;
  let codeChallenge: string;
  let codeChallengeMethod: string;
  let clientId: string;
  let state: string | undefined;

  if (fromQuery) {
    // Requisição inicial com todos os parâmetros OAuth
    responseType = q["response_type"] ?? "";
    redirectUri = q["redirect_uri"] ?? "";
    codeChallenge = q["code_challenge"] ?? "";
    codeChallengeMethod = q["code_challenge_method"] ?? "S256";
    clientId = q["client_id"] ?? "claude";
    state = q["state"];

    // Validações obrigatórias
    if (responseType !== "code") {
      res.status(400).send("response_type deve ser 'code'");
      return;
    }
    if (!redirectUri) {
      res.status(400).send("redirect_uri é obrigatório");
      return;
    }
    if (!codeChallenge) {
      res.status(400).send("code_challenge é obrigatório (PKCE)");
      return;
    }
    if (codeChallengeMethod !== "S256" && codeChallengeMethod !== "plain") {
      res.status(400).send("code_challenge_method não suportado");
      return;
    }

    // Valida redirect_uri contra allowlist (previne exfiltração de auth code)
    const allowedUris = getAllowedRedirectUris();
    if (!allowedUris.has(redirectUri)) {
      log.warn("MCP OAuth /authorize: redirect_uri não permitido", { redirect_uri: redirectUri });
      res.status(400).send("redirect_uri não permitido. Apenas clientes registrados são aceitos.");
      return;
    }

    // Salva na sessão para sobreviver ao redirect do Google login
    req.session.mcpOauthPending = {
      responseType,
      clientId,
      redirectUri,
      state,
      codeChallenge,
      codeChallengeMethod,
    };
  } else {
    // Retorno pós-Google-login: retoma parâmetros da sessão
    const pending = req.session.mcpOauthPending;
    if (!pending) {
      res.status(400).send("Parâmetros OAuth ausentes ou sessão expirada. Inicie o fluxo novamente.");
      return;
    }
    responseType = pending.responseType;
    redirectUri = pending.redirectUri;
    codeChallenge = pending.codeChallenge;
    codeChallengeMethod = pending.codeChallengeMethod;
    clientId = pending.clientId;
    state = pending.state;
  }

  // Se não autenticado → redireciona para o Google login (preserva params na sessão)
  if (!req.isAuthenticated() || !req.user) {
    log.info("MCP OAuth: usuário não autenticado — redirecionando para Google login");
    res.redirect("/api/auth/google?next=mcp");
    return;
  }

  // Autenticado → mostra tela de consentimento
  const html = consentHtml({
    userName: req.user.name,
    userEmail: req.user.email,
    clientId,
  });
  res.set("Content-Type", "text/html; charset=utf-8").send(html);
});

// ── POST /authorize (decisão de consentimento) ────────────────────────────────

mcpOauthRouter.post("/authorize", async (req: Request, res: Response) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).send("Não autenticado");
    return;
  }

  const pending = req.session.mcpOauthPending;
  if (!pending) {
    res.status(400).send("Sessão OAuth expirada ou inválida. Inicie o fluxo novamente.");
    return;
  }

  const { decision } = req.body as { decision?: string };
  const { redirectUri, state, codeChallenge, codeChallengeMethod, clientId } = pending;

  // Constrói a URL de redirect base
  const redirectBase = redirectUri.includes("?") ? redirectUri : redirectUri;
  const addParam = (url: string, key: string, value: string) =>
    url + (url.includes("?") ? "&" : "?") + `${key}=${encodeURIComponent(value)}`;

  // Acesso negado
  if (decision !== "allow") {
    log.info("MCP OAuth: acesso negado pelo usuário", { userId: req.user.id });
    delete req.session.mcpOauthPending;
    let url = addParam(redirectBase, "error", "access_denied");
    if (state) url = addParam(url, "state", state);
    res.redirect(url);
    return;
  }

  // Gera authorization code
  const code = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  try {
    await db.insert(mcpAuthCodesTable).values({
      code,
      userId: req.user.id,
      codeChallenge,
      codeChallengeMethod,
      redirectUri,
      state: state ?? null,
      expiresAt,
    });

    delete req.session.mcpOauthPending;

    log.info("MCP OAuth: authorization code emitido", { userId: req.user.id, clientId });

    let url = addParam(redirectBase, "code", code);
    if (state) url = addParam(url, "state", state);
    res.redirect(url);
  } catch (err) {
    log.error("MCP OAuth: erro ao salvar auth code", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).send("Erro interno ao processar autorização.");
  }
});

// ── POST /token ───────────────────────────────────────────────────────────────

mcpOauthRouter.post("/token", async (req: Request, res: Response) => {
  // Aceita application/json E application/x-www-form-urlencoded
  const body = req.body as Record<string, string | undefined>;

  const { grant_type, code, redirect_uri, code_verifier } = body;

  res.set("Cache-Control", "no-store");
  res.set("Pragma", "no-cache");

  if (grant_type !== "authorization_code") {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }
  if (!code) {
    res.status(400).json({ error: "invalid_request", error_description: "code é obrigatório" });
    return;
  }
  if (!code_verifier) {
    res.status(400).json({ error: "invalid_request", error_description: "code_verifier é obrigatório" });
    return;
  }

  try {
    const now = new Date();

    // Busca o auth code no banco
    const [authCode] = await db
      .select()
      .from(mcpAuthCodesTable)
      .where(
        and(
          eq(mcpAuthCodesTable.code, code),
          eq(mcpAuthCodesTable.used, false),
          gt(mcpAuthCodesTable.expiresAt, now),
        )
      )
      .limit(1);

    if (!authCode) {
      log.warn("MCP OAuth /token: code inválido, expirado ou já usado");
      res.status(400).json({ error: "invalid_grant" });
      return;
    }

    // Valida redirect_uri
    if (redirect_uri && authCode.redirectUri !== redirect_uri) {
      log.warn("MCP OAuth /token: redirect_uri não coincide", {
        stored: authCode.redirectUri,
        provided: redirect_uri,
      });
      res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri não coincide" });
      return;
    }

    // Verifica PKCE
    if (!verifyPkce(code_verifier, authCode.codeChallenge, authCode.codeChallengeMethod)) {
      log.warn("MCP OAuth /token: verificação PKCE falhou", { userId: authCode.userId });
      res.status(400).json({ error: "invalid_grant", error_description: "code_verifier inválido" });
      return;
    }

    // Marca o code como usado (atômico — evita reuse)
    const updated = await db
      .update(mcpAuthCodesTable)
      .set({ used: true })
      .where(and(eq(mcpAuthCodesTable.code, code), eq(mcpAuthCodesTable.used, false)))
      .returning({ id: mcpAuthCodesTable.id });

    if (updated.length === 0) {
      // Corrida — outro request usou o code primeiro
      res.status(400).json({ error: "invalid_grant" });
      return;
    }

    // Gera access token
    const token = randomBytes(48).toString("hex");
    const tokenExpiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await db.insert(mcpAccessTokensTable).values({
      token,
      userId: authCode.userId,
      expiresAt: tokenExpiresAt,
    });

    // Determina se o usuário tem Pro para incluir no scope
    const pro = await isPro(authCode.userId).catch(() => false);

    log.info("MCP OAuth /token: access token emitido", { userId: authCode.userId, pro });

    res.json({
      access_token: token,
      token_type: "Bearer",
      expires_in: TOKEN_TTL_S,
      scope: pro ? "mcp:read mcp:pro" : "mcp:read",
    });
  } catch (err) {
    log.error("MCP OAuth /token: erro interno", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "server_error" });
  }
});

// ── Utilitário exportado: valida Bearer token e retorna userId ────────────────

export async function validateMcpBearerToken(token: string): Promise<number | null> {
  try {
    const now = new Date();
    const [row] = await db
      .select({ userId: mcpAccessTokensTable.userId })
      .from(mcpAccessTokensTable)
      .where(
        and(
          eq(mcpAccessTokensTable.token, token),
          gt(mcpAccessTokensTable.expiresAt, now),
        )
      )
      .limit(1);
    return row?.userId ?? null;
  } catch {
    return null;
  }
}

export default mcpOauthRouter;
