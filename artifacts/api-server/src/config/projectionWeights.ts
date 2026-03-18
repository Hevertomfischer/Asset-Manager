export const PROJECTION_WEIGHTS = {
  recentFormRounds: 5,
  weights: {
    overallAverage: 0.3,
    recentForm: 0.35,
    matchup: 0.15,
    playProbability: 0.15,
    homeAdvantage: 0.05,
  },
  homeAdvantageMultiplier: 1.08,
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
