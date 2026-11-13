import { describe, expect, it } from "vitest";
import { POSITION_SCOUT_WEIGHTS } from "../config/projectionWeights";
import { mapCartolaScoutToColumns } from "../lib/mapCartolaScoutToColumns";
import { positionFormScore, type FormScout } from "../lib/positionFormScore";

describe("positionFormScore", () => {
  const cases: [keyof FormScout, number, number][] = [
    ["goals", 8, 1.2], ["assists", 5, 1.4], ["saves", 1.3, 1],
    ["penaltySaved", 7, 1], ["goalsConceded", -1, 1], ["ownGoals", -3, 1],
    ["tackles", 1.5, 1], ["shotsOnTarget", 1.2, 1], ["ff", 0.8, 1],
    ["ps", 1, 1], ["pc", -1, 1], ["cleanSheet", 5, 1],
    ["penaltyMissed", -4, 1], ["foulsSuffered", 0.5, 1.1],
    ["foulsCommitted", -0.3, 1.1], ["yellowCards", -1, 1], ["redCards", -3, 1],
  ];
  it.each(cases)("%s usa a pontuação do seu código e o peso correspondente", (column, scoring, weight) => {
    const scout: FormScout = { points: 0, [column]: 2 };
    expect(positionFormScore([scout], "MEI")).toBeCloseTo(0.3 * 2 * scoring * weight);
  });
  it("goleiro com três gols sofridos tem forma menor que com zero, mantendo o restante igual", () => {
    const base = { points: 5, ...mapCartolaScoutToColumns({ DE: 4, DP: 0, GS: 0 }) };
    const withoutGoals = positionFormScore([base], "GOL");
    const withThreeGoals = positionFormScore([{ ...base, goalsConceded: 3 }], "GOL");
    expect(withThreeGoals).toBeLessThan(withoutGoals);
    expect(withoutGoals - withThreeGoals).toBeCloseTo(0.3 * 3 * 1.5);
  });
  it("DP recebe peso 1,8 no GOL, e não o peso de PS", () => {
    expect(positionFormScore([{ points: 0, penaltySaved: 1 }], "GOL")).toBeCloseTo(0.3 * 7 * 1.8);
    expect(positionFormScore([{ points: 0, ps: 1 }], "GOL")).toBeCloseTo(0.3);
    expect(positionFormScore([{ points: 0, saves: 1 }], "GOL")).toBeCloseTo(0.3 * 1.3 * 0.8);
  });
  it("aplica os pesos de DS em ZAG/LAT sem usar DE", () => {
    expect(positionFormScore([{ points: 0, tackles: 1 }], "ZAG")).toBeCloseTo(0.3 * 1.5 * 1.3);
    expect(positionFormScore([{ points: 0, tackles: 1 }], "LAT")).toBeCloseTo(0.3 * 1.5 * 1.2);
  });
  it("separa FT/FD/FF sem pontuar shots agregado em duplicidade", () => {
    const scout = mapCartolaScoutToColumns({ FD: 2, FT: 3, FF: 4 });
    const expected = 2 * 1.2 * 1.2 + 3 * 3 * 1.3 + 4 * 0.8;
    expect(positionFormScore([{ ...scout, points: 0 }], "ATA")).toBeCloseTo(0.3 * expected);
  });
  it("não inventa FT com total ausente ou inconsistente", () => {
    expect(positionFormScore([{ points: 0, shots: null, shotsOnTarget: 2, ff: 3 }], "MEI"))
      .toBeCloseTo(0.3 * (2 * 1.2 + 3 * 0.8));
    expect(positionFormScore([{ points: 0, shots: 1, shotsOnTarget: 2, ff: 3 }], "MEI"))
      .toBeCloseTo(0.3 * (2 * 1.2 + 3 * 0.8));
  });
  it("preserva pontos negativos e a média da janela", () => {
    expect(positionFormScore([{ points: -4 }, { points: 2 }], "MEI")).toBeCloseTo(-0.7);
    expect(positionFormScore([], "GOL")).toBe(0);
  });
  it("não inventa pontuação de V e preserva a fórmula específica de TEC", () => {
    expect(positionFormScore([{ points: 2, v: 1 }], "MEI")).toBeCloseTo(1.4);
    expect(positionFormScore([{ points: 2, v: 1 }], "TEC")).toBe(2);
  });
  it("aplica somente as alterações aprovadas nos pesos", () => {
    expect(POSITION_SCOUT_WEIGHTS).toEqual({
      GOL: { SG: 2, DP: 1.8, GS: 1.5, DE: 0.8, DS: 0.8 },
      ZAG: { SG: 1.6, DS: 1.3, G: 1.2, CA: 1.2, CV: 1.2 },
      LAT: { A: 1.3, DS: 1.2, FS: 1.1, SG: 1.3 },
      MEI: { A: 1.4, G: 1.2, FT: 1.2, FS: 1.1, FC: 1.1 },
      ATA: { G: 1.5, FT: 1.3, FD: 1.2, A: 1.1, PP: 1.2 },
      TEC: {},
    });
  });
});
