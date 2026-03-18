import type { PlayerFeatures } from "../engines/IProjectionEngine";
import { createLogger } from "./logger";

const log = createLogger("feature-extractor");

interface RawPlayerData {
  playerId: number;
  round: number;
  position: string;
  clubId: number | null;
  price: number;
  popularity: number;
  scouts: Array<{ round: number; points: number; minutesPlayed: number; goals: number; assists: number; cleanSheet: number; yellowCards: number }>;
  playProbability: number;
  homeGame: boolean;
  opponentDefensiveStrength: number;
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = avg(arr);
  return Math.sqrt(arr.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / arr.length);
}

export function extractFeatures(raw: RawPlayerData): PlayerFeatures {
  log.debug(`Extracting features for player ${raw.playerId} round ${raw.round}`);

  const recentN = (n: number) => raw.scouts.slice(-n);
  const pointsArr = (scouts: typeof raw.scouts) => scouts.map((s) => s.points);

  const scouts3 = recentN(3);
  const scouts5 = recentN(5);
  const scouts8 = recentN(8);

  const goals3 = scouts3.reduce((a, s) => a + s.goals, 0);
  const assists3 = scouts3.reduce((a, s) => a + s.assists, 0);
  const cleanSheets3 = scouts3.reduce((a, s) => a + s.cleanSheet, 0);
  const yellowCards3 = scouts3.reduce((a, s) => a + s.yellowCards, 0);
  const minutesPlayed3Avg = avg(scouts3.map((s) => s.minutesPlayed));

  return {
    playerId: raw.playerId,
    round: raw.round,
    position: raw.position,
    clubId: raw.clubId,
    price: raw.price,
    popularity: raw.popularity,
    avgPoints3: avg(pointsArr(scouts3)),
    avgPoints5: avg(pointsArr(scouts5)),
    avgPoints8: avg(pointsArr(scouts8)),
    volatility: stdDev(pointsArr(scouts5)),
    playProbability: raw.playProbability,
    homeGame: raw.homeGame,
    opponentDefensiveStrength: raw.opponentDefensiveStrength,
    minutesPlayed3Avg,
    goals3,
    assists3,
    cleanSheets3,
    yellowCards3,
  };
}
