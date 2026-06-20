import { useEffect, useState } from "react";

interface SyncStatus {
  lastSyncAt: string | null;
  marketStatus: string | null;
}

export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>({ lastSyncAt: null, marketStatus: null });

  useEffect(() => {
    let cancelled = false;

    async function fetchStatus() {
      try {
        const res = await fetch("/api/sync/status");
        if (!res.ok) return;
        const data = await res.json() as SyncStatus;
        if (!cancelled) setStatus(data);
      } catch {
        // non-fatal
      }
    }

    void fetchStatus();
    const interval = setInterval(() => void fetchStatus(), 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return status;
}

export function AutoSync() {
  return null;
}
