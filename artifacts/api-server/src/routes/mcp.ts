/**
 * Endpoint MCP remoto do Mitometro — Streamable HTTP Transport
 *
 * Expõe as mesmas 4 ferramentas do servidor stdio em um endpoint HTTP
 * acessível de qualquer cliente MCP sem instalação local.
 *
 * Montado em /mcp (fora do prefixo /api para o protocolo MCP tomar conta).
 *
 * Proteção:
 *   - Rate limit: 30 req/min por IP (configurable via MCP_RATE_LIMIT env)
 *   - Token opcional: MCP_ACCESS_TOKEN env (se definido, exige Authorization: Bearer <token>)
 *
 * Sessão Pro:
 *   - Se MCP_ACCESS_TOKEN não estiver definido, Authorization: Bearer <connect.sid>
 *     é encaminhado para os endpoints internos, habilitando estratégias Pro.
 *   - Se MCP_ACCESS_TOKEN estiver definido, use MCP_PRO_SESSION para sessão Pro.
 */

import { Router, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { createLogger } from "../lib/logger";
import { validateMcpBearerToken } from "./mcpOauth";
import { signInternalUserId } from "../lib/mcpInternalAuth";

const log = createLogger("mcp-http");

// ── Rate limiting ─────────────────────────────────────────────────────────────

const RATE_LIMIT = parseInt(process.env["MCP_RATE_LIMIT"] ?? "30", 10);
const RATE_WINDOW_MS = 60_000;

const rateMap = new Map<string, { count: number; resetAt: number }>();

function checkRate(ip: string): boolean {
  const now = Date.now();
  let e = rateMap.get(ip);
  if (!e || e.resetAt < now) {
    e = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateMap.set(ip, e);
  }
  e.count++;
  return e.count <= RATE_LIMIT;
}

// Limpa entradas antigas a cada 5 min para não vazar memória
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateMap) if (v.resetAt < now) rateMap.delete(k);
}, 5 * 60_000);

// ── Auth config ───────────────────────────────────────────────────────────────

const MCP_TOKEN = process.env["MCP_ACCESS_TOKEN"];
const MCP_PRO_SESSION = process.env["MCP_PRO_SESSION"];

// ── Helpers para chamar a API interna ─────────────────────────────────────────

function internalApiBase(): string {
  const port = process.env["PORT"] ?? "80";
  return `http://localhost:${port}/api`;
}

async function callApi<T>(
  path: string,
  sessionCookie: string | undefined,
  mcpUserId?: number,
  init?: RequestInit,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (sessionCookie) {
    headers["Cookie"] = `connect.sid=${sessionCookie}`;
  } else if (mcpUserId) {
    // Propagação interna de identidade para requests sem cookie de sessão
    headers["X-Mcp-Internal-User"] = signInternalUserId(mcpUserId);
  }

  const url = `${internalApiBase()}${path}`;
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Resposta não-JSON da API (${res.status}) em ${path}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg = (body as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw new Error(`${msg} (${path})`);
  }
  return body as T;
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return { isError: true, content: [{ type: "text" as const, text: `Erro: ${msg}` }] };
}

// ── Criação do McpServer com as 4 ferramentas ─────────────────────────────────

const POSITIONS = ["GOL", "ZAG", "LAT", "MEI", "ATA", "TEC"] as const;

function buildMcpServer(sessionCookie: string | undefined, mcpUserId?: number): McpServer {
  const server = new McpServer({ name: "mitometro", version: "0.1.0" });

  // Closure que injeta automaticamente identidade (sessionCookie OU mcpUserId) em
  // todas as chamadas internas à API — garante que Pro checks funcionam via OAuth.
  const api = <T>(path: string, init?: RequestInit): Promise<T> =>
    callApi<T>(path, sessionCookie, mcpUserId, init);

  // ── get_round_projections ───────────────────────────────────────────────────
  server.registerTool(
    "get_round_projections",
    {
      title: "Projeções da rodada",
      description:
        "Retorna as melhores projeções de pontuação do Mitometro para uma rodada do Cartola FC, " +
        "ordenadas da maior para a menor. Aceita filtros por posição (GOL, ZAG, LAT, MEI, ATA, TEC) " +
        "e faixa de preço em cartoletas. Se a rodada não for informada, usa a rodada atual.",
      inputSchema: {
        round: z.number().int().min(1).max(38).optional().describe("Número da rodada (default: rodada atual)"),
        position: z.enum(POSITIONS).optional().describe("Filtrar por posição"),
        min_price: z.number().optional().describe("Preço mínimo em cartoletas"),
        max_price: z.number().optional().describe("Preço máximo em cartoletas"),
        limit: z.number().int().min(1).max(30).default(10).describe("Quantidade de jogadores (1–30)"),
      },
    },
    async ({ round, position, min_price, max_price, limit }) => {
      try {
        let effectiveRound = round;
        if (!effectiveRound) {
          const r = await api<{ round: number }>("/round/current");
          effectiveRound = r.round ?? 1;
        }

        const data = await api<{
          round: number;
          isClosed: boolean;
          players: Array<{
            name: string; nickname: string | null; position: string; price: number | null;
            expectedPoints: number; playProbability: number | null; popularity: number | null;
            isDifferencial: boolean; isTrap: boolean; slug: string;
            club: { abbreviation: string | null; name: string | null };
            actualPoints?: number | null;
          }>;
        }>(`/stats/rodada/${effectiveRound}`);

        let players = data.players;
        if (position) players = players.filter((p) => p.position === position);
        if (min_price != null) players = players.filter((p) => (p.price ?? 0) >= min_price);
        if (max_price != null) players = players.filter((p) => (p.price ?? Infinity) <= max_price);

        return ok({
          round: data.round,
          isClosed: data.isClosed,
          players: players.slice(0, limit ?? 10).map((p) => ({
            name: p.nickname ?? p.name,
            slug: p.slug,
            position: p.position,
            club: p.club?.abbreviation ?? p.club?.name ?? null,
            price: p.price,
            expectedPoints: p.expectedPoints,
            playProbability: p.playProbability,
            popularityPct: p.popularity == null ? null : Math.round(p.popularity * 100),
            isDifferencial: p.isDifferencial,
            isTrap: p.isTrap,
            ...(p.actualPoints !== undefined && { actualPoints: p.actualPoints }),
          })),
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ── generate_lineup ─────────────────────────────────────────────────────────
  server.registerTool(
    "generate_lineup",
    {
      title: "Gerar escalação otimizada",
      description:
        "Gera a escalação otimizada do Mitometro para o Cartola FC usando o otimizador ILP com as " +
        "projeções da rodada. Sem sessão Pro configurada, apenas a estratégia 'safe' está disponível " +
        "(as demais retornam erro 402). Estratégias: safe (segura), aggressive (teto alto), " +
        "cost-benefit (custo-benefício), antimassa (diferenciais), valorizacao (valorização).",
      inputSchema: {
        budget: z.number().min(1).max(300).default(100).describe("Orçamento em cartoletas (default 100)"),
        formation: z.string().default("4-4-2").describe("Formação tática, ex: 4-4-2, 4-3-3, 3-5-2"),
        strategy: z
          .enum(["safe", "aggressive", "cost-benefit", "antimassa", "valorizacao"])
          .default("safe")
          .describe("Estratégia de escalação (apenas 'safe' sem sessão Pro)"),
        round: z.number().int().min(1).max(38).optional().describe("Rodada (default: rodada atual)"),
      },
    },
    async ({ budget, formation, strategy, round }) => {
      try {
        const data = await api<{
          lineup: {
            round: number; formation: string; totalCost: number; expectedPoints: number;
            captainPlayerId: number | null;
            players: Array<{
              playerId: number; nickname: string | null; name: string; position: string;
              clubAbbr: string | null; price: number | null; expectedPoints: number | null;
              isCaptain: boolean;
            }>;
            reserves: Array<{
              nickname: string | null; name: string; position: string; clubAbbr: string | null;
              price: number | null; expectedPoints: number | null;
            }>;
          };
        }>("/lineup/generate", {
          method: "POST",
          body: JSON.stringify({ budget, formation, strategy, round }),
        });

        const l = data.lineup;
        return ok({
          round: l.round,
          formation: l.formation,
          totalCost: l.totalCost,
          expectedPoints: l.expectedPoints,
          players: l.players.map((p) => ({
            name: p.nickname ?? p.name,
            position: p.position,
            club: p.clubAbbr,
            price: p.price,
            expectedPoints: p.expectedPoints,
            captain: p.isCaptain,
          })),
          reserves: l.reserves.map((r) => ({
            name: r.nickname ?? r.name,
            position: r.position,
            club: r.clubAbbr,
            price: r.price,
            expectedPoints: r.expectedPoints,
          })),
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ── get_player_details ──────────────────────────────────────────────────────
  server.registerTool(
    "get_player_details",
    {
      title: "Detalhes de um jogador",
      description:
        "Retorna o histórico público de um jogador no Mitometro: projeções por rodada vs pontuação " +
        "real, médias e tendência. Use o slug no formato 'nome-id' (ex: 'pedro-12345'). O slug de " +
        "cada jogador aparece no resultado de get_round_projections.",
      inputSchema: {
        slug: z.string().describe("Slug do jogador no formato nome-id, ex: 'arias-38908'"),
      },
    },
    async ({ slug }) => {
      try {
        const data = await api<unknown>(`/stats/jogador/${encodeURIComponent(slug)}`);
        return ok(data);
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ── list_matches ────────────────────────────────────────────────────────────
  server.registerTool(
    "list_matches",
    {
      title: "Confrontos da rodada",
      description:
        "Lista os confrontos da rodada atual do Brasileirão com análise do Mitometro: força de " +
        "ataque/defesa de cada clube, expectativa de gols (xG), dificuldade (fácil/médio/difícil) e " +
        "posições recomendadas para escalar de cada lado.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await api<{
          round: number;
          confrontos: Array<{
            matchDate: string | null; stadium: string | null;
            homeClub: { name: string | null; abbreviation: string | null } | null;
            awayClub: { name: string | null; abbreviation: string | null } | null;
            homeXg: number | null; awayXg: number | null;
            homeDifficulty: string; awayDifficulty: string;
            homeStats: { offensiveStrength: number; defensiveStrength: number };
            awayStats: { offensiveStrength: number; defensiveStrength: number };
            recommendedPositionsHome: string[]; recommendedPositionsAway: string[];
          }>;
        }>("/matches/confrontos");

        return ok({
          round: data.round,
          matches: data.confrontos.map((c) => ({
            home: c.homeClub?.abbreviation ?? c.homeClub?.name ?? "?",
            away: c.awayClub?.abbreviation ?? c.awayClub?.name ?? "?",
            date: c.matchDate,
            stadium: c.stadium,
            homeXg: c.homeXg,
            awayXg: c.awayXg,
            homeDifficulty: c.homeDifficulty,
            awayDifficulty: c.awayDifficulty,
            homeStrength: c.homeStats,
            awayStrength: c.awayStats,
            recommendedPositionsHome: c.recommendedPositionsHome,
            recommendedPositionsAway: c.recommendedPositionsAway,
          })),
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  return server;
}

// ── Router ────────────────────────────────────────────────────────────────────

const mcpRouter = Router();

// Middleware: rate limit + auth (suporta OAuth Bearer tokens do AS + token estático legado)
mcpRouter.use("/mcp", async (req: Request, res: Response, next) => {
  const ip = (req.ip ?? req.socket.remoteAddress ?? "unknown").replace(/^::ffff:/, "");

  if (!checkRate(ip)) {
    log.warn("MCP rate limit excedido", { ip });
    res.status(429).json({ error: "Rate limit excedido. Tente novamente em 1 minuto." });
    return;
  }

  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  // Helper: URL base do issuer OAuth para o cabeçalho WWW-Authenticate
  const oauthIssuer =
    process.env["APP_URL"]?.replace(/\/$/, "") ??
    (!process.env["REPLIT_DEPLOYMENT"] && process.env["REPLIT_DEV_DOMAIN"]
      ? `https://${process.env["REPLIT_DEV_DOMAIN"]}`
      : `https://${req.get("x-forwarded-host") ?? req.get("host") ?? "localhost"}`);
  // RFC 9728: resource_metadata aponta para oauth-protected-resource (não oauth-authorization-server)
  // O Claude usa este endpoint para descobrir o AS — deve ser o RFC 9728 document.
  const wwwAuthenticate401 = `Bearer realm="mitometro-mcp", resource_metadata="${oauthIssuer}/.well-known/oauth-protected-resource"`;

  // Prioridade 1: token estático legado (MCP_ACCESS_TOKEN)
  if (MCP_TOKEN) {
    if (bearerToken === MCP_TOKEN) {
      (req as Request & { mcpUserId?: number }).mcpUserId = undefined;
      next();
      return;
    }
    // Token não coincide com o estático — tenta como OAuth token emitido pelo AS
    if (bearerToken) {
      const userId = await validateMcpBearerToken(bearerToken);
      if (userId) {
        (req as Request & { mcpUserId?: number }).mcpUserId = userId;
        next();
        return;
      }
      // Token inválido — inclui discovery header para o Claude saber re-autenticar
      res.set("WWW-Authenticate", `${wwwAuthenticate401}, error="invalid_token"`);
      res.status(401).json({ error: "Token MCP inválido ou ausente." });
      return;
    }
    // Sem token — discovery header garante bootstrap OAuth mesmo em modo legado
    log.warn("MCP auth: sem token", { ip });
    res.set("WWW-Authenticate", wwwAuthenticate401);
    res.status(401).json({ error: "Token MCP ausente." });
    return;
  }

  // Prioridade 2: OAuth Bearer token emitido pelo AS
  if (bearerToken) {
    const userId = await validateMcpBearerToken(bearerToken);
    if (userId) {
      (req as Request & { mcpUserId?: number }).mcpUserId = userId;
      next();
      return;
    }
    // Token inválido/expirado — inclui resource_metadata para o Claude re-descobrir o AS
    res.set("WWW-Authenticate", `${wwwAuthenticate401}, error="invalid_token"`);
    res.status(401).json({ error: "Token inválido ou expirado. Re-autentique via OAuth." });
    return;
  }

  // Sem token — retorna 401 com cabeçalho de discovery para que o Claude Desktop
  // inicie o fluxo OAuth automaticamente
  res.set("WWW-Authenticate", wwwAuthenticate401);
  res.status(401).json({ error: "Autenticação necessária. Use OAuth 2.0." });
});

// Handler: GET (SSE) + POST (JSON-RPC)
mcpRouter.all("/mcp", async (req: Request, res: Response) => {
  const mcpUserId = (req as Request & { mcpUserId?: number }).mcpUserId;

  // Resolve sessão Pro para chamadas internas à API
  // Prioridade: env MCP_PRO_SESSION > userId autenticado via OAuth > sem sessão
  let sessionCookie: string | undefined = MCP_PRO_SESSION;
  if (!sessionCookie && mcpUserId) {
    // Verifica Pro pelo userId do token OAuth — injeta via cookie de sessão ativo se houver,
    // senão usa isPro() direto no buildMcpServer (passado como flag)
    // Para manter compatibilidade com callApi(), precisamos de uma sessão válida.
    // Como não temos o cookie, passamos undefined e deixamos as rotas internas sem auth
    // para endpoints públicos; para generate_lineup (Pro), o isPro() é consultado por dentro.
    sessionCookie = undefined;
  }

  log.debug("MCP request", { method: req.method, mcpUserId: mcpUserId ?? "anon" });

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = buildMcpServer(sessionCookie, mcpUserId);

  try {
    await server.connect(transport);
    await transport.handleRequest(req as never, res as never, req.body);

    res.on("finish", () => {
      server.close().catch(() => {});
    });
  } catch (err) {
    log.error("MCP handler error", { error: err instanceof Error ? err.message : String(err) });
    if (!res.headersSent) {
      res.status(500).json({ error: "Erro interno no servidor MCP." });
    }
  }
});

export default mcpRouter;
