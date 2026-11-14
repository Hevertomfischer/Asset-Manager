import cors from "cors";
import type { RequestHandler } from "express";
import { createLogger } from "./logger";

const log = createLogger("browser-security");

function parseAllowedOrigins(value: string | undefined): Set<string> {
  if (!value?.trim()) throw new Error("Configure o Secret ALLOWED_ORIGINS antes de publicar.");
  const origins = new Set<string>();
  for (const entry of value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean)) {
    let parsed: URL;
    try { parsed = new URL(entry); } catch { throw new Error("ALLOWED_ORIGINS contém uma origem inválida."); }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password ||
        parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.hostname.includes("*")) {
      throw new Error("ALLOWED_ORIGINS deve conter apenas origens completas, sem curingas, caminhos ou credenciais.");
    }
    origins.add(parsed.origin);
  }
  if (origins.size === 0) throw new Error("ALLOWED_ORIGINS não pode estar vazio.");
  return origins;
}

export function sessionCookieOptions(environment = process.env["NODE_ENV"]) {
  return { httpOnly: true, sameSite: "lax" as const, secure: environment === "production" };
}

export function createBrowserCors(
  environment = process.env["NODE_ENV"],
  configuredOrigins = process.env["ALLOWED_ORIGINS"],
): RequestHandler {
  const production = environment === "production";
  const origins = production ? parseAllowedOrigins(configuredOrigins) : new Set<string>();
  return (req, res, next) => {
    const origin = req.get("Origin");
    if (production) {
      res.vary("Origin");
      if (origin && !origins.has(origin)) {
        log.warn("Origem CORS negada", { method: req.method, path: req.path });
        res.status(403).json({ error: "Origem não permitida." });
        return;
      }
    }
    // Native MCP clients and top-level Google callbacks send no Origin.
    // Browser clients need an explicit allowlisted origin in production.
    cors({
      origin: production ? origin ?? false : "*",
      credentials: production,
      exposedHeaders: ["WWW-Authenticate"],
      preflightContinue: /^\/api\/admin(?:\/|$)/i.test(req.path),
    })(req, res, next);
  };
}
