import { Router, type Request, type Response, type NextFunction } from "express";
import passport from "passport";
import { isGoogleOAuthConfigured } from "../auth/passport";
import { getUserPlan } from "../services/accessService";
import { createLogger } from "../lib/logger";

const router = Router();
const log = createLogger("auth");

function requireGoogleOAuth(_req: Request, res: Response, next: NextFunction): void {
  if (!isGoogleOAuthConfigured()) {
    res.status(503).json({
      error: "Google OAuth não configurado no servidor.",
      hint: "Defina GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e OAUTH_CALLBACK_URL e reinicie o servidor.",
    });
    return;
  }
  next();
}

router.get("/auth/google", requireGoogleOAuth, passport.authenticate("google", { scope: ["email", "profile"] }));

router.get(
  "/auth/google/callback",
  requireGoogleOAuth,
  passport.authenticate("google", { failureRedirect: "/api/auth/error" }),
  (req, res) => {
    log.info("Login via Google bem-sucedido", { userId: req.user?.id });
    res.redirect("/");
  }
);

router.get("/auth/error", (_req, res) => {
  res.status(401).json({ error: "Falha na autenticação com Google" });
});

router.get("/auth/me", async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  const { id, email, name, avatarUrl, role } = req.user;
  const plan = await getUserPlan(id);
  res.json({ id, email, name, avatarUrl, role, plan, isPro: plan === "pro" });
});

router.post("/auth/logout", (req, res, next) => {
  const userId = req.user?.id;
  req.logout((err) => {
    if (err) {
      log.error("Erro ao fazer logout", { userId, error: err.message });
      return next(err);
    }
    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        log.warn("Erro ao destruir sessão", { userId, error: destroyErr.message });
      } else {
        log.info("Logout realizado", { userId });
      }
      res.json({ ok: true });
    });
  });
});

export default router;
