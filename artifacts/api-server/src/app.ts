import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import router from "./routes";
import { startSyncJob } from "./jobs/syncJob";
import { rootLogger } from "./lib/logger";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
