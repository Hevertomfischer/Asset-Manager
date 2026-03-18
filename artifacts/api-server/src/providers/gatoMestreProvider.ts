import axios from "axios";
import { z } from "zod";
import { db } from "@workspace/db";
import { dataCollectionLogTable, roundSnapshotTable } from "@workspace/db/schema";
import crypto from "crypto";

const GATO_BASE = "https://www.gatomestre.com.br";

const GatoPlayerStatSchema = z.object({
  player_id: z.string().or(z.number()).transform(String),
  player_name: z.string(),
  club_id: z.string().or(z.number()).optional().transform((v) => (v != null ? String(v) : undefined)),
  position: z.string().optional(),
  avg_points: z.number().optional(),
  std_dev: z.number().optional(),
  last_5_avg: z.number().optional(),
  home_avg: z.number().optional(),
  away_avg: z.number().optional(),
  price: z.number().optional(),
  value_ratio: z.number().optional(),
});

export type GatoPlayerStat = z.infer<typeof GatoPlayerStatSchema>;

async function logCollection(status: string, message: string) {
  try {
    await db.insert(dataCollectionLogTable).values({
      source: "gato_mestre",
      entityType: "stats",
      status,
      message,
    });
  } catch {
    console.error("[gatoMestreProvider] Failed to write log");
  }
}

export async function fetchPlayerStats(round: number): Promise<GatoPlayerStat[]> {
  const source = "gato_mestre";
  try {
    const response = await axios.get(`${GATO_BASE}/estatisticas`, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CartolaIntel/1.0)",
        Accept: "application/json, text/html",
      },
    });

    let rawData: unknown[] = [];

    if (Array.isArray(response.data)) {
      rawData = response.data as unknown[];
    } else if (response.data && typeof response.data === "object" && "atletas" in response.data) {
      rawData = (response.data as { atletas: unknown[] }).atletas;
    } else if (response.data && typeof response.data === "object" && "players" in response.data) {
      rawData = (response.data as { players: unknown[] }).players;
    }

    const stats: GatoPlayerStat[] = [];
    for (const item of rawData) {
      const parsed = GatoPlayerStatSchema.safeParse(item);
      if (parsed.success) {
        stats.push(parsed.data);
      }
    }

    const payloadStr = JSON.stringify(stats);
    const hash = crypto.createHash("sha256").update(payloadStr).digest("hex");

    await db.insert(roundSnapshotTable).values({
      round,
      source,
      payloadJson: { stats },
      hash,
    });

    await logCollection("success", `GatoMestre: fetched ${stats.length} player stats for round ${round}`);
    return stats;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await logCollection("error", `GatoMestre failed: ${msg}`);

    const lastSnapshot = await db.query.roundSnapshotTable
      .findFirst({
        where: (t, { eq }) => eq(t.source, source),
        orderBy: (t, { desc }) => [desc(t.collectedAt)],
      })
      .catch(() => null);

    if (lastSnapshot) {
      await logCollection("degraded", `Using last valid GatoMestre snapshot from ${lastSnapshot.collectedAt.toISOString()}`);
      const payload = lastSnapshot.payloadJson as { stats?: GatoPlayerStat[] };
      return payload?.stats ?? [];
    }

    return [];
  }
}
