import axios from "axios";
import { z } from "zod";
import { db } from "@workspace/db";
import { roundSnapshotTable, dataCollectionLogTable } from "@workspace/db/schema";
import { desc, eq, and } from "drizzle-orm";
import crypto from "crypto";
import { fetchPopularityMap } from "./gatoMestreProvider";

const BASE_URL = "https://api.cartola.globo.com";

const CartolaClubeSchema = z.object({
  id: z.number(),
  nome: z.string(),
  abreviacao: z.string(),
  nome_fantasia: z.string().optional(),
  escudo_url: z.string().optional(),
  escudos: z.record(z.string()).optional(),
});

const CartolaAtletaSchema = z.object({
  atleta_id: z.number(),
  nome: z.string(),
  apelido: z.string().optional(),
  posicao_id: z.number(),
  clube_id: z.number(),
  status_id: z.number().optional(),
  preco_num: z.number().optional(),
  media_num: z.number().optional(),
  pontos_num: z.number().optional(),
  variacao_num: z.number().optional(),
  entrou_em_campo: z.boolean().optional(),
  jogos_num: z.number().optional(),
  minimo_para_valorizar: z.number().optional(),
  foto: z.string().optional(),
  scout: z.record(z.number()).optional(),
});

const CartolaMarketSchema = z.object({
  atletas: z.array(CartolaAtletaSchema),
  clubes: z.record(CartolaClubeSchema),
  status: z
    .object({
      rodada_atual: z.number().optional(),
      mercado_status: z.number().optional(),
      fechamento: z.object({ seconds: z.number() }).optional(),
    })
    .optional(),
});

const CartolaRoundSchema = z.object({
  rodada_atual: z.number(),
  rodada_id: z.number().optional(),
  status_mercado: z.number().optional(),
  mercado_status: z.number().optional(),
  fechamento: z.object({
    seconds: z.number().optional(),
    timestamp: z.number().optional(),
    dia: z.number().optional(),
    mes: z.number().optional(),
    ano: z.number().optional(),
    hora: z.number().optional(),
    minuto: z.number().optional(),
  }).optional(),
  times_escalados: z.number().optional(),
  variacao: z.number().optional(),
}).passthrough();

const POSITION_MAP: Record<number, string> = {
  1: "GOL",
  2: "LAT",
  3: "ZAG",
  4: "MEI",
  5: "ATA",
  6: "TEC",
};

const STATUS_MAP: Record<number, string> = {
  2: "Dúvida",
  3: "Suspenso",
  5: "Contundido",
  6: "Nulo",
  7: "Provável",
};

export type CartolaClub = {
  externalSource: string;
  externalId: string;
  name: string;
  shortName: string;
  abbreviation: string;
  badgeUrl: string | null;
};

export type CartolaPlayer = {
  externalSource: string;
  externalId: string;
  clubExternalId: string;
  name: string;
  nickname: string | null;
  position: string;
  status: string | null;
  price: number | null;
  averagePoints: number | null;
  popularity: number | null;
  priceVariation: number | null;
  playedLastRound: boolean | null;
  gamesPlayed: number | null;
  minimoParaValorizar: number | null;
  cumulativeScouts: Record<string, number> | null;
};

export type CartolaRound = {
  roundNumber: number;
  marketStatus: number;
  closingTimestamp: number | null;
};

export type CartolaMarketResult = {
  clubs: CartolaClub[];
  players: CartolaPlayer[];
  round: CartolaRound;
};

async function logCollection(source: string, entityType: string, status: string, message: string, metadata?: unknown) {
  try {
    await db.insert(dataCollectionLogTable).values({
      source,
      entityType,
      status,
      message,
      metadataJson: metadata ?? null,
    });
  } catch {
    console.error("[cartolaApiProvider] Failed to write collection log");
  }
}

async function saveSnapshot(round: number, source: string, payload: unknown) {
  const payloadStr = JSON.stringify(payload);
  const hash = crypto.createHash("sha256").update(payloadStr).digest("hex");
  await db.insert(roundSnapshotTable).values({
    round,
    source,
    payloadJson: payload as Record<string, unknown>,
    hash,
  });
}

async function getLastMarketSnapshot(): Promise<CartolaMarketResult | null> {
  const snapshot = await db.query.roundSnapshotTable
    .findFirst({
      where: (t) => eq(t.source, "cartola_api"),
      orderBy: (t) => [desc(t.collectedAt)],
    })
    .catch(() => null);

  if (!snapshot) return null;

  const payload = snapshot.payloadJson as { market?: unknown; status?: unknown };
  const marketParsed = CartolaMarketSchema.safeParse(payload.market);
  const roundParsed = CartolaRoundSchema.safeParse(payload.status);

  if (!marketParsed.success) return null;

  const market = marketParsed.data;
  const roundNumber = roundParsed.success ? roundParsed.data.rodada_atual : snapshot.round;

  // Fetch popularity from Gato Mestre (2-hour cache in DB)
  const popularityMap = await fetchPopularityMap(roundNumber).catch(() => new Map<string, number>());

  const clubs: CartolaClub[] = Object.entries(market.clubes).map(([, clube]) => ({
    externalSource: "cartola_api",
    externalId: String(clube.id),
    name: clube.nome,
    shortName: clube.nome_fantasia ?? clube.nome,
    abbreviation: clube.abreviacao,
    badgeUrl: clube.escudos?.["60x60"] ?? clube.escudo_url ?? null,
  }));

  const players: CartolaPlayer[] = market.atletas.map((atleta) => ({
    externalSource: "cartola_api",
    externalId: String(atleta.atleta_id),
    clubExternalId: String(atleta.clube_id),
    name: atleta.nome,
    nickname: atleta.apelido ?? null,
    position: POSITION_MAP[atleta.posicao_id] ?? "MEI",
    status: atleta.status_id != null ? (STATUS_MAP[atleta.status_id] ?? null) : null,
    price: atleta.preco_num ?? null,
    averagePoints: atleta.media_num ?? null,
    popularity: popularityMap.get(String(atleta.atleta_id)) ?? null,
    priceVariation: atleta.variacao_num ?? null,
    playedLastRound: atleta.entrou_em_campo ?? null,
    gamesPlayed: atleta.jogos_num ?? null,
    minimoParaValorizar: atleta.minimo_para_valorizar ?? null,
    cumulativeScouts: atleta.scout ?? null,
  }));

  return {
    clubs,
    players,
    round: {
      roundNumber,
      marketStatus: roundParsed.success ? (roundParsed.data.status_mercado ?? roundParsed.data.mercado_status ?? 0) : 0,
      closingTimestamp: roundParsed.success ? (roundParsed.data.fechamento?.seconds ?? roundParsed.data.fechamento?.timestamp ?? null) : null,
    },
  };
}

export async function fetchMarket(): Promise<CartolaMarketResult> {
  const source = "cartola_api";
  try {
    const glbId = process.env.GLOBO_GLLIB ?? "";
    const authHeaders = glbId ? { Cookie: `GLBID=${glbId}` } : {};

    const [marketRes, roundRes] = await Promise.all([
      axios.get(`${BASE_URL}/atletas/mercado`, { timeout: 15000, headers: authHeaders }),
      axios.get(`${BASE_URL}/mercado/status`, { timeout: 15000 }),
    ]);

    const marketParsed = CartolaMarketSchema.safeParse(marketRes.data);
    const roundParsed = CartolaRoundSchema.safeParse(roundRes.data);

    if (!marketParsed.success) {
      await logCollection(source, "market", "error", `Zod validation failed: ${marketParsed.error.message}`);
      throw new Error(`Cartola API market validation failed: ${marketParsed.error.message}`);
    }

    const roundNumber = roundParsed.success ? roundParsed.data.rodada_atual : 1;
    await saveSnapshot(roundNumber, source, { market: marketRes.data, status: roundRes.data });

    const market = marketParsed.data;

    // Fetch popularity from Gato Mestre (2-hour DB cache, non-blocking on failure)
    const popularityMap = await fetchPopularityMap(roundNumber).catch(() => new Map<string, number>());

    const clubs: CartolaClub[] = Object.entries(market.clubes).map(([, clube]) => ({
      externalSource: source,
      externalId: String(clube.id),
      name: clube.nome,
      shortName: clube.nome_fantasia ?? clube.nome,
      abbreviation: clube.abreviacao,
      badgeUrl: clube.escudos?.["60x60"] ?? clube.escudo_url ?? null,
    }));

    const players: CartolaPlayer[] = market.atletas.map((atleta) => ({
      externalSource: source,
      externalId: String(atleta.atleta_id),
      clubExternalId: String(atleta.clube_id),
      name: atleta.nome,
      nickname: atleta.apelido ?? null,
      position: POSITION_MAP[atleta.posicao_id] ?? "MEI",
      status: atleta.status_id != null ? (STATUS_MAP[atleta.status_id] ?? null) : null,
      price: atleta.preco_num ?? null,
      averagePoints: atleta.media_num ?? null,
      popularity: popularityMap.get(String(atleta.atleta_id)) ?? null,
      priceVariation: atleta.variacao_num ?? null,
      playedLastRound: atleta.entrou_em_campo ?? null,
      gamesPlayed: atleta.jogos_num ?? null,
      minimoParaValorizar: atleta.minimo_para_valorizar ?? null,
      cumulativeScouts: atleta.scout ?? null,
    }));

    const roundData: CartolaRound = {
      roundNumber,
      marketStatus: roundParsed.success ? (roundParsed.data.status_mercado ?? roundParsed.data.mercado_status ?? 0) : 0,
      closingTimestamp: roundParsed.success ? (roundParsed.data.fechamento?.seconds ?? roundParsed.data.fechamento?.timestamp ?? null) : null,
    };

    await logCollection(source, "market", "success", `Fetched ${players.length} players, ${clubs.length} clubs for round ${roundNumber}`);
    return { clubs, players, round: roundData };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await logCollection(source, "market", "error", msg);

    // Fallback: use last valid snapshot and mark source as degraded
    const lastSnapshot = await getLastMarketSnapshot();
    if (lastSnapshot) {
      await logCollection(source, "market", "degraded", `Using last valid snapshot from DB after error: ${msg}`);
      return lastSnapshot;
    }

    // No snapshot available — rethrow
    throw error;
  }
}

export async function fetchScouts(round: number): Promise<Map<string, Record<string, number>>> {
  const source = "cartola_api";
  try {
    const res = await axios.get(`${BASE_URL}/atletas/pontuados`, { timeout: 15000 });
    await saveSnapshot(round, `${source}_scouts`, res.data);

    const scouts = new Map<string, Record<string, number>>();
    if (res.data?.atletas) {
      for (const [atletaId, data] of Object.entries(res.data.atletas as Record<string, Record<string, unknown>>)) {
        const scout: Record<string, number> = {};
        if (data.scout) {
          for (const [k, v] of Object.entries(data.scout as Record<string, number>)) {
            scout[k] = v;
          }
        }
        scout["pontos"] = (data as Record<string, number>).pontos_num ?? 0;
        scouts.set(atletaId, scout);
      }
    }

    await logCollection(source, "scouts", "success", `Fetched scouts for ${scouts.size} players in round ${round}`);
    return scouts;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await logCollection(source, "scouts", "degraded", `Scout fetch failed: ${msg}`);

    // Try to fall back to last valid scouts snapshot
    const lastSnapshot = await db.query.roundSnapshotTable
      .findFirst({
        where: (t) => eq(t.source, `${source}_scouts`),
        orderBy: (t) => [desc(t.collectedAt)],
      })
      .catch(() => null);

    if (lastSnapshot) {
      await logCollection(source, "scouts", "degraded", `Using last valid scouts snapshot from ${lastSnapshot.collectedAt.toISOString()}`);
      const payload = lastSnapshot.payloadJson as { atletas?: Record<string, Record<string, unknown>> };
      const scouts = new Map<string, Record<string, number>>();
      if (payload?.atletas) {
        for (const [atletaId, data] of Object.entries(payload.atletas)) {
          const scout: Record<string, number> = {};
          if (data.scout) {
            for (const [k, v] of Object.entries(data.scout as Record<string, number>)) {
              scout[k] = v;
            }
          }
          scout["pontos"] = (data as Record<string, number>).pontos_num ?? 0;
          scouts.set(atletaId, scout);
        }
      }
      return scouts;
    }

    return new Map();
  }
}
