import axios from "axios";
import { findClubByExternalId, upsertClub } from "../repositories/clubRepository";
import { upsertMatch } from "../repositories/matchRepository";

interface CartolaClube {
  id: number;
  nome: string;
  abreviacao: string;
  nome_fantasia?: string;
  escudos?: { "60x60"?: string; "45x45"?: string; "30x30"?: string };
}

interface CartolaPartida {
  partida_id: number;
  clube_casa_id: number;
  clube_visitante_id: number;
  local?: string;
  partida_data?: string;
  placar_oficial_mandante?: number | null;
  placar_oficial_visitante?: number | null;
  aproveitamento_mandante?: string[] | null;
  aproveitamento_visitante?: string[] | null;
  periodo_tr?: string;
  valida?: boolean;
}

interface CartolaPartidasResponse {
  rodada: number;
  clubes: Record<string, CartolaClube>;
  partidas: CartolaPartida[];
}

const BASE_URL = "https://api.cartola.globo.com";

export async function syncMatchesFromCartolaApi(round: number): Promise<number> {
  const res = await axios.get<CartolaPartidasResponse>(`${BASE_URL}/partidas`, { timeout: 15000 });
  const effectiveRound = res.data.rodada ?? round;
  return syncPartidasResponse(res.data, effectiveRound);
}

export async function syncHistoricalMatchesFromCartolaApi(round: number): Promise<number> {
  const res = await axios.get<CartolaPartidasResponse>(`${BASE_URL}/partidas/${round}`, { timeout: 15000 });
  return syncPartidasResponse(res.data, round);
}

async function syncPartidasResponse(data: CartolaPartidasResponse, round: number): Promise<number> {
  const { partidas, clubes } = data;

  if (!Array.isArray(partidas) || partidas.length === 0) return 0;

  let upserted = 0;
  for (const partida of partidas) {
    const casaInfo = clubes[String(partida.clube_casa_id)];
    const visitanteInfo = clubes[String(partida.clube_visitante_id)];

    const [homeClubDb, awayClubDb] = await Promise.all([
      (async () => {
        let c = await findClubByExternalId("cartola_api", String(partida.clube_casa_id));
        if (!c && casaInfo) {
          c = await upsertClub({
            externalSource: "cartola_api",
            externalId: String(casaInfo.id),
            name: casaInfo.nome_fantasia ?? casaInfo.nome,
            shortName: casaInfo.nome,
            abbreviation: casaInfo.abreviacao,
            badgeUrl: casaInfo.escudos?.["60x60"] ?? null,
          });
        }
        return c;
      })(),
      (async () => {
        let c = await findClubByExternalId("cartola_api", String(partida.clube_visitante_id));
        if (!c && visitanteInfo) {
          c = await upsertClub({
            externalSource: "cartola_api",
            externalId: String(visitanteInfo.id),
            name: visitanteInfo.nome_fantasia ?? visitanteInfo.nome,
            shortName: visitanteInfo.nome,
            abbreviation: visitanteInfo.abreviacao,
            badgeUrl: visitanteInfo.escudos?.["60x60"] ?? null,
          });
        }
        return c;
      })(),
    ]);

    await upsertMatch({
      externalSource: "cartola_api",
      externalId: String(partida.partida_id),
      round,
      homeClubId: homeClubDb?.id ?? null,
      awayClubId: awayClubDb?.id ?? null,
      matchDate: partida.partida_data ? new Date(partida.partida_data) : null,
      stadium: partida.local ?? null,
      status: partida.periodo_tr ?? null,
      homeScore: partida.placar_oficial_mandante ?? null,
      awayScore: partida.placar_oficial_visitante ?? null,
      homeForm: partida.aproveitamento_mandante ?? null,
      awayForm: partida.aproveitamento_visitante ?? null,
    });
    upserted++;
  }

  return upserted;
}
