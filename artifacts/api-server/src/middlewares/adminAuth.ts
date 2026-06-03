import type { Request, Response, NextFunction } from "express";
import { createLogger } from "../lib/logger";

const log = createLogger("admin-auth");

const ADMIN_SECRET = process.env["ADMIN_SECRET"];

/**
 * Protects all /admin routes.
 *
 * Two modes:
 *  1. ADMIN_SECRET configured → requires x-admin-secret header (or ?adminSecret query).
 *     Use this in production with a strong random value.
 *  2. ADMIN_SECRET not configured → falls back to Passport session check.
 *     Only authenticated users (Google OAuth) may access admin routes.
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

  // No ADMIN_SECRET set — require at minimum an authenticated session so
  // anonymous users cannot access admin endpoints.
  if (!req.isAuthenticated() || !req.user) {
    log.warn("Unauthenticated admin access attempt", { ip: req.ip, path: req.path });
    res.status(401).json({ error: "Autenticação necessária." });
    return;
  }

  next();
}
