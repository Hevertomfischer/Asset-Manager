import type { Request, Response, NextFunction } from "express";
import { createLogger } from "../lib/logger";

const log = createLogger("admin-auth");

const ADMIN_SECRET = process.env["ADMIN_SECRET"];

/**
 * Protects all /admin routes.
 *
 * Three modes, evaluated in order:
 *  1. ADMIN_SECRET configured → requires x-admin-secret header (or ?adminSecret query).
 *     Use this in production with a strong random value.
 *  2. ADMIN_SECRET not configured + user is authenticated with role "admin" → allow.
 *  3. ADMIN_SECRET not configured + user is authenticated without admin role → 403.
 *
 * Non-admin paths always pass through.
 */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith("/admin")) {
    next();
    return;
  }

  if (ADMIN_SECRET) {
    const token = req.headers["x-admin-secret"] ?? req.query["adminSecret"];
    if (token !== ADMIN_SECRET) {
      log.warn("Unauthorized admin access attempt (bad secret)", { ip: req.ip, path: req.path });
      res.status(401).json({ error: "Unauthorized — admin secret required" });
      return;
    }
    next();
    return;
  }

  // No ADMIN_SECRET set — require an authenticated session first.
  if (!req.isAuthenticated() || !req.user) {
    log.warn("Unauthenticated admin access attempt", { ip: req.ip, path: req.path });
    res.status(401).json({ error: "Autenticação necessária." });
    return;
  }

  // Then require admin role.
  if (req.user.role !== "admin") {
    log.warn("Non-admin user attempted admin access", { userId: req.user.id, role: req.user.role, path: req.path });
    res.status(403).json({ error: "Acesso restrito a administradores." });
    return;
  }

  next();
}
