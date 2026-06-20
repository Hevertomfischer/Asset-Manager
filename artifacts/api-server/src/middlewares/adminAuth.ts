import type { Request, Response, NextFunction } from "express";
import { createLogger } from "../lib/logger";

const log = createLogger("admin-auth");

const ADMIN_SECRET = process.env["ADMIN_SECRET"];

/**
 * Protects all /admin routes with tiered access:
 *
 *  Mode A — ADMIN_SECRET configured:
 *    GET requests pass with only session auth (any authenticated user may read).
 *    POST/PUT/PATCH/DELETE requests require the x-admin-secret header or ?adminSecret.
 *
 *  Mode B — ADMIN_SECRET not configured:
 *    GET requests require only session auth (any authenticated user may read).
 *    POST/PUT/PATCH/DELETE requests require session auth + role "admin".
 *
 * Non-admin paths always pass through.
 */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith("/admin")) {
    next();
    return;
  }

  const isReadOnly = req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";

  // Any route requires at minimum an authenticated session.
  if (!req.isAuthenticated() || !req.user) {
    log.warn("Unauthenticated admin access attempt", { ip: req.ip, path: req.path, method: req.method });
    res.status(401).json({ error: "Autenticação necessária." });
    return;
  }

  // Read-only routes: session auth is sufficient.
  if (isReadOnly) {
    next();
    return;
  }

  // Mutating routes: require admin authorization.
  if (ADMIN_SECRET) {
    const token = req.headers["x-admin-secret"] ?? req.query["adminSecret"];
    if (token !== ADMIN_SECRET) {
      log.warn("Unauthorized admin mutation attempt (bad secret)", { ip: req.ip, path: req.path, userId: req.user.id });
      res.status(401).json({ error: "Unauthorized — admin secret required" });
      return;
    }
    next();
    return;
  }

  // No ADMIN_SECRET — require role "admin" for mutations.
  if (req.user.role !== "admin") {
    log.warn("Non-admin user attempted admin mutation", { userId: req.user.id, role: req.user.role, path: req.path });
    res.status(403).json({ error: "Acesso restrito a administradores." });
    return;
  }

  next();
}
