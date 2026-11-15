import { db } from "@workspace/db";
import { adminConfigTable, dataCollectionLogTable } from "@workspace/db/schema";

export const FULL_SYNC_STALE_MS = 2 * 60 * 60 * 1000;
export function isFullSyncDegraded(lastSyncAt: string | null, now = Date.now()): boolean {
  const timestamp = lastSyncAt ? Date.parse(lastSyncAt) : NaN;
  return !Number.isFinite(timestamp) || now - timestamp > FULL_SYNC_STALE_MS;
}

/** Duration is measured, not inferred from uncorrelated provider log entries. */
export async function measureFullSync<T extends { success: boolean; round: number }>(work: () => Promise<T>): Promise<T> {
  const started = performance.now();
  let result: T | undefined;
  try {
    result = await work();
    return result;
  } finally {
    const durationMs = Math.round(performance.now() - started);
    const values = [{ key: "lastFullSyncDurationMs", value: String(durationMs) }];
    if (result?.success) values.push({ key: "lastFullSyncAt", value: new Date().toISOString() });
    for (const value of values) {
      await db.insert(adminConfigTable).values(value).onConflictDoUpdate({
        target: adminConfigTable.key, set: { value: value.value, updatedAt: new Date() },
      });
    }
    await db.insert(dataCollectionLogTable).values({
      source: "etl", entityType: "full_sync", status: result?.success ? "success" : "error",
      message: "Full sync finalizado",
      metadataJson: { durationMs, round: result?.round ?? null, success: result?.success ?? false },
    });
  }
}
