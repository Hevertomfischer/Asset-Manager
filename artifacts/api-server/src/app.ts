import express, { type Express, type Request, type Response, type NextFunction } from "express";
import session from "express-session";
import passport from "passport";
import cors from "cors";
import router from "./routes";
import { configurePassport } from "./auth/passport";
import { attachUser } from "./middlewares/attachUser";
import { startSyncJob } from "./jobs/syncJob";
import { rootLogger } from "./lib/logger";

const SESSION_SECRET = process.env["SESSION_SECRET"];
if (!SESSION_SECRET) {
  throw new Error("SESSION_SECRET não definido — defina esta variável de ambiente antes de iniciar o servidor.");
}

configurePassport();

const app: Express = express();

app.use(cors());
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax", secure: process.env["NODE_ENV"] === "production" },
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

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  rootLogger.error("Unhandled error", { error: err instanceof Error ? err.message : String(err) });
  res.status(500).json({ error: "Internal server error" });
});

if (process.env["NODE_ENV"] !== "test") {
  startSyncJob();
}

export default app;
