import type { Request, Response, NextFunction } from "express";
import { isPro } from "../services/accessService";
import { createLogger } from "../lib/logger";

const log = createLogger("require-pro");

export async function requirePro(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.isAuthenticated() || !req.user) {
    res.status(403).json({
      error: "Autenticação necessária para acessar este recurso.",
      upgradeRequired: true,
    });
    return;
  }

  const pro = await isPro(req.user.id);
  if (!pro) {
    log.info("Acesso negado — plano Pro exigido", { userId: req.user.id, path: req.path });
    res.status(402).json({
      error: "Recurso exclusivo do plano Pro.",
      upgradeRequired: true,
    });
    return;
  }

  next();
}
