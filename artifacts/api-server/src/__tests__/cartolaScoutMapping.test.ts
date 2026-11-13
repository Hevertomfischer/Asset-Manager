import { describe, expect, it } from "vitest";
import { mapCartolaScoutToColumns } from "../lib/mapCartolaScoutToColumns";
import { HistoricalScoutSchema } from "../providers/historicalCartolaProvider";

const mappings = [
  ["G", "goals"], ["A", "assists"], ["DE", "saves"], ["DP", "penaltySaved"],
  ["GS", "goalsConceded"], ["GC", "ownGoals"], ["DS", "tackles"],
  ["FD", "shotsOnTarget"], ["FF", "ff"], ["PS", "ps"], ["PC", "pc"], ["V", "v"],
  ["SG", "cleanSheet"], ["PP", "penaltyMissed"], ["FS", "foulsSuffered"],
  ["FC", "foulsCommitted"], ["CA", "yellowCards"], ["CV", "redCards"],
] as const;

describe("mapCartolaScoutToColumns", () => {
  it.each(mappings)("%s é mapeado para %s, tanto em JSON como em CSV", (code, column) => {
    expect(mapCartolaScoutToColumns({ [code]: 3 })[column]).toBe(3);
    expect(mapCartolaScoutToColumns({ [code]: "3" })[column]).toBe(3);
    expect(mapCartolaScoutToColumns({ [code]: 0 })[column]).toBe(0);
  });
  it("mantém DE/DP/GS/GC/DS/PS separados, mesmo presentes simultaneamente", () => {
    expect(mapCartolaScoutToColumns({ DE: 2, DP: 3, GS: 4, GC: 5, DS: 6, PS: 7 })).toMatchObject({
      saves: 2, penaltySaved: 3, goalsConceded: 4, ownGoals: 5, tackles: 6, ps: 7,
    });
  });
  it("shots soma FD+FT+FF sem alterar as contagens individuais", () => {
    expect(mapCartolaScoutToColumns({ FD: 2, FT: 3, FF: 4 })).toMatchObject({
      shots: 9, shotsOnTarget: 2, ff: 4,
    });
    expect(mapCartolaScoutToColumns({ FT: 2 }).shots).toBe(2);
    expect(mapCartolaScoutToColumns({ FD: 0, FF: 0 }).shots).toBe(0);
  });
  it("não confunde impedimentos ou defesas com interceptações", () => {
    expect(mapCartolaScoutToColumns({ I: 5, DE: 4 }).interceptions).toBeNull();
  });
  it("ausências e células vazias são nulas; zero explícito é preservado", () => {
    const mapped = mapCartolaScoutToColumns({});
    expect(Object.values(mapped).every((value) => value === null)).toBe(true);
    expect(mapCartolaScoutToColumns({ DE: "", DP: null, GS: "  ", GC: "0" })).toMatchObject({
      saves: null, penaltySaved: null, goalsConceded: null, ownGoals: 0,
    });
  });
  it.each([-1, 1.5, NaN, Infinity, "inválido"])("recusa contagem inválida %s", (value) => {
    expect(() => mapCartolaScoutToColumns({ DE: value })).toThrow("Scout Cartola inválido");
  });
  it("o validador histórico preserva DP/FF/PC/V antes do mapeamento", () => {
    const raw = { DE: 2, DP: 1, GS: 3, GC: 1, FF: 4, PC: 2, PS: 1, V: 1 };
    const parsed = HistoricalScoutSchema.parse({ atleta_id: 1, rodada_id: 1, scout: raw });
    expect(parsed.scout).toEqual(raw);
    expect(mapCartolaScoutToColumns(parsed.scout ?? {})).toMatchObject({
      penaltySaved: 1, ff: 4, pc: 2, v: 1, goalsConceded: 3, ownGoals: 1,
    });
  });
});
