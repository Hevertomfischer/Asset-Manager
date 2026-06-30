import { db } from "@workspace/db";
import {
  notificationsTable,
  playerProjectionTable,
  playersTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createLogger } from "../lib/logger";

const log = createLogger("notification-service");

// ── Detection thresholds ──────────────────────────────────────────────────────
/** Min recommendation score for a player to be considered "notable" (0–10 scale). */
const HIGH_REC_THRESHOLD = 7.0;
/** Absolute price variation (C$) that triggers a price alert for notable players. */
const PRICE_ALERT_MIN_C = 2.0;
/** Play probability below which a high-rec player triggers a status_change alert. */
const LOW_PROB_THRESHOLD = 0.50;
/** Popularity fraction (0–1) above which a player is considered mass-owned. */
const HIGH_POPULARITY_THRESHOLD = 0.20;
/** Expected points below which a mass-owned player is flagged as a trap. */
const TRAP_POINTS_MAX = 3.5;
/** Recommendation score below which a mass-owned player is flagged as a trap. */
const TRAP_REC_MAX = 4.5;
// ─────────────────────────────────────────────────────────────────────────────

type NotificationType = "status_change" | "price" | "trap" | "market_open" | "market_close";

interface CreateNotifInput {
  userId?: number | null;
  type: NotificationType;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  dedupeKey?: string | null;
}

/**
 * Insert a single notification.
 * If dedupeKey is provided and already exists, the insert is silently ignored
 * (ON CONFLICT DO NOTHING). Returns true when actually inserted.
 */
export async function createNotification(input: CreateNotifInput): Promise<boolean> {
  try {
    const result = await db
      .insert(notificationsTable)
      .values({
        userId: input.userId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        payload: input.payload ?? null,
        dedupeKey: input.dedupeKey ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: notificationsTable.id });
    return result.length > 0;
  } catch (e) {
    log.warn("createNotification failed", {
      type: input.type,
      dedupeKey: input.dedupeKey,
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

/**
 * Scan the latest round's projections and emit global notifications for:
 *   • status_change — high-rec player with play probability < 50 %
 *   • price         — notable player with |variation| >= C$2
 *   • trap          — mass-owned player with low expected points
 *
 * All notifications are global (userId = null) and idempotent within a round.
 * Safe to call multiple times for the same round — duplicates are discarded.
 */
export async function generateEtlNotifications(round: number): Promise<void> {
  log.debug("Scanning projections for notifications", { round });

  const rows = await db
    .select({
      playerId: playerProjectionTable.playerId,
      name: playersTable.name,
      nickname: playersTable.nickname,
      position: playersTable.position,
      price: playersTable.price,
      priceVariation: playersTable.priceVariation,
      popularity: playersTable.popularity,
      expectedPoints: playerProjectionTable.expectedPoints,
      recommendationScore: playerProjectionTable.recommendationScore,
      playProbability: playerProjectionTable.playProbability,
    })
    .from(playerProjectionTable)
    .innerJoin(playersTable, eq(playerProjectionTable.playerId, playersTable.id))
    .where(eq(playerProjectionTable.round, round));

  let created = 0;

  for (const r of rows) {
    const name = r.nickname ?? r.name ?? "Jogador";
    const pos = r.position ?? "";
    const rec = r.recommendationScore ?? 0;
    const prob = r.playProbability ?? 1;
    const pts = r.expectedPoints ?? 0;
    const variation = r.priceVariation ?? 0;
    const price = r.price ?? 0;
    const pop = r.popularity ?? 0;

    // ── status_change ────────────────────────────────────────────────────────
    // A high-recommended player (rec >= 7) has probability < 50 % of playing.
    // Users who scaled him may lose points on a bench-warmer.
    if (rec >= HIGH_REC_THRESHOLD && prob < LOW_PROB_THRESHOLD) {
      const ok = await createNotification({
        type: "status_change",
        title: `⚠️ ${name} em dúvida`,
        body: `${name} (${pos}) tem ${(prob * 100).toFixed(0)}% de chance de jogar na rodada ${round}. Considere uma alternativa.`,
        payload: { playerId: r.playerId, round, playProbability: prob, recommendationScore: rec },
        dedupeKey: `status_change:player:${r.playerId}:round:${round}`,
      });
      if (ok) created++;
    }

    // ── price ────────────────────────────────────────────────────────────────
    // Notable player (rec >= 7) with price movement >= C$2 (up or down).
    // Helps users track valuation opportunities or budget changes.
    if (rec >= HIGH_REC_THRESHOLD && Math.abs(variation) >= PRICE_ALERT_MIN_C) {
      const dir = variation > 0 ? "subiu" : "caiu";
      const sign = variation > 0 ? "+" : "";
      const ok = await createNotification({
        type: "price",
        title: `💰 ${name} ${dir} C$${sign}${variation.toFixed(2)}`,
        body: `${name} (${pos}) ${dir} C$${Math.abs(variation).toFixed(2)} — agora custa C$${price.toFixed(2)} com projeção de ${pts.toFixed(1)} pts na rodada ${round}.`,
        payload: { playerId: r.playerId, round, priceVariation: variation, price, expectedPoints: pts },
        dedupeKey: `price:player:${r.playerId}:round:${round}`,
      });
      if (ok) created++;
    }

    // ── trap ─────────────────────────────────────────────────────────────────
    // Mass-owned player (pop >= 20 %) with weak expected output and low rec.
    // High ownership + low projection = differential disadvantage for everyone.
    if (pop >= HIGH_POPULARITY_THRESHOLD && pts < TRAP_POINTS_MAX && rec < TRAP_REC_MAX) {
      const ok = await createNotification({
        type: "trap",
        title: `🪤 Armadilha: ${name}`,
        body: `${name} (${pos}) está em ${(pop * 100).toFixed(0)}% das escalações mas projeta apenas ${pts.toFixed(1)} pts na rodada ${round}. Considere evitar.`,
        payload: { playerId: r.playerId, round, popularity: pop, expectedPoints: pts, recommendationScore: rec },
        dedupeKey: `trap:player:${r.playerId}:round:${round}`,
      });
      if (ok) created++;
    }
  }

  if (created > 0) {
    log.info(`Created ${created} new notifications for round ${round}`);
  } else {
    log.debug(`No new notifications for round ${round} (none triggered or all deduplicated)`);
  }
}

/**
 * Emit a global market status notification (market_open / market_close).
 * Idempotent: one notification per type per round.
 */
export async function createMarketNotification(
  type: "market_open" | "market_close",
  round: number
): Promise<void> {
  const isOpen = type === "market_open";
  const inserted = await createNotification({
    type,
    title: isOpen
      ? `🟢 Mercado aberto — Rodada ${round}`
      : `🔴 Mercado fechado — Rodada ${round}`,
    body: isOpen
      ? `O mercado da rodada ${round} está aberto. Você ainda pode alterar sua escalação.`
      : `O mercado da rodada ${round} fechou. Aguarde a reabertura para ajustar sua escalação.`,
    payload: { round },
    dedupeKey: `${type}:round:${round}`,
  });
  if (inserted) {
    log.info(`Market notification created`, { type, round });
  }
}
