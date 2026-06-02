import { Router } from "express";
import passport from "passport";
import { createLogger } from "../lib/logger";

const router = Router();
const log = createLogger("auth");

router.get("/auth/google", passport.authenticate("google", { scope: ["email", "profile"] }));

router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/api/auth/error" }),
  (req, res) => {
    log.info("Login via Google bem-sucedido", { userId: req.user?.id });
    res.redirect("/");
  }
);

router.get("/auth/error", (_req, res) => {
  res.status(401).json({ error: "Falha na autenticação com Google" });
});

router.get("/auth/me", (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  const { id, email, name, avatarUrl, role } = req.user;
  res.json({ id, email, name, avatarUrl, role });
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
