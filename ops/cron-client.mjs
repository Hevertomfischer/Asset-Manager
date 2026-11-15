// Copy this file to a separate scheduler project; no database access is needed.
// Secrets are read only at runtime and never printed or placed in a URL.
const base = new URL(process.env.MITOMETRO_BASE_URL ?? "https://mitometro.com.br");
if (base.protocol !== "https:" || base.username || base.password || base.pathname !== "/" || base.search || base.hash) {
  throw new Error("MITOMETRO_BASE_URL precisa ser uma origem HTTPS sem credenciais.");
}
const secret = process.env.CRON_SECRET;
if (!secret) throw new Error("Configure CRON_SECRET nos Secrets do agendador.");
const requestedJob = process.argv[2];
if (!["full-sync", "market-check"].includes(requestedJob)) {
  throw new Error("Informe full-sync ou market-check; agende cada um separadamente.");
}
const jobs = [requestedJob];
let failed = false;
for (const job of jobs) {
  try {
    const dispatchedAt = Date.now();
    const response = await fetch(new URL(`/api/internal/cron/${job}`, base), {
      method: "POST", headers: { "x-cron-secret": secret },
      redirect: "error", signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    console.log(JSON.stringify({ job, status: result.status, durationMs: result.durationMs ?? null }));
    if (response.status !== 202) continue;
    // Observing status keeps the scheduler informed, but is not a durable lease
    // on an Autoscale instance. Never report Accepted as completed.
    const deadline = Date.now() + 40 * 60_000;
    let completed = false;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      const statusResponse = await fetch(new URL("/api/sync/status", base), {
        redirect: "error", signal: AbortSignal.timeout(15_000),
      });
      if (!statusResponse.ok) throw new Error(`Status HTTP ${statusResponse.status}`);
      const status = await statusResponse.json();
      if (job === "full-sync" && !status.isRunning && Date.parse(status.lastFullSyncAt) >= dispatchedAt) {
        completed = true;
        console.log(JSON.stringify({ job, status: "completed", durationMs: status.lastFullSyncDurationMs }));
        break;
      }
      if (job === "market-check" && Date.parse(status.lastMarketCheckAt) >= dispatchedAt) {
        completed = true;
        console.log(JSON.stringify({ job, status: "completed" }));
        break;
      }
      if (status.isRunning) continue;
      throw new Error("O job terminou ou foi interrompido sem registrar sucesso.");
    }
    if (!completed) throw new Error("Tempo máximo de acompanhamento atingido sem conclusão confirmada.");
  } catch (error) {
    failed = true;
    console.error(JSON.stringify({ job, status: "error", message: error instanceof Error ? error.message : "Falha" }));
  }
}
if (failed) process.exitCode = 1;
