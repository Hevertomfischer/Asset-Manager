import { Router } from "express";
import { db } from "@workspace/db";
import { feedbackTable } from "@workspace/db/schema";
import { createLogger } from "../lib/logger";

const log = createLogger("feedback");
const router = Router();

// ── Simple in-memory rate limiter: 5 submissions per user/IP per hour ─────────
const RATE_LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000; // 1 hour

const submissionLog = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = (submissionLog.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT) return true;
  timestamps.push(now);
  submissionLog.set(key, timestamps);
  return false;
}

const VALID_TYPES = new Set(["bug", "ideia", "elogio", "duvida"]);
const MIN_LEN = 10;
const MAX_LEN = 2000;
const MAX_PAGE_LEN = 300;

// ── POST /api/feedback ────────────────────────────────────────────────────────
router.post("/feedback", async (req, res) => {
  try {
    const userId: number | null = req.isAuthenticated() && req.user ? (req.user as { id: number }).id : null;
    const rateLimitKey = userId ? `user:${userId}` : `ip:${req.ip ?? "unknown"}`;

    if (isRateLimited(rateLimitKey)) {
      log.warn("Feedback rate limit exceeded", { rateLimitKey });
      res.status(429).json({ error: "Muitos envios. Aguarde antes de enviar novo feedback." });
      return;
    }

    const { page, type, message } = req.body as { page?: unknown; type?: unknown; message?: unknown };

    if (typeof type !== "string" || !VALID_TYPES.has(type)) {
      res.status(400).json({ error: "Tipo inválido. Use: bug, ideia, elogio ou duvida." });
      return;
    }
    if (typeof message !== "string" || message.trim().length < MIN_LEN) {
      res.status(400).json({ error: `Mensagem muito curta (mínimo ${MIN_LEN} caracteres).` });
      return;
    }
    if (message.trim().length > MAX_LEN) {
      res.status(400).json({ error: `Mensagem muito longa (máximo ${MAX_LEN} caracteres).` });
      return;
    }
    const pageSafe = typeof page === "string" ? page.slice(0, MAX_PAGE_LEN) : "";

    const [row] = await db
      .insert(feedbackTable)
      .values({
        userId,
        page: pageSafe,
        type,
        message: message.trim(),
        status: "novo",
      })
      .returning({ id: feedbackTable.id });

    log.info("Feedback submitted", { id: row?.id, userId, type, page: pageSafe });
    res.status(201).json({ ok: true, id: row?.id });
  } catch (err) {
    log.error("Failed to save feedback", { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: "Falha ao registrar feedback." });
  }
});

export default router;
