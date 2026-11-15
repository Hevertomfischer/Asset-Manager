import { AsyncLocalStorage } from "node:async_hooks";
import { pool } from "@workspace/db";
import { createLogger } from "../lib/logger";

const log = createLogger("sync-lease");
const LOCK_NAMESPACE = 73503;
// Full ETL and closed-round writes also exclude the existing historical repair.
// Market observations have their own lock so a long ETL cannot delay a close.
const LOCK_IDS = { "full-sync": 1, "market-check": 2 } as const;
export type SyncResource = keyof typeof LOCK_IDS;
export type LeaseResult<T> = { executed: true; result: T } | { executed: false; reason: "already_running" };
const context = new AsyncLocalStorage<ReadonlySet<SyncResource>>();
const active = new Set<SyncResource>();

export class SyncBusyError extends Error {
  constructor() { super("Já existe uma sincronização deste recurso em andamento. Aguarde e tente novamente."); }
}
export const isSyncingLocally = () => active.has("full-sync");

export async function withSyncLease<T>(resource: SyncResource, work: () => Promise<T>): Promise<LeaseResult<T>> {
  // Nested ETL/closed-round calls retain the outer lease instead of acquiring a
  // different pooled connection (which would deadlock against their own job).
  const inherited = context.getStore();
  if (inherited?.has(resource)) return { executed: true, result: await work() };
  const client = await pool.connect();
  const id = LOCK_IDS[resource];
  let acquired = false;
  let destroy = false;
  const onError = () => { destroy = true; log.error("Conexão da trava perdida", { resource }); };
  client.on("error", onError);
  try {
    const result = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock($1, $2) AS acquired", [LOCK_NAMESPACE, id],
    );
    acquired = result.rows[0]?.acquired === true;
    if (!acquired) {
      log.info("Job ignorado: trava ocupada em outra execução", { resource });
      return { executed: false, reason: "already_running" };
    }
    active.add(resource);
    return await context.run(new Set([...(inherited ?? []), resource]), async () => ({
      executed: true as const, result: await work(),
    }));
  } catch (error) {
    if (!acquired) destroy = true;
    throw error;
  } finally {
    if (acquired) {
      active.delete(resource);
      try {
        const unlocked = await client.query<{ released: boolean }>(
          "SELECT pg_advisory_unlock($1, $2) AS released", [LOCK_NAMESPACE, id],
        );
        if (unlocked.rows[0]?.released !== true) destroy = true;
      } catch {
        destroy = true;
        log.error("Falha ao liberar trava; conexão será descartada", { resource });
      }
    }
    client.removeListener("error", onError);
    // Never return a potentially locked/broken session to the pool.
    client.release(destroy);
  }
}

export async function requireSyncLease<T>(resource: SyncResource, work: () => Promise<T>): Promise<T> {
  const outcome = await withSyncLease(resource, work);
  if (!outcome.executed) throw new SyncBusyError();
  return outcome.result;
}

export async function isSyncingGlobally(): Promise<boolean> {
  const result = await pool.query<{ running: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype = 'advisory'
      AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
      AND classid = $1::oid AND objid = $2::oid AND objsubid = 2 AND granted) AS running`,
    [LOCK_NAMESPACE, LOCK_IDS["full-sync"]],
  );
  return result.rows[0]?.running === true;
}
