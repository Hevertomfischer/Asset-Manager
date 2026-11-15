import type { Request, Response, NextFunction } from "express";
import { createLogger } from "../lib/logger";

const log = createLogger("admin-auth");

const ADMIN_SECRET = process.env["ADMIN_SECRET"];

/**
 * Every admin method requires either an admin session or a valid script header.
 * Non-admin paths always pass through. Never log the supplied header.
 */
export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!/^\/admin(?:\/|$)/i.test(req.path)) {
    next();
    return;
  }

  if (ADMIN_SECRET) {
    const token = req.headers["x-admin-secret"];
    if (token === ADMIN_SECRET) {
      next();
      return;
    }
  }

  // Any route requires at minimum an authenticated session.
  if (!req.isAuthenticated() || !req.user) {
    log.warn("Unauthenticated admin access attempt", { ip: req.ip, path: req.path, method: req.method });
    res.status(401).json({ error: "Autenticação necessária." });
    return;
  }

  if (req.user.role !== "admin") {
    log.warn("Non-admin user attempted admin access", {
      userId: req.user.id, path: req.path, method: req.method,
    });
    res.status(403).json({ error: "Acesso restrito a administradores." });
    return;
  }

  next();
}
