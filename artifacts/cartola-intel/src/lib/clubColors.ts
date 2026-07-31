/**
 * Paleta de cores dos clubes da Série A.
 * Usada na vista de campo para colorir as camisas estilizadas dos jogadores.
 */

export interface ClubColors {
  /** Cor principal da camisa */
  primary: string;
  /** Cor secundária (mangas, gola, detalhes) */
  secondary: string;
  /** Cor do texto sobre a cor primária */
  text: string;
}

export const CLUB_COLORS: Record<string, ClubColors> = {
  // Flamengo — vermelho e preto
  FLA: { primary: "#CC1212", secondary: "#1A1A1A", text: "#FFFFFF" },
  // Palmeiras — verde escuro e branco
  PAL: { primary: "#00622E", secondary: "#FFFFFF", text: "#FFFFFF" },
  // Corinthians — branco e preto
  COR: { primary: "#EFEFEF", secondary: "#1A1A1A", text: "#1A1A1A" },
  // São Paulo — branco com vermelho e preto
  SAO: { primary: "#E30613", secondary: "#FFFFFF", text: "#FFFFFF" },
  // Atlético-MG — preto e branco
  ATL: { primary: "#1A1A1A", secondary: "#FFFFFF", text: "#FFFFFF" },
  // Botafogo — preto e branco (estrela solitária)
  BOT: { primary: "#1A1A1A", secondary: "#FFFFFF", text: "#FFFFFF" },
  // Cruzeiro — azul royal e branco
  CRU: { primary: "#003087", secondary: "#FFFFFF", text: "#FFFFFF" },
  // Grêmio — azul celeste, preto e branco
  GRE: { primary: "#1F4397", secondary: "#0D0D0D", text: "#FFFFFF" },
  // Internacional — vermelho e branco
  INT: { primary: "#CC1212", secondary: "#FFFFFF", text: "#FFFFFF" },
  // Fluminense — granate, verde e branco
  FLU: { primary: "#791A35", secondary: "#1A7A3A", text: "#FFFFFF" },
  // Vasco da Gama — preto e branco
  VAS: { primary: "#1A1A1A", secondary: "#FFFFFF", text: "#FFFFFF" },
  // Bahia — azul e vermelho (listrado)
  BAH: { primary: "#003087", secondary: "#CC1212", text: "#FFFFFF" },
  // Vitória — vermelho e preto
  VIT: { primary: "#CC1212", secondary: "#1A1A1A", text: "#FFFFFF" },
  // Mirassol — amarelo e preto
  MIR: { primary: "#FFD700", secondary: "#1A1A1A", text: "#1A1A1A" },
  // Red Bull Bragantino — vermelho, branco e preto
  BRA: { primary: "#CC1212", secondary: "#FFFFFF", text: "#FFFFFF" },
  // Chapecoense — verde e branco
  CHA: { primary: "#1A7A3A", secondary: "#FFFFFF", text: "#FFFFFF" },
  // Criciúma — amarelo e preto
  CFC: { primary: "#F0C500", secondary: "#1A1A1A", text: "#1A1A1A" },
  // Athletic Club — vermelho e preto
  ATH: { primary: "#CC1212", secondary: "#1A1A1A", text: "#FFFFFF" },
  // Remo — azul e vermelho
  REM: { primary: "#003087", secondary: "#CC1212", text: "#FFFFFF" },
  // Juventude — verde e branco
  JUV: { primary: "#1A7A3A", secondary: "#FFFFFF", text: "#FFFFFF" },
  // Sport Recife — vermelho, preto e branco
  SPT: { primary: "#CC1212", secondary: "#1A1A1A", text: "#FFFFFF" },
  // América-MG — verde e branco
  AME: { primary: "#1A7A3A", secondary: "#FFFFFF", text: "#FFFFFF" },
  // Ceará — preto e branco
  CEA: { primary: "#1A1A1A", secondary: "#FFFFFF", text: "#FFFFFF" },
  // Athletico-PR — vermelho e preto
  CAP: { primary: "#CC1212", secondary: "#1A1A1A", text: "#FFFFFF" },
  // Cuiabá — dourado e verde
  CUI: { primary: "#D4A017", secondary: "#1A5C3A", text: "#1A1A1A" },
  // Fortaleza — vermelho, azul e branco
  FOR: { primary: "#CC1212", secondary: "#003087", text: "#FFFFFF" },
  // Santos — branco e preto
  SAN: { primary: "#F5F5F5", secondary: "#1A1A1A", text: "#1A1A1A" },
  // Atlético-MG alias (API retorna "CAM", mapa usa "ATL")
  CAM: { primary: "#1A1A1A", secondary: "#FFFFFF", text: "#FFFFFF" },
  // Red Bull Bragantino alias
  RBB: { primary: "#CC1212", secondary: "#FFFFFF", text: "#FFFFFF" },
};

const DEFAULT_COLORS: ClubColors = { primary: "#1e3a5f", secondary: "#4a90e2", text: "#FFFFFF" };

export function getClubColors(abbr: string | null | undefined): ClubColors {
  if (!abbr) return DEFAULT_COLORS;
  return CLUB_COLORS[abbr.toUpperCase()] ?? DEFAULT_COLORS;
}

/**
 * Overrides locais de badge — usados quando a imagem da API é inviável
 * (fundo branco transparente, URL quebrada, etc.).
 * Paths relativos ao /public da aplicação.
 */
export const CLUB_BADGE_OVERRIDES: Record<string, string> = {
  SAN: "/badges/SAN.png",
};

/**
 * Scale overrides — aplicados via CSS transform quando o logo do clube
 * é visualmente menor que os demais dentro do frame padrão 60x60.
 */
export const CLUB_BADGE_SCALE: Record<string, number> = {
  CHA: 1.5,
};

/**
 * Retorna a URL do badge a usar, priorizando override local sobre a URL da API.
 */
export function getBadgeUrl(
  abbr: string | null | undefined,
  apiUrl: string | null | undefined,
): string | undefined {
  const key = abbr?.toUpperCase();
  if (key && CLUB_BADGE_OVERRIDES[key]) return CLUB_BADGE_OVERRIDES[key];
  return apiUrl ?? undefined;
}

/**
 * Retorna o fator de scale CSS a aplicar na imagem do badge (padrão 1).
 */
export function getBadgeScale(abbr: string | null | undefined): number {
  const key = abbr?.toUpperCase();
  return (key && CLUB_BADGE_SCALE[key]) ?? 1;
}
