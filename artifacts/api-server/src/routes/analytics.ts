import { Router } from "express";
import { db } from "@workspace/db";
import { analyticsEventsTable } from "@workspace/db/schema";
import { createLogger } from "../lib/logger";

const log = createLogger("analytics");
const router = Router();

// ── Sensitive field blocklist ─────────────────────────────────────────────────
// Strip any prop whose key matches these patterns before persisting.
const BLOCKED_PROPS = /password|token|secret|key|card|cvv|ssn|cpf|email|phone|credit|auth/i;

function stripSensitive(props: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (BLOCKED_PROPS.test(k)) continue;
    // Flatten nested objects to avoid storing arbitrary deep structures
    clean[k] = typeof v === "object" && v !== null ? "[object]" : v;
  }
  return clean;
}

// ── In-memory rate limiter: 30 requests / 60 s per IP ────────────────────────
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const rateMap = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  if (entry.count >= RATE_LIMIT) return true;
  entry.count++;
  return false;
}

// Clean up stale entries every 5 minutes so the Map does not grow unboundedly.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateMap.entries()) {
    if (now > entry.resetAt) rateMap.delete(ip);
  }
}, 5 * 60_000).unref();

// ── POST /api/analytics/track ─────────────────────────────────────────────────
router.post("/analytics/track", async (req, res) => {
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)
      ?.split(",")[0]
      ?.trim() ??
    req.socket.remoteAddress ??
    "unknown";

  if (isRateLimited(ip)) {
    res.status(429).json({ error: "Too many requests" });
    return;
  }

  const body = req.body as { event?: unknown; props?: unknown };

  if (typeof body.event !== "string" || !body.event.trim()) {
    res.status(400).json({ error: "Missing or invalid 'event'" });
    return;
  }

  const event = body.event.slice(0, 128);

  const rawProps =
    typeof body.props === "object" &&
    body.props !== null &&
    !Array.isArray(body.props)
      ? (body.props as Record<string, unknown>)
      : {};
  const props = stripSensitive(rawProps);

  // Associate with the authenticated user when available (Passport session).
  const userId = req.isAuthenticated() && req.user ? req.user.id : null;

  try {
    await db.insert(analyticsEventsTable).values({ event, props, userId });
    log.info(`event="${event}" userId=${userId ?? "anon"} ip=${ip}`);
    res.status(204).end();
  } catch (err) {
    log.error("Failed to insert analytics event:", err);
    // Return 204 even on error — clients must never retry analytics calls.
    res.status(204).end();
  }
});

export default router;
