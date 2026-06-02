import { z } from "zod";
import { db } from "@workspace/db";
import { dataCollectionLogTable, roundSnapshotTable } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import type { CartolaStatusResult } from "./cartolaStatusProvider";

const GeProbablePlayerSchema = z.object({
  name: z.string(),
  clubName: z.string(),
  probable: z.boolean(),
  position: z.string().optional(),
});

export type GeProbablePlayer = z.infer<typeof GeProbablePlayerSchema>;

async function logCollection(status: string, message: string) {
  try {
    await db.insert(dataCollectionLogTable).values({
      source: "ge_probables",
      entityType: "probables",
      status,
      message,
    });
  } catch {
    console.error("[geProbablesProvider] Failed to write log");
  }
}

/**
 * Derives the list of probable players from the latest Cartola Status snapshot.
 *
 * The original GE Globo escalações page (ge.globo.com/futebol/brasileirao-serie-a/escalacoes.html)
 * was taken offline in May 2026. The Cartola FC API already surfaces the same information
 * via statusId:
 *   - statusId=7 → "Provável" (probable: true)
 *   - statusId=2 → "Dúvida"  (probable: false — included so the availability engine
 *                               can still apply the doubt-boost)
 *
 * NOTE: Cartola Status must run BEFORE this function is called so its snapshot is already
 * stored in round_snapshots. The ETL pipeline guarantees this order.
 */
export async function fetchProbables(_round: number): Promise<GeProbablePlayer[]> {
  try {
    const snapshot = await db.query.roundSnapshotTable
      .findFirst({
        where: (t) => eq(t.source, "cartola_status"),
        orderBy: (t) => [desc(t.collectedAt)],
      })
      .catch(() => null);

    if (!snapshot) {
      await logCollection(
        "degraded",
        "Sem snapshot do Cartola Status disponível — lista de prováveis vazia"
      );
      return [];
    }

    const payload = snapshot.payloadJson as { result?: CartolaStatusResult };
    const result = payload.result;

    if (!result?.players?.length) {
      await logCollection(
        "degraded",
        "Snapshot do Cartola Status sem dados de jogadores"
      );
      return [];
    }

    const players: GeProbablePlayer[] = result.players
      .filter((p) => p.statusId === 7 || p.statusId === 2)
      .map((p) => ({
        name: p.nickname ?? p.name,
        clubName: p.clubExternalId,
        probable: p.statusId === 7,
      }));

    const probableCount = players.filter((p) => p.probable).length;
    const doubtCount = players.filter((p) => !p.probable).length;

    await logCollection(
      "success",
      `Derivados ${probableCount} prováveis e ${doubtCount} em dúvida do Cartola Status (snapshot ${snapshot.collectedAt.toISOString()})`
    );

    return players;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await logCollection("error", `Falha ao derivar prováveis do Cartola Status: ${msg}`);
    return [];
  }
}
