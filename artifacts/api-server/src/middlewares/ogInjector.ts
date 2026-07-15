/**
 * ogInjector — middleware que serve index.html com meta OG injetadas
 * dinamicamente para rotas públicas.
 *
 * Estratégia de substituição:
 *   1. Tenta substituir as tags já existentes no HTML (regex por atributo).
 *   2. Se a tag não existir, insere antes de </head>.
 *   3. Se o arquivo não existir ou a DB falhar → serve o index.html original
 *      intacto, sem quebrar a rota (fallback obrigatório).
 *
 * ATENÇÃO: este middleware deve ser registrado ANTES do SPA-fallback e DEPOIS
 * de express.static, para que assets (js/css/imagens) sejam servidos direto.
 */

import path from "path";
import { readFile } from "fs/promises";
import type { Request, Response } from "express";
import { getOgStats } from "../services/ogStats";
import { createLogger } from "../lib/logger";

const log = createLogger("og-injector");

// ── Caminho para o build do frontend ─────────────────────────────────────────
// process.cwd() = artifacts/api-server/  quando iniciado via pnpm --filter
const FRONTEND_DIST =
  process.env["FRONTEND_DIST_PATH"] ??
  path.resolve(process.cwd(), "../cartola-intel/dist/public");

const INDEX_HTML_PATH = path.join(FRONTEND_DIST, "index.html");

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtMae(mae: number): string {
  return mae.toFixed(1).replace(".", ",");
}

/**
 * Substitui ou insere uma <meta> tag no HTML.
 * Suporta tanto `property=` (OG) quanto `name=` (Twitter/standard).
 */
function upsertMeta(
  html: string,
  attr: "property" | "name",
  key: string,
  content: string,
): string {
  const escaped = esc(content);
  // Regex flexível: aceita qualquer ordem dos atributos e aspas simples/duplas
  const re = new RegExp(
    `<meta\\s[^>]*(?:${attr}|content)\\s*=\\s*["']${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`,
    "gi",
  );
  const tag = `<meta ${attr}="${key}" content="${escaped}" />`;
  if (re.test(html)) {
    return html.replace(re, tag);
  }
  // Não encontrou — injeta antes de </head>
  return html.replace("</head>", `    ${tag}\n  </head>`);
}

function upsertTitle(html: string, title: string): string {
  const escaped = esc(title);
  const re = /<title>[^<]*<\/title>/i;
  if (re.test(html)) {
    return html.replace(re, `<title>${escaped}</title>`);
  }
  return html.replace("</head>", `    <title>${escaped}</title>\n  </head>`);
}

// ── Geração de tags por rota ──────────────────────────────────────────────────

interface MetaSet {
  title: string;
  description: string;
  imageUrl: string;
}

const DEFAULT_IMAGE = "/opengraph.jpg";

function buildMetaForRoot(stats: Awaited<ReturnType<typeof getOgStats>>): MetaSet {
  const maeStr = stats.seasonMae != null
    ? `Erro médio da temporada: ${fmtMae(stats.seasonMae)} pts. `
    : "";
  return {
    title: "Mitometro — Analytics Pro para Cartola FC",
    description:
      `${maeStr}Projeções estatísticas, escalação otimizada e análise de risco — sem achismos, sem influenciadores.`,
    imageUrl: DEFAULT_IMAGE,
  };
}

function buildMetaForDesempenho(
  stats: Awaited<ReturnType<typeof getOgStats>>,
): MetaSet {
  const hasData = stats.lastRound != null && stats.lastRoundMae != null;
  const title = hasData
    ? `Rodada ${stats.lastRound}: nosso modelo errou ${fmtMae(stats.lastRoundMae!)} pts em média | Mitometro`
    : "Desempenho do Modelo de Projeção | Mitometro";
  const description = hasData
    ? `${stats.totalRounds} rodada${stats.totalRounds !== 1 ? "s" : ""} analisadas. ` +
      `MAE médio da temporada: ${fmtMae(stats.seasonMae!)} pts. ` +
      "Transparência total — sem cherry-picking."
    : "Todo modelo erra. Aqui você vê exatamente quanto e quando o nosso erra — erro médio por rodada, calibração e taxa de armadilhas.";
  return { title, description, imageUrl: DEFAULT_IMAGE };
}

// ── Construção do HTML injetado ───────────────────────────────────────────────

function injectMeta(html: string, meta: MetaSet): string {
  let out = html;
  out = upsertTitle(out, meta.title);
  out = upsertMeta(out, "name",     "description",         meta.description);
  out = upsertMeta(out, "property", "og:title",            meta.title);
  out = upsertMeta(out, "property", "og:description",      meta.description);
  out = upsertMeta(out, "property", "og:image",            meta.imageUrl);
  out = upsertMeta(out, "name",     "twitter:title",       meta.title);
  out = upsertMeta(out, "name",     "twitter:description", meta.description);
  out = upsertMeta(out, "name",     "twitter:image",       meta.imageUrl);
  out = upsertMeta(out, "name",     "twitter:card",        "summary_large_image");
  return out;
}

// ── Middleware factory ────────────────────────────────────────────────────────

type OgRoute = "/" | "/desempenho";

export function createOgMiddleware(routes: OgRoute[]) {
  const routeSet = new Set<string>(routes);

  return async function ogMiddleware(
    req: Request,
    res: Response,
    next: () => void,
  ): Promise<void> {
    // Só intercepta os métodos e rotas declaradas
    if (req.method !== "GET" || !routeSet.has(req.path as OgRoute)) {
      next();
      return;
    }

    let rawHtml: string;
    try {
      rawHtml = await readFile(INDEX_HTML_PATH, "utf-8");
    } catch (err) {
      log.warn("index.html não encontrado no dist — fallback para next()", {
        path: INDEX_HTML_PATH,
        error: err instanceof Error ? err.message : String(err),
      });
      next();
      return;
    }

    // Busca stats (nunca lança — retorna EMPTY em caso de erro)
    const stats = await getOgStats();

    let meta: MetaSet;
    if (req.path === "/desempenho") {
      meta = buildMetaForDesempenho(stats);
    } else {
      meta = buildMetaForRoot(stats);
    }

    let injected: string;
    try {
      injected = injectMeta(rawHtml, meta);
    } catch (err) {
      log.error("Falha ao injetar OG tags — servindo HTML original", {
        error: err instanceof Error ? err.message : String(err),
      });
      injected = rawHtml;
    }

    log.debug("OG injected", { path: req.path, title: meta.title });

    res
      .set("Content-Type", "text/html; charset=utf-8")
      .set("Cache-Control", "public, max-age=60, stale-while-revalidate=300")
      .send(injected);
  };
}
