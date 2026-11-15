/** Cartola codes, not generic football abbreviations (DE means goalkeeper save). */
export const CARTOLA_SCOUT_COLUMN_CODES = {
  goals: "G",
  assists: "A",
  saves: "DE",
  penaltySaved: "DP",
  goalsConceded: "GS",
  ownGoals: "GC",
  tackles: "DS",
  shotsOnTarget: "FD",
  ff: "FF",
  ps: "PS",
  pc: "PC",
  v: "V",
  cleanSheet: "SG",
  penaltyMissed: "PP",
  foulsSuffered: "FS",
  foulsCommitted: "FC",
  yellowCards: "CA",
  redCards: "CV",
} as const;

export type CartolaScoutColumn = keyof typeof CARTOLA_SCOUT_COLUMN_CODES;
export type CartolaScout = Readonly<Record<string, number | string | null | undefined>>;
export type MappedCartolaScoutColumns = Record<CartolaScoutColumn, number | null> & {
  shots: number | null;
  interceptions: null;
};

function readCount(scout: CartolaScout, code: string): number | null {
  const value = scout[code];
  if (value == null || (typeof value === "string" && value.trim() === "")) return null;
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`Scout Cartola inválido: ${code} deve ser uma contagem inteira não negativa.`);
  }
  return count;
}

/** Shared by live ETL, historical ETL and CSV import; never maps I to interceptions. */
export function mapCartolaScoutToColumns(scout: CartolaScout): MappedCartolaScoutColumns {
  const columns = Object.fromEntries(
    Object.entries(CARTOLA_SCOUT_COLUMN_CODES).map(([column, code]) => [column, readCount(scout, code)]),
  ) as Record<CartolaScoutColumn, number | null>;
  const shots = [columns.shotsOnTarget, readCount(scout, "FT"), columns.ff];
  return {
    ...columns,
    shots: shots.every((count) => count === null) ? null : shots.reduce<number>((sum, count) => sum + (count ?? 0), 0),
    interceptions: null,
  };
}
