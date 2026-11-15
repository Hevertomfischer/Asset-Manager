import { Router } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { runCronJob, type CronJob } from "../jobs/syncJob";
import { createLogger } from "../lib/logger";

const log = createLogger("internal-cron");
const RESPONSE_BUDGET_MS = 20_000;
const digest = (value: string) => createHash("sha256").update(value).digest();

export function createInternalCronRouter(responseBudgetMs = RESPONSE_BUDGET_MS) {
const router = Router();
router.post("/internal/cron/:job", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const secret = process.env["CRON_SECRET"];
  if (!secret) {
    log.error("CRON_SECRET não configurado");
    res.status(503).json({ error: "Agendador não configurado." });
    return;
  }
  const supplied = req.get("x-cron-secret");
  if (!supplied || !timingSafeEqual(digest(supplied), digest(secret))) {
    log.warn("Disparo de cron negado");
    res.status(401).json({ error: "Autenticação do agendador inválida." });
    return;
  }
  const job = req.params.job;
  if (job !== "full-sync" && job !== "market-check") {
    res.status(404).json({ error: "Job desconhecido." });
    return;
  }
  const started = performance.now();
  // A request budget, not a claim about an undocumented platform timeout.
  // Autoscale background work remains best-effort, not a durable queue.
  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.set("Retry-After", "30");
      res.set("Location", "/api/sync/status");
      res.status(202).json({ job, status: "running", durable: false, statusUrl: "/api/sync/status" });
    }
  }, responseBudgetMs);
  timer.unref();
  try {
    const outcome = await runCronJob(job satisfies CronJob);
    const durationMs = Math.round(performance.now() - started);
    if (!outcome.executed) {
      if (!res.headersSent) res.json({ job, status: "skipped", reason: outcome.reason });
      return;
    }
    const { success, round } = outcome.result;
    log.info("Job concluído", { job, success, round, durationMs });
    if (!res.headersSent) res.status(success ? 200 : 502).json({ job, status: success ? "completed" : "failed", success, round, durationMs });
  } catch (error) {
    log.error("Job falhou", { job, error: error instanceof Error ? error.message : "Erro desconhecido" });
    if (!res.headersSent) res.status(502).json({ error: "Falha ao executar o job.", job });
  } finally {
    clearTimeout(timer);
  }
});
return router;
}

export default createInternalCronRouter();
