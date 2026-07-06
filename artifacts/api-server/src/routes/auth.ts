import { Router, type Request, type Response, type NextFunction } from "express";
import passport from "passport";
import { randomBytes, createHmac, timingSafeEqual } from "crypto";
import { isGoogleOAuthConfigured } from "../auth/passport";
import { getUserPlan, isPro as checkIsPro, FOUNDER_ACCESS_CUTOFF } from "../services/accessService";
import { triggerFullSyncIfStale } from "../jobs/syncJob";
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

const CALLBACK_PATH = "/api/auth/google/callback";

function getCallbackURL(req: Request): string {
  const envURL = process.env["OAUTH_CALLBACK_URL"];
  if (envURL) {
    const base = envURL.replace(/\/$/, "");
    if (base.endsWith(CALLBACK_PATH)) return base;
    return base + CALLBACK_PATH;
  }
  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "";
  const proto = req.get("x-forwarded-proto") ?? req.protocol ?? "https";
  return `${proto}://${host}${CALLBACK_PATH}`;
}

/**
 * Stateless CSRF: embed a HMAC-signed nonce in the OAuth state parameter.
 * No cookie or server-side session needed — the signature is self-verifying.
 */
function createSignedState(): string {
  const secret = process.env["SESSION_SECRET"] ?? "fallback";
  const nonce = randomBytes(16).toString("hex");
  const sig = createHmac("sha256", secret).update(nonce).digest("hex");
  return `${nonce}.${sig}`;
}

function verifySignedState(state: string): boolean {
  const secret = process.env["SESSION_SECRET"] ?? "fallback";
  const dot = state.lastIndexOf(".");
  if (dot === -1) return false;
  const nonce = state.slice(0, dot);
  const providedSig = state.slice(dot + 1);
  const expectedSig = createHmac("sha256", secret).update(nonce).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expectedSig, "hex"), Buffer.from(providedSig, "hex"));
  } catch {
    return false;
  }
}

router.get("/auth/google", requireGoogleOAuth, (req, res, next) => {
  const callbackURL = getCallbackURL(req);
  const state = createSignedState();
  log.info("Iniciando Google OAuth", { callbackURL });
  passport.authenticate("google", { scope: ["email", "profile"], callbackURL, state } as object)(req, res, next);
});

router.get(
  "/auth/google/callback",
  requireGoogleOAuth,
  (req, res, next) => {
    const callbackURL = getCallbackURL(req);
    const queryState = req.query["state"] as string | undefined;

    if (!queryState || !verifySignedState(queryState)) {
      log.warn("OAuth CSRF falhou — state inválido ou ausente", { hasState: !!queryState });
      res.redirect("/api/auth/error");
      return;
    }

    passport.authenticate(
      "google",
      { callbackURL } as object,
      (err: Error | null, user: Express.User | false, info: unknown) => {
        if (err) {
          log.error("Google OAuth erro interno", { error: err.message, stack: err.stack });
          return res.redirect("/api/auth/error");
        }
        if (!user) {
          log.warn("Google OAuth falhou — sem usuário", { info: JSON.stringify(info) });
          return res.redirect("/api/auth/error");
        }
        req.login(user, (loginErr) => {
          if (loginErr) {
            log.error("Erro ao criar sessão após OAuth", { error: loginErr.message });
            return next(loginErr);
          }
          log.info("Login via Google bem-sucedido", { userId: (user as { id: number }).id });
          triggerFullSyncIfStale();
          res.redirect("/");
        });
      }
    )(req, res, next);
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
  const [plan, isProFlag, prefsRows] = await Promise.all([
    getUserPlan(id),
    checkIsPro(id),
    db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, id)).limit(1),
  ]);
  const prefs = prefsRows[0];
  const preferences = {
    defaultStrategy: prefs?.defaultStrategy ?? "cost-benefit",
    onboardingCompleted: prefs?.onboardingCompleted ?? false,
  };
  // plan = plano real da assinatura (free|pro) — para exibir "seu plano atual"
  // isPro = flag de acesso efetivo — inclui Founder Access se campanha ativa
  // founderCutoff = ISO string da data de encerramento da campanha (null após a data)
  const founderCutoff = new Date() < FOUNDER_ACCESS_CUTOFF
    ? FOUNDER_ACCESS_CUTOFF.toISOString()
    : null;
  res.json({ id, email, name, avatarUrl, role, plan, isPro: isProFlag, founderCutoff, preferences });
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
