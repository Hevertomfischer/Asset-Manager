import path from "path";
import { existsSync } from "fs";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cookieParser from "cookie-parser";
import passport from "passport";
import cors from "cors";
import { eq } from "drizzle-orm";
import router from "./routes";
import { configurePassport } from "./auth/passport";
import { attachUser } from "./middlewares/attachUser";
import { startSyncJob } from "./jobs/syncJob";
import { rootLogger } from "./lib/logger";
import { createOgMiddleware, createDynamicOgMiddleware } from "./middlewares/ogInjector";
import { getSitemapData, playerSlug } from "./routes/stats";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";

const log = rootLogger;

const SESSION_SECRET = process.env["SESSION_SECRET"];
if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET não definido — defina esta variável de ambiente antes de iniciar o servidor.");
}

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL não definido.");
}

configurePassport();

const app: Express = express();

app.set("trust proxy", 1);

app.use(cookieParser());
app.use(cors());
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PgSession = connectPgSimple(session);

app.use(
  session({
    store: new PgSession({
      conString: DATABASE_URL,
      tableName: "session",
      pruneSessionInterval: 60 * 60,
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", secure: false },
  })
);

app.use(passport.initialize());
app.use(passport.session());
app.use(attachUser);

app.use((req: Request, _res: Response, next: NextFunction) => {
  rootLogger.debug(`${req.method} ${req.path}`);
  next();
});

app.use("/api", router);

// ── 404 para rotas /api/* não tratadas ────────────────────────────────────────
app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// ── Frontend estático (build do Vite) ────────────────────────────────────────
// Em dev sem build, o bloco inteiro é pulado e o Vite dev server toma conta.
const FRONTEND_DIST =
  process.env["FRONTEND_DIST_PATH"] ??
  path.resolve(process.cwd(), "../cartola-intel/dist/public");

const INDEX_HTML = path.join(FRONTEND_DIST, "index.html");
const hasFrontendBuild = existsSync(INDEX_HTML);

if (hasFrontendBuild) {
  log.info("Frontend build encontrado — ativando servir estático + OG injection", {
    dist: FRONTEND_DIST,
  });

  // Serve assets (JS/CSS/imagens) sem tocar no index.html
  app.use(express.static(FRONTEND_DIST, { index: false }));

  // ── /robots.txt ─────────────────────────────────────────────────────────────
  app.get("/robots.txt", (_req: Request, res: Response) => {
    const appUrl = buildAppUrl();
    res
      .set("Content-Type", "text/plain; charset=utf-8")
      .set("Cache-Control", "public, max-age=86400")
      .send(
        [
          "User-agent: *",
          "Allow: /",
          "",
          `Sitemap: ${appUrl}/sitemap.xml`,
        ].join("\n"),
      );
  });

  // ── /sitemap.xml (dinâmico) ───────────────────────────────────────────────────
  app.get("/sitemap.xml", async (_req: Request, res: Response) => {
    const appUrl = buildAppUrl();
    const today = new Date().toISOString().slice(0, 10);

    let closedRounds: number[] = [];
    let players: { id: number; name: string; nickname: string | null }[] = [];
    try {
      const sitemapData = await getSitemapData();
      closedRounds = sitemapData.closedRounds;
      players = sitemapData.players;
    } catch {
      log.warn("Sitemap: falha ao carregar dados dinâmicos — usando entradas estáticas");
    }

    const staticUrls = [
      { loc: `${appUrl}/`, changefreq: "daily", priority: "1.0" },
      { loc: `${appUrl}/desempenho`, changefreq: "weekly", priority: "0.8" },
    ];

    const roundUrls = closedRounds.map((r) => ({
      loc: `${appUrl}/rodada/${r}`,
      lastmod: today,
      changefreq: "monthly",
      priority: "0.7",
    }));

    const playerUrls = players.map((p) => ({
      loc: `${appUrl}/jogador/${playerSlug(p.name, p.nickname, p.id)}`,
      lastmod: today,
      changefreq: "weekly",
      priority: "0.6",
    }));

    const allUrls = [...staticUrls, ...roundUrls, ...playerUrls];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join("\n")}
</urlset>`;

    res
      .set("Content-Type", "application/xml; charset=utf-8")
      .set("Cache-Control", "public, max-age=3600")
      .send(xml);
  });

  // ── OG injection para rotas públicas ────────────────────────────────────────
  const ogMiddleware = createOgMiddleware(["/", "/desempenho"]);
  app.use(ogMiddleware);
  app.use(createDynamicOgMiddleware());

  // ── SPA fallback — todas as demais rotas servem index.html ──────────────────
  // Express 5 + path-to-regexp@8 não aceita "*" puro; usar "/{*path}"
  app.get("/{*path}", (_req: Request, res: Response) => {
    res.sendFile(INDEX_HTML, (err) => {
      if (err) {
        log.error("Erro ao servir SPA fallback", { error: String(err) });
        res.status(404).end();
      }
    });
  });
} else {
  log.info("Frontend build não encontrado — modo API-only (dev sem build)", {
    expectedDist: FRONTEND_DIST,
  });
}

// ── Error handler (deve ser o último middleware) ──────────────────────────────
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  rootLogger.error("Unhandled error", { error: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: "Internal server error" });
});

if (process.env["NODE_ENV"] !== "test") {
  startSyncJob();
}

// ── Bootstrap: garante role=admin para o primeiro admin ──────────────────────
const FIRST_ADMIN_EMAIL = process.env["FIRST_ADMIN_EMAIL"];
if (FIRST_ADMIN_EMAIL) {
  db.update(usersTable)
    .set({ role: "admin", updatedAt: new Date() })
    .where(eq(usersTable.email, FIRST_ADMIN_EMAIL))
    .returning({ id: usersTable.id, email: usersTable.email })
    .then(([user]) => {
      if (user) log.info("Bootstrap: admin role granted", { email: FIRST_ADMIN_EMAIL, userId: user.id });
      else log.warn("Bootstrap: FIRST_ADMIN_EMAIL not found in DB yet", { email: FIRST_ADMIN_EMAIL });
    })
    .catch((err: unknown) => {
      log.error("Bootstrap: failed to grant admin role", { email: FIRST_ADMIN_EMAIL, error: err instanceof Error ? err.message : String(err) });
    });
}

// ── Utilitário: URL pública da aplicação ─────────────────────────────────────
function buildAppUrl(): string {
  if (process.env["APP_URL"]) return process.env["APP_URL"].replace(/\/$/, "");
  if (process.env["REPLIT_DEV_DOMAIN"]) return `https://${process.env["REPLIT_DEV_DOMAIN"]}`;
  const port = process.env["PORT"] ?? "8080";
  return `http://localhost:${port}`;
}

export default app;
