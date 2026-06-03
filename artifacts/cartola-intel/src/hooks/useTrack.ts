import { useCallback } from "react";

type TrackProps = Record<string, string | number | boolean | null | undefined>;

/**
 * Returns a fire-and-forget `track(event, props?)` function.
 * Errors are silently swallowed — analytics must never break the app.
 * The backend reads userId from the session cookie, no need to include it here.
 */
export function useTrack() {
  const track = useCallback((event: string, props?: TrackProps) => {
    fetch("/api/analytics/track", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, props: props ?? {} }),
    }).catch(() => {
      // intentionally silent
    });
  }, []);

  return track;
}
