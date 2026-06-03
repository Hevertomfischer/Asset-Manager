import { Router, type Request, type Response, type NextFunction } from "express";
import passport from "passport";
import { isGoogleOAuthConfigured } from "../auth/passport";
import { getUserPlan } from "../services/accessService";
import { createLogger } from "../lib/logger";
import { db } from "@workspace/db";
import { userPreferencesTable, usersTable, subscriptionsTable } from "@workspace/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { z } from "zod/v4";

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
  const [plan, prefsRows] = await Promise.all([
    getUserPlan(id),
    db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, id)).limit(1),
  ]);
  const prefs = prefsRows[0];
  const preferences = {
    defaultStrategy: prefs?.defaultStrategy ?? "cost-benefit",
    onboardingCompleted: prefs?.onboardingCompleted ?? false,
  };
  res.json({ id, email, name, avatarUrl, role, plan, isPro: plan === "pro", preferences });
});

const devLoginSchema = z.object({
  email: z.email(),
  name: z.string().optional(),
  plan: z.enum(["free", "pro"]).optional().default("free"),
});

router.post("/auth/dev-login", async (req, res, next) => {
  if (process.env["NODE_ENV"] !== "development") {
    res.status(403).json({ error: "Disponível apenas em ambiente de desenvolvimento" });
    return;
  }

  const parsed = devLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dados inválidos", details: parsed.error.issues });
    return;
  }

  const { email, name, plan } = parsed.data;

  try {
    const [user] = await db
      .insert(usersTable)
      .values({ email, name: name ?? null, provider: "dev", externalId: null, avatarUrl: null })
      .onConflictDoUpdate({
        target: usersTable.email,
        set: {
          name: name ?? sql`${usersTable.name}`,
          provider: "dev",
          updatedAt: sql`now()`,
        },
      })
      .returning();

    if (!user) {
      res.status(500).json({ error: "Falha ao criar usuário" });
      return;
    }

    const periodEnd = new Date();
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);

    await db
      .delete(subscriptionsTable)
      .where(and(eq(subscriptionsTable.userId, user.id), eq(subscriptionsTable.provider, "dev")));

    if (plan === "pro") {
      await db.insert(subscriptionsTable).values({
        userId: user.id,
        plan: "pro",
        status: "active",
        provider: "dev",
        externalId: `dev-${user.id}`,
        currentPeriodEnd: periodEnd,
      });
    }

    req.login(user, (err) => {
      if (err) {
        log.error("Dev login session error", { error: err.message });
        return next(err);
      }
      log.info("Dev login bem-sucedido", { userId: user.id, email: user.email, plan });
      res.json({ ok: true, userId: user.id, email: user.email, plan });
    });
  } catch (err) {
    log.error("Dev login error", { error: err instanceof Error ? err.message : String(err) });
    next(err);
  }
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
