// Official Cartola FC scout values — https://www.cartolafcbrasil.com.br/scouts
export const SCOUT_SCORING: Record<string, number> = {
  G:  8.0,   // Gol
  A:  5.0,   // Assistência
  SG: 5.0,   // Saldo de Gols (sem sofrer gol / clean sheet bonus)
  FT: 3.0,   // Finalização na Trave
  DP: 7.0,   // Defesa de Pênalti
  DE: 1.3,   // Defesa (goleiro)
  PS: 1.0,   // Pênalti Sofrido
  FD: 1.2,   // Finalização Defendida
  DS: 1.5,   // Desarme
  FF: 0.8,   // Finalização para Fora
  FS: 0.5,   // Falta Sofrida
  GC: -3.0,  // Gol Contra
  CV: -3.0,  // Cartão Vermelho
  CA: -1.0,  // Cartão Amarelo
  GS: -1.0,  // Gol Sofrido
  PP: -4.0,  // Pênalti Perdido
  PC: -1.0,  // Pênalti Cometido
  FC: -0.3,  // Falta Cometida
  I:  -0.1,  // Impedimento
};

export const POSITION_SCOUT_WEIGHTS: Record<string, Record<string, number>> = {
  GOL: { SG: 2.0, PS: 1.8, GC: 1.5, DE: 0.8, DS: 0.8 },
  ZAG: { SG: 1.6, DE: 1.4, DS: 1.3, G: 1.2, CA: 1.2, CV: 1.2 },
  LAT: { A: 1.3, DS: 1.2, DE: 1.2, FS: 1.1, SG: 1.3 },
  MEI: { A: 1.4, G: 1.2, FT: 1.2, FS: 1.1, FC: 1.1 },
  ATA: { G: 1.5, FT: 1.3, FD: 1.2, A: 1.1, PP: 1.2 },
  TEC: {},
};

export const PROJECTION_WEIGHTS = {
  recentFormRounds: 5,
  multiWindow: {
    short: { rounds: 3, weight: 0.40 },
    medium: { rounds: 5, weight: 0.35 },
    long: { rounds: 8, weight: 0.25 },
  },
  weights: {
    overallAverage: 0.3,
    recentForm: 0.35,
    matchup: 0.15,
    playProbability: 0.15,
    homeAdvantage: 0.05,
  },
  homeAdvantageMultiplier: 1.08,
  volatility: {
    lowThreshold: 1.5,
    highThreshold: 4.0,
    ceilingMultiplierHigh: 1.8,
    ceilingMultiplierLow: 1.5,
    floorMultiplierHigh: 0.3,
    floorMultiplierLow: 0.45,
  },
  riskPenalty: {
    lowProbability: 0.6,
    mediumProbability: 0.8,
    highProbability: 1.0,
    lowThreshold: 0.5,
    mediumThreshold: 0.8,
  },
  positionCleanSheetBonus: {
    GOL: 5.0,
    LAT: 2.0,
    ZAG: 3.0,
    MEI: 1.0,
    ATA: 0.0,
    TEC: 0.0,
  },
  valueScoreDivisor: 5.0,
  floors: {
    minExpectedMinutes: 30,
  },
  differential: {
    lowPopularityThreshold: 0.2,
    highProjectionThreshold: 5.0,
    trapPopularityThreshold: 0.6,
    trapRiskThreshold: 0.4,
    trapFormDeclineThreshold: 0.7,
  },
  valorizacao: {
    /**
     * PRIMARY signal: continuous margin weight.
     *
     * marginScore = clamp((projection − MPV) / MPV, −1, 2) × marginWeight
     *
     * Examples at marginWeight=18:
     *   proj=12, MPV=6  → +100% margin → +18   (very safe to valorize)
     *   proj=7,  MPV=6  → +16%  margin → +2.9  (likely to valorize)
     *   proj=6,  MPV=6  → 0%    margin → 0     (right on the edge)
     *   proj=4,  MPV=6  → −33%  margin → −6    (will not valorize)
     *
     * When MPV is null (not yet published), marginScore = 0 and the
     * tiebreaker signals (variation, momentum, form) decide ordering.
     */
    marginWeight: 18.0,
    /** Multiplier on priceVariation — secondary tiebreaker. */
    variationWeight: 1.0,
    /** Multiplier on momentum (shortAvg vs mediumAvg trend). */
    momentumWeight: 2.0,
    /** Multiplier on formTrend from projection engine. */
    formTrendWeight: 1.5,
    /** Weight on expectedPoints — keeps lineup viable. */
    expectedWeight: 0.15,
  },
};

export const LINEUP_CONFIG = {
  maxPlayersPerClub: 5,
  positions: {
    GOL: { min: 1, max: 1 },
    ZAG: { min: 0, max: 3 },
    LAT: { min: 0, max: 2 },
    MEI: { min: 0, max: 5 },
    ATA: { min: 0, max: 3 },
    TEC: { min: 1, max: 1 },
  },
  formations: {
    "3-4-3": { ZAG: 3, LAT: 0, MEI: 4, ATA: 3 },
    "3-5-2": { ZAG: 3, LAT: 0, MEI: 5, ATA: 2 },
    "4-3-3": { ZAG: 2, LAT: 2, MEI: 3, ATA: 3 },
    "4-4-2": { ZAG: 2, LAT: 2, MEI: 4, ATA: 2 },
    "4-5-1": { ZAG: 2, LAT: 2, MEI: 5, ATA: 1 },
    "5-3-2": { ZAG: 3, LAT: 2, MEI: 3, ATA: 2 },
    "5-4-1": { ZAG: 3, LAT: 2, MEI: 4, ATA: 1 },
  } as Record<string, Record<string, number>>,
  defaultFormation: "4-4-2",
  defaultBudget: 100,
  totalFieldPlayers: 11,
};
