#!/usr/bin/env node
/**
 * Servidor MCP do Mitometro.
 *
 * Expõe dados e o otimizador do Mitometro (Cartola FC) como ferramentas MCP
 * para assistentes de IA (Claude Desktop, Cursor, etc.) via transporte stdio.
 *
 * Todas as ferramentas chamam a API HTTP existente do api-server — nenhuma
 * lógica de negócio é duplicada aqui.
 *
 * Configuração via env:
 *   MITOMETRO_API_URL       — base da API (default: http://localhost:80/api)
 *   MITOMETRO_SESSION_TOKEN — cookie de sessão opcional para endpoints Pro
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = (process.env["MITOMETRO_API_URL"] ?? "http://localhost:80/api").replace(/\/$/, "");
const SESSION_TOKEN = process.env["MITOMETRO_SESSION_TOKEN"];

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (SESSION_TOKEN) headers["Cookie"] = `connect.sid=${SESSION_TOKEN}`;

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
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

async function getCurrentRound(): Promise<number> {
  const r = await api<{ round: number }>("/round/current");
  return r.round ?? 1;
}

// ── Server ────────────────────────────────────────────────────────────────────

const server = new McpServer({ name: "mitometro", version: "0.1.0" });

const POSITIONS = ["GOL", "ZAG", "LAT", "MEI", "ATA", "TEC"] as const;

// ── get_round_projections ─────────────────────────────────────────────────────

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
      limit: z.number().int().min(1).max(30).default(10).describe("Quantidade de jogadores (1-30)"),
    },
  },
  async ({ round, position, min_price, max_price, limit }) => {
    try {
      const effectiveRound = round ?? (await getCurrentRound());
      const data = await api<{
        round: number;
        isClosed: boolean;
        players: Array<{
          name: string; nickname: string | null; position: string; price: number | null;
          expectedPoints: number; playProbability: number | null; popularity: number;
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
          popularityPct: Math.round((p.popularity ?? 0) * 100),
          isDifferencial: p.isDifferencial,
          isTrap: p.isTrap,
          ...(p.actualPoints !== undefined && { actualPoints: p.actualPoints }),
        })),
      });
    } catch (err) {
      return fail(err);
    }
  }
);

// ── generate_lineup ───────────────────────────────────────────────────────────

server.registerTool(
  "generate_lineup",
  {
    title: "Gerar escalação otimizada",
    description:
      "Gera a escalação otimizada do Mitometro para o Cartola FC usando o otimizador ILP com as " +
      "projeções da rodada. Sem token Pro configurado, apenas a estratégia 'safe' está disponível " +
      "(as demais retornam erro 402). Estratégias: safe (segura), aggressive (teto alto), " +
      "cost-benefit (custo-benefício), antimassa (diferenciais), valorizacao (valorização).",
    inputSchema: {
      budget: z.number().min(1).max(300).default(100).describe("Orçamento em cartoletas (default 100)"),
      formation: z.string().default("4-4-2").describe("Formação tática, ex: 4-4-2, 4-3-3, 3-5-2"),
      strategy: z
        .enum(["safe", "aggressive", "cost-benefit", "antimassa", "valorizacao"])
        .default("safe")
        .describe("Estratégia de escalação (apenas 'safe' sem plano Pro)"),
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
  }
);

// ── get_player_details ────────────────────────────────────────────────────────

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
  }
);

// ── list_matches ──────────────────────────────────────────────────────────────

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
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[mitometro-mcp] pronto — API: ${API_BASE}`);
