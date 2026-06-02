import type { Request, Response, NextFunction } from "express";
import { createLogger } from "../lib/logger";

const log = createLogger("attach-user");

/**
 * Popula req.user quando há sessão ativa do Passport.
 * O Passport já faz isso internamente via passport.session();
 * este middleware serve como ponto de observabilidade e extensão futura.
 * Não bloqueia rotas públicas — use requireAuth para proteção explícita.
 */
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  if (req.isAuthenticated() && req.user) {
    log.debug("Session user attached", { userId: req.user.id, email: req.user.email });
  }
  next();
}
