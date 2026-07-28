import path from "path";
import fs, { existsSync } from "fs";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cookieParser from "cookie-parser";
import passport from "passport";
import cors from "cors";
import { eq, sql as drizzleSql } from "drizzle-orm";
import router from "./routes";
import { configurePassport } from "./auth/passport";
import { attachUser } from "./middlewares/attachUser";
import { startSyncJob } from "./jobs/syncJob";
import { rootLogger } from "./lib/logger";
import { createOgMiddleware, createDynamicOgMiddleware } from "./middlewares/ogInjector";
import { getSitemapData, playerSlug } from "./routes/stats";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { applyMpvToDatabase } from "./services/mpvService";
import { runProjectionEngine } from "./engines/projectionEngine";
import { getLatestProjectionRound } from "./repositories/projectionRepository";

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

// ── Bootstrap: importa CSV de scouts se csv_2026 ainda não existir no banco ──
// Roda uma vez na primeira inicialização após o deploy e é idempotente.
// Garante que os dados históricos de FF/V/PC/PS estejam presentes em produção.
void (async () => {
  try {
    const CSV_FILENAME = "cartola_2026_rodadas_1-20_1785252053293.csv";
    // Resolve CSV path: try CWD (prod, run from workspace root), then walk up 2 dirs (dev, CWD=artifacts/api-server)
    const candidatePaths = [
      path.join(process.cwd(), "attached_assets", CSV_FILENAME),
      path.join(process.cwd(), "..", "..", "attached_assets", CSV_FILENAME),
    ];
    const csvPath = candidatePaths.find((p) => fs.existsSync(p)) ?? "";

    if (!csvPath) {
      log.info("[csv-bootstrap] CSV file not found in any candidate path — skipping", { candidatePaths });
      return;
    }

    const countResult = await db.execute<{ cnt: string }>(
      drizzleSql`SELECT COUNT(*) AS cnt FROM player_scout_round WHERE source = 'csv_2026'`
    );
    const existing = parseInt(countResult.rows[0]?.cnt ?? "0", 10);
    if (existing > 0) {
      log.info("[csv-bootstrap] csv_2026 already present — skipping import", { rows: existing });
      return;
    }

    log.info("[csv-bootstrap] csv_2026 source missing — starting import", { csvPath });

    const { parse } = await import("csv-parse/sync");

    const playersRows = await db.execute<{ id: number; external_id: string }>(
      drizzleSql`SELECT id, external_id FROM players WHERE external_source = 'cartola_api'`
    );
    const idMap = new Map(playersRows.rows.map((p) => [p.external_id, p.id]));

    const raw = fs.readFileSync(csvPath, "utf8");
    const records: Record<string, string>[] = parse(raw, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const toInt = (v: string): number | null => {
      if (!v || v.trim() === "") return null;
      const n = parseInt(v, 10);
      return isNaN(n) ? null : n;
    };
    const toFloat = (v: string): number | null => {
      if (!v || v.trim() === "") return null;
      const n = parseFloat(v);
      return isNaN(n) ? null : n;
    };

    // @ts-ignore — $client is the underlying Pool on drizzle-orm/node-postgres
    const pool = (db as any).$client as import("pg").Pool;

    const UPSERT_TPL = `
      INSERT INTO player_scout_round (
        player_id, round, source, points,
        goals, assists, shots, shots_on_target,
        tackles, interceptions, fouls_suffered, fouls_committed,
        saves, goals_conceded, clean_sheet,
        yellow_cards, red_cards, penalty_missed, penalty_saved, own_goals,
        ff, v, pc, ps, collected_at
      ) VALUES %ROWS%
      ON CONFLICT (player_id, round, source) DO UPDATE SET
        points=EXCLUDED.points, goals=EXCLUDED.goals, assists=EXCLUDED.assists,
        shots=EXCLUDED.shots, shots_on_target=EXCLUDED.shots_on_target,
        tackles=EXCLUDED.tackles, interceptions=EXCLUDED.interceptions,
        fouls_suffered=EXCLUDED.fouls_suffered, fouls_committed=EXCLUDED.fouls_committed,
        saves=EXCLUDED.saves, goals_conceded=EXCLUDED.goals_conceded,
        clean_sheet=EXCLUDED.clean_sheet, yellow_cards=EXCLUDED.yellow_cards,
        red_cards=EXCLUDED.red_cards, penalty_missed=EXCLUDED.penalty_missed,
        penalty_saved=EXCLUDED.penalty_saved, own_goals=EXCLUDED.own_goals,
        ff=EXCLUDED.ff, v=EXCLUDED.v, pc=EXCLUDED.pc, ps=EXCLUDED.ps,
        collected_at=now()
    `;

    const BATCH = 200;
    let valueSets: string[] = [];
    let params: unknown[] = [];
    let pi = 1;
    let inserted = 0;
    let skipped = 0;

    const flushPool = async () => {
      if (valueSets.length === 0) return;
      await pool.query(UPSERT_TPL.replace("%ROWS%", valueSets.join(",\n")), params);
      inserted += valueSets.length;
      valueSets = []; params = []; pi = 1;
    };

    for (const r of records) {
      const playerId = idMap.get(r.atleta_id);
      if (!playerId) { skipped++; continue; }
      const vals: unknown[] = [
        playerId, parseInt(r.rodada, 10), "csv_2026", toFloat(r.pontuacao),
        toInt(r.G), toInt(r.A), toInt(r.FT), toInt(r.FD),
        toInt(r.DS), toInt(r.I), toInt(r.FS), toInt(r.FC),
        toInt(r.DE), toInt(r.GS), toInt(r.SG),
        toInt(r.CA), toInt(r.CV), toInt(r.PP), toInt(r.DP), toInt(r.GC),
        toInt(r.FF), toInt(r.V), toInt(r.PC), toInt(r.PS),
        new Date(),
      ];
      const placeholders = vals.map(() => `$${pi++}`).join(", ");
      valueSets.push(`(${placeholders})`);
      params.push(...vals);
      if (valueSets.length >= BATCH) await flushPool();
    }
    await flushPool();

    log.info("[csv-bootstrap] Import complete", { inserted, skipped, total: records.length });

    // Recalculate MPV now that csv_2026 data is in the DB
    const updated = await applyMpvToDatabase(true);
    log.info("[csv-bootstrap] MPV recalculated after CSV import", { updated });

    // Recalculate projections so the new scout data is reflected immediately
    // (otherwise the next hourly ETL would handle it, but this makes it instant)
    const projRound = await getLatestProjectionRound();
    if (projRound) {
      await runProjectionEngine(projRound);
      log.info("[csv-bootstrap] Projections recalculated", { round: projRound });
    }
  } catch (err) {
    log.error("[csv-bootstrap] Failed", { error: err instanceof Error ? err.message : String(err) });
  }
})();

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
