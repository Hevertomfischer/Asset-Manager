import type { Request, Response, NextFunction } from "express";
import { createLogger } from "../lib/logger";

const log = createLogger("admin-auth");

const ADMIN_SECRET = process.env["ADMIN_SECRET"];

export function adminAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!ADMIN_SECRET || !req.path.startsWith("/admin")) {
    next();
    return;
  }

  const token = req.headers["x-admin-secret"] ?? req.query["adminSecret"];

  if (token !== ADMIN_SECRET) {
    log.warn("Unauthorized admin access attempt", { ip: req.ip, path: req.path });
    res.status(401).json({ error: "Unauthorized — admin secret required" });
    return;
  }

  next();
}
