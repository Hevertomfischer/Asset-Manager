import axios from "axios";
import { z } from "zod";
import { db } from "@workspace/db";
import { dataCollectionLogTable, roundSnapshotTable } from "@workspace/db/schema";
import crypto from "crypto";

const BASE_URL = "https://api.cartola.globo.com";

export const HistoricalScoutSchema = z.object({
  atleta_id: z.number(),
  rodada_id: z.number(),
  pontos_num: z.number().optional(),
  scout: z
    .object({
      G: z.number().optional(),
      A: z.number().optional(),
      FT: z.number().optional(),
      FD: z.number().optional(),
      FF: z.number().optional(),
      DP: z.number().optional(),
      PC: z.number().optional(),
      V: z.number().optional(),
      FS: z.number().optional(),
      FC: z.number().optional(),
      DE: z.number().optional(),
      DS: z.number().optional(),
      SG: z.number().optional(),
      GC: z.number().optional(),
      CV: z.number().optional(),
      CA: z.number().optional(),
      PP: z.number().optional(),
      PS: z.number().optional(),
      GS: z.number().optional(),
      I: z.number().optional(),
    })
    .optional(),
});

export type HistoricalScout = z.infer<typeof HistoricalScoutSchema>;

async function logCollection(status: string, message: string) {
  try {
    await db.insert(dataCollectionLogTable).values({
      source: "historical_cartola",
      entityType: "scouts",
      status,
      message,
    });
  } catch {
    console.error("[historicalCartolaProvider] Failed to write log");
  }
}

export async function fetchHistoricalRound(round: number): Promise<HistoricalScout[]> {
  const source = "historical_cartola";
  try {
    const res = await axios.get(`${BASE_URL}/atletas/pontuados/${round}`, { timeout: 15000 });

    const rawAtletas = res.data?.atletas ?? {};
    const scouts: HistoricalScout[] = [];

    for (const [atletaId, data] of Object.entries(rawAtletas as Record<string, unknown>)) {
      const record = {
        atleta_id: Number(atletaId),
        rodada_id: round,
        pontos_num: (data as Record<string, number>).pontos_num,
        scout: (data as { scout?: Record<string, number> }).scout,
      };
      const parsed = HistoricalScoutSchema.safeParse(record);
      if (parsed.success) {
        scouts.push(parsed.data);
      }
    }

    const payloadStr = JSON.stringify(scouts);
    const hash = crypto.createHash("sha256").update(payloadStr).digest("hex");

    await db.insert(roundSnapshotTable).values({
      round,
      source,
      payloadJson: { scouts },
      hash,
    });

    await logCollection("success", `Historical: fetched ${scouts.length} player scouts for round ${round}`);
    return scouts;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await logCollection("error", `Historical provider failed for round ${round}: ${msg}`);

    const lastSnapshot = await db.query.roundSnapshotTable
      .findFirst({
        where: (t, { and, eq }) => and(eq(t.source, source), eq(t.round, round)),
        orderBy: (t, { desc }) => [desc(t.collectedAt)],
      })
      .catch(() => null);

    if (lastSnapshot) {
      await logCollection("degraded", `Using last valid historical snapshot for round ${round}`);
      const payload = lastSnapshot.payloadJson as { scouts?: HistoricalScout[] };
      return payload?.scouts ?? [];
    }

    return [];
  }
}
