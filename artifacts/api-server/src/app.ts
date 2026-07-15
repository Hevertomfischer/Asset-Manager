import path from "path";
import { existsSync } from "fs";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cookieParser from "cookie-parser";
import passport from "passport";
import cors from "cors";
import router from "./routes";
import { configurePassport } from "./auth/passport";
import { attachUser } from "./middlewares/attachUser";
import { startSyncJob } from "./jobs/syncJob";
import { rootLogger } from "./lib/logger";
import { createOgMiddleware } from "./middlewares/ogInjector";

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

  // ── /sitemap.xml ─────────────────────────────────────────────────────────────
  app.get("/sitemap.xml", (_req: Request, res: Response) => {
    const appUrl = buildAppUrl();
    const today = new Date().toISOString().slice(0, 10);
    res
      .set("Content-Type", "application/xml; charset=utf-8")
      .set("Cache-Control", "public, max-age=86400")
      .send(
        `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${appUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${appUrl}/desempenho</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>`,
      );
  });

  // ── OG injection para rotas públicas ────────────────────────────────────────
  const ogMiddleware = createOgMiddleware(["/", "/desempenho"]);
  app.use(ogMiddleware);

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

// ── Utilitário: URL pública da aplicação ─────────────────────────────────────
function buildAppUrl(): string {
  if (process.env["APP_URL"]) return process.env["APP_URL"].replace(/\/$/, "");
  if (process.env["REPLIT_DEV_DOMAIN"]) return `https://${process.env["REPLIT_DEV_DOMAIN"]}`;
  const port = process.env["PORT"] ?? "8080";
  return `http://localhost:${port}`;
}

export default app;
