import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db/schema";
import { eq, or, isNull, and, desc } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const router = Router();
const log = createLogger("notifications");

// ── GET /api/notifications ───────────────────────────────────────────────────
/**
 * Returns the requesting user's personal notifications plus all global ones
 * (userId IS NULL), ordered newest-first.
 *
 * Query params:
 *   limit  (default 30, max 100)
 *   offset (default 0)
 *
 * Response:
 *   { notifications: Notification[], unreadCount: number, total: number }
 */
router.get("/notifications", async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Autenticação necessária." });
    return;
  }

  const userId = req.user.id;
  const limit = Math.min(Number(req.query["limit"]) || 30, 100);
  const offset = Math.max(Number(req.query["offset"]) || 0, 0);

  try {
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(
        or(
          eq(notificationsTable.userId, userId),
          isNull(notificationsTable.userId)
        )
      )
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const unreadCount = rows.filter((n) => n.readAt === null).length;

    log.debug("Fetched notifications", { userId, count: rows.length, unreadCount });
    res.json({ notifications: rows, unreadCount, limit, offset });
  } catch (e) {
    log.error("Failed to fetch notifications", { userId, error: e instanceof Error ? e.message : String(e) });
    res.status(500).json({ error: "Erro ao buscar notificações." });
  }
});

// ── POST /api/notifications/read-all ─────────────────────────────────────────
/**
 * Marks all unread notifications (personal + global) as read for the requesting user.
 */
router.post("/notifications/read-all", async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Autenticação necessária." });
    return;
  }

  const userId = req.user.id;
  const now = new Date();

  try {
    const updated = await db
      .update(notificationsTable)
      .set({ readAt: now })
      .where(
        and(
          or(
            eq(notificationsTable.userId, userId),
            isNull(notificationsTable.userId)
          ),
          isNull(notificationsTable.readAt)
        )
      )
      .returning({ id: notificationsTable.id });

    log.info("Marked all notifications as read", { userId, count: updated.length });
    res.json({ ok: true, marked: updated.length });
  } catch (e) {
    log.error("Failed to mark all notifications as read", { userId, error: e instanceof Error ? e.message : String(e) });
    res.status(500).json({ error: "Erro ao marcar notificações como lidas." });
  }
});

// ── POST /api/notifications/:id/read ─────────────────────────────────────────
/**
 * Marks a single notification as read.
 * The notification must belong to the user (userId = req.user.id) or be global (userId IS NULL).
 */
router.post("/notifications/:id/read", async (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    res.status(401).json({ error: "Autenticação necessária." });
    return;
  }

  const userId = req.user.id;
  const id = parseInt(req.params["id"], 10);

  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "ID inválido." });
    return;
  }

  try {
    const updated = await db
      .update(notificationsTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notificationsTable.id, id),
          or(
            eq(notificationsTable.userId, userId),
            isNull(notificationsTable.userId)
          )
        )
      )
      .returning({ id: notificationsTable.id });

    if (updated.length === 0) {
      res.status(404).json({ error: "Notificação não encontrada." });
      return;
    }

    log.debug("Marked notification as read", { userId, notificationId: id });
    res.json({ ok: true });
  } catch (e) {
    log.error("Failed to mark notification as read", { userId, id, error: e instanceof Error ? e.message : String(e) });
    res.status(500).json({ error: "Erro ao marcar notificação como lida." });
  }
});

export default router;
