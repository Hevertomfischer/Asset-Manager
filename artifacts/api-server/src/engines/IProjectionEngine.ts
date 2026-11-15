export interface PlayerFeatures {
  playerId: number;
  round: number;
  position: string;
  clubId: number | null;
  price: number;
  popularity: number | null;
  avgPoints3: number;
  avgPoints5: number;
  avgPoints8: number;
  volatility: number;
  playProbability: number;
  homeGame: boolean;
  opponentDefensiveStrength: number;
  minutesPlayed3Avg: number;
  goals3: number;
  assists3: number;
  cleanSheets3: number;
  yellowCards3: number;
}

export interface ProjectionResult {
  playerId: number;
  round: number;
  expectedPoints: number;
  floorPoints: number;
  ceilingPoints: number;
  riskScore: number;
  formScore: number;
  valueScore: number;
  recommendationScore: number;
  differentialScore: number;
  isTrap: boolean;
  explanationJson: Record<string, unknown>;
}

export interface IProjectionEngine {
  projectPlayer(features: PlayerFeatures): ProjectionResult;
  projectBatch(features: PlayerFeatures[]): ProjectionResult[];
}
