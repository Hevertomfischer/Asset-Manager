import axios from "axios";
import * as cheerio from "cheerio";
import { z } from "zod";
import { db } from "@workspace/db";
import { dataCollectionLogTable, roundSnapshotTable } from "@workspace/db/schema";
import crypto from "crypto";

const GE_URL = "https://ge.globo.com/futebol/brasileirao-serie-a/escalacoes.html";

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

export async function fetchProbables(round: number): Promise<GeProbablePlayer[]> {
  const source = "ge_probables";
  try {
    const response = await axios.get(GE_URL, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CartolaIntel/1.0)",
        Accept: "text/html",
      },
    });

    const $ = cheerio.load(response.data as string);
    const players: GeProbablePlayer[] = [];

    $(".escalacao-clube").each((_i, clubEl) => {
      const clubName = $(clubEl).find(".escalacao-clube-nome").text().trim();
      $(clubEl)
        .find(".escalacao-atleta")
        .each((_j, playerEl) => {
          const name = $(playerEl).find(".escalacao-atleta-nome").text().trim();
          const probable = !$(playerEl).hasClass("escalacao-atleta--duvidoso");
          if (name) {
            players.push({ name, clubName, probable });
          }
        });
    });

    const payloadStr = JSON.stringify({ players, fetchedAt: new Date().toISOString() });
    const hash = crypto.createHash("sha256").update(payloadStr).digest("hex");

    await db.insert(roundSnapshotTable).values({
      round,
      source,
      payloadJson: { players },
      hash,
    });

    await logCollection("success", `Scraped ${players.length} probable players from GE for round ${round}`);
    return players;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await logCollection("error", `GE Prováveis failed: ${msg}`);

    const lastSnapshot = await db.query.roundSnapshotTable
      .findFirst({
        where: (t, { eq }) => eq(t.source, source),
        orderBy: (t, { desc }) => [desc(t.collectedAt)],
      })
      .catch(() => null);

    if (lastSnapshot) {
      await logCollection("degraded", `Using last valid snapshot from ${lastSnapshot.collectedAt.toISOString()}`);
      const payload = lastSnapshot.payloadJson as { players?: GeProbablePlayer[] };
      return payload?.players ?? [];
    }

    return [];
  }
}
