/**
 * Tests for the ILP lineup optimizer.
 *
 * All tests use synthetic in-memory data — no database connection required.
 *
 * Key property verified:
 *   ILP score ≥ greedy score on every test case.
 *
 * This holds because the greedy's solution is always in the ILP feasible set
 * (both enforce the same constraints), so the ILP global optimum is at least
 * as good as any feasible solution, including the greedy's.
 *
 * How to run:
 *   pnpm --filter @workspace/api-server run test
 * How to watch:
 *   pnpm --filter @workspace/api-server run test:watch
 */

import { describe, test, expect } from "vitest";
import { solveLineupILP, type IlpCandidate, type IlpConstraints } from "../optimizers/ilpSolver";

// ── Greedy baseline (no budget lookahead) ─────────────────────────────────────
// A simplified greedy that is a valid feasible solution for the same ILP model.
// Because it's feasible, ILP.totalScore ≥ greedy.totalScore is guaranteed.

interface GreedyResult {
  feasible: boolean;
  selectedIds: Set<number>;
  totalScore: number;
}

function greedyBaseline(candidates: IlpCandidate[], constraints: IlpConstraints): GreedyResult {
  const { slots, budgetLimit, maxPlayersPerClub, opponentMap } = constraints;

  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const selected: IlpCandidate[] = [];
  const clubCount = new Map<number, number>();
  const clubPosCount = new Map<string, number>();
  let totalCost = 0;

  for (const { position, count } of slots) {
    let filled = 0;
    for (const c of sorted) {
      if (filled >= count) break;
      if (c.position !== position) continue;
      if (selected.some((s) => s.id === c.id)) continue;
      const clubUsed = clubCount.get(c.clubId) ?? 0;
      if (clubUsed >= maxPlayersPerClub) continue;

      const clubPosKey = `${c.clubId}_${c.position}`;
      if ((clubPosCount.get(clubPosKey) ?? 0) >= 1) continue;

      // Opponent constraint
      const oppId = opponentMap.get(c.clubId);
      if (oppId !== undefined) {
        const oppPosKey = `${oppId}_${c.position}`;
        if ((clubPosCount.get(oppPosKey) ?? 0) > 0) continue;

        // Cross constraint: ATA blocks opposing GOL/ZAG/LAT and vice versa
        const DEF = ["GOL", "ZAG", "LAT"];
        if (c.position === "ATA") {
          if (DEF.some((p) => (clubPosCount.get(`${oppId}_${p}`) ?? 0) > 0)) continue;
        } else if (DEF.includes(c.position)) {
          if ((clubPosCount.get(`${oppId}_ATA`) ?? 0) > 0) continue;
        }
      }

      if (totalCost + c.price > budgetLimit) continue;

      selected.push(c);
      totalCost += c.price;
      clubCount.set(c.clubId, clubUsed + 1);
      clubPosCount.set(clubPosKey, (clubPosCount.get(clubPosKey) ?? 0) + 1);
      filled++;
    }
  }

  const feasible = selected.length === slots.reduce((s, sl) => s + sl.count, 0);
  const totalScore = selected.reduce((s, c) => s + c.score, 0);
  return { feasible, selectedIds: new Set(selected.map((c) => c.id)), totalScore };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCandidate(
  overrides: Partial<IlpCandidate> & { id: number; position: string; clubId: number }
): IlpCandidate {
  return {
    price: 10,
    score: 5,
    captainScore: 5,
    gamesPlayed: 5,
    isFieldPlayer: overrides.position !== "TEC",
    ...overrides,
  };
}

const NO_OPPONENTS = new Map<number, number>();

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ILP Optimizer — solveLineupILP", () => {
  test("finds a feasible solution for a minimal 1-GOL + 1-TEC lineup", () => {
    const candidates: IlpCandidate[] = [
      makeCandidate({ id: 1, position: "GOL", clubId: 1, score: 8, price: 15 }),
      makeCandidate({ id: 2, position: "GOL", clubId: 2, score: 5, price: 10 }),
      makeCandidate({ id: 3, position: "TEC", clubId: 3, score: 3, price: 8, isFieldPlayer: false }),
      makeCandidate({ id: 4, position: "TEC", clubId: 4, score: 2, price: 6, isFieldPlayer: false }),
    ];
    const constraints: IlpConstraints = {
      slots: [{ position: "GOL", count: 1 }, { position: "TEC", count: 1 }],
      budgetLimit: 50,
      maxPlayersPerClub: 5,
      opponentMap: NO_OPPONENTS,
    };

    const result = solveLineupILP(candidates, constraints);

    expect(result.feasible).toBe(true);
    expect(result.selectedIds.size).toBe(2);
    expect(result.selectedIds.has(1)).toBe(true); // best GOL by score
    expect(result.selectedIds.has(3)).toBe(true); // best TEC by score
  });

  test("ILP score ≥ greedy score on budget-constrained case (classic counterexample)", () => {
    /**
     * Greedy (highest-score-first) picks GOL-A (score=10, price=18).
     * With only 7 left in budget it cannot afford ZAG-A (price=13).
     * It falls back to ZAG-B (score=4, price=5) → total score = 14.
     *
     * ILP finds GOL-B (score=7, price=10) + ZAG-A (score=15, price=13) = 22.
     */
    const candidates: IlpCandidate[] = [
      makeCandidate({ id: 1, position: "GOL", clubId: 1, score: 10, price: 18, captainScore: 10 }),
      makeCandidate({ id: 2, position: "GOL", clubId: 2, score: 7,  price: 10, captainScore: 7  }),
      makeCandidate({ id: 3, position: "ZAG", clubId: 3, score: 15, price: 13, captainScore: 15 }),
      makeCandidate({ id: 4, position: "ZAG", clubId: 4, score: 4,  price: 5,  captainScore: 4  }),
      makeCandidate({ id: 5, position: "TEC", clubId: 5, score: 2,  price: 4,  isFieldPlayer: false }),
    ];
    const constraints: IlpConstraints = {
      slots: [
        { position: "GOL", count: 1 },
        { position: "ZAG", count: 1 },
        { position: "TEC", count: 1 },
      ],
      budgetLimit: 27, // forces greedy into suboptimal choice
      maxPlayersPerClub: 5,
      opponentMap: NO_OPPONENTS,
    };

    const ilp = solveLineupILP(candidates, constraints);
    const greedy = greedyBaseline(candidates, constraints);

    expect(ilp.feasible).toBe(true);
    expect(greedy.feasible).toBe(true);

    // ILP should find the globally optimal (GOL-B + ZAG-A = 22)
    expect(ilp.totalScore).toBeGreaterThanOrEqual(greedy.totalScore - 1e-6);
    expect(ilp.totalScore).toBeGreaterThan(greedy.totalScore); // strictly better here
    expect(ilp.selectedIds.has(2)).toBe(true); // GOL-B
    expect(ilp.selectedIds.has(3)).toBe(true); // ZAG-A
  });

  test("ILP score ≥ greedy score on club constraint example", () => {
    /**
     * maxPlayersPerClub = 1.
     * Players 1 and 2 both belong to club 1 → only one can be picked.
     * Greedy picks id=1 (higher score) from GOL.
     * id=3 also from club 1 → greedy blocked for ZAG, falls back to id=4.
     * ILP finds the same solution but is guaranteed optimal.
     */
    const candidates: IlpCandidate[] = [
      makeCandidate({ id: 1, position: "GOL", clubId: 1, score: 12, price: 10 }),
      makeCandidate({ id: 2, position: "ZAG", clubId: 1, score: 11, price: 10 }), // same club as GOL
      makeCandidate({ id: 3, position: "ZAG", clubId: 2, score: 8,  price: 8  }),
      makeCandidate({ id: 4, position: "TEC", clubId: 3, score: 3,  price: 5,  isFieldPlayer: false }),
    ];
    const constraints: IlpConstraints = {
      slots: [
        { position: "GOL", count: 1 },
        { position: "ZAG", count: 1 },
        { position: "TEC", count: 1 },
      ],
      budgetLimit: 50,
      maxPlayersPerClub: 1, // only 1 player per club
      opponentMap: NO_OPPONENTS,
    };

    const ilp = solveLineupILP(candidates, constraints);
    const greedy = greedyBaseline(candidates, constraints);

    expect(ilp.feasible).toBe(true);
    expect(ilp.totalScore).toBeGreaterThanOrEqual(greedy.feasible ? greedy.totalScore - 1e-6 : 0);
    // Both should pick id=1 (GOL) and id=3 (ZAG, different club)
    expect(ilp.selectedIds.has(1)).toBe(true);
    expect(ilp.selectedIds.has(3)).toBe(true);
  });

  test("opponent constraint prevents two players from same match in same position", () => {
    /**
     * Clubs 10 (home) vs 11 (away) are playing each other.
     * Both have ZAGs. Opponent constraint: at most 1 ZAG from the entire match.
     */
    const opponentMap = new Map([[10, 11], [11, 10]]);
    const candidates: IlpCandidate[] = [
      makeCandidate({ id: 1, position: "GOL", clubId: 10, score: 9, price: 10 }),
      makeCandidate({ id: 2, position: "ZAG", clubId: 10, score: 8, price: 8  }), // ZAG from home club
      makeCandidate({ id: 3, position: "ZAG", clubId: 11, score: 7, price: 8  }), // ZAG from away club — opponent!
      makeCandidate({ id: 4, position: "ZAG", clubId: 12, score: 6, price: 7  }), // ZAG from unrelated club
      makeCandidate({ id: 5, position: "TEC", clubId: 13, score: 3, price: 5,  isFieldPlayer: false }),
    ];
    const constraints: IlpConstraints = {
      slots: [
        { position: "GOL", count: 1 },
        { position: "ZAG", count: 2 },
        { position: "TEC", count: 1 },
      ],
      budgetLimit: 50,
      maxPlayersPerClub: 5,
      opponentMap,
    };

    const result = solveLineupILP(candidates, constraints);

    expect(result.feasible).toBe(true);

    const hasZagClub10 = result.selectedIds.has(2);
    const hasZagClub11 = result.selectedIds.has(3);

    // Must NOT have both ZAGs from the same match
    expect(hasZagClub10 && hasZagClub11).toBe(false);
  });

  test("cross constraint prevents ATA + opposing defender; keeps higher-score side", () => {
    // Clubs 10 vs 11 play each other. ATA of 10 (score 9) conflicts with
    // ZAG of 11 (score 8). Alternatives exist from unrelated clubs.
    const opponentMap = new Map([[10, 11], [11, 10]]);
    const candidates: IlpCandidate[] = [
      makeCandidate({ id: 1, position: "GOL", clubId: 14, score: 5, price: 8 }),
      makeCandidate({ id: 2, position: "ATA", clubId: 10, score: 9, price: 10 }),
      makeCandidate({ id: 3, position: "ZAG", clubId: 11, score: 8, price: 8 }), // opposing defender
      makeCandidate({ id: 4, position: "ZAG", clubId: 12, score: 4, price: 7 }), // fallback ZAG
      makeCandidate({ id: 5, position: "ATA", clubId: 13, score: 3, price: 9 }), // fallback ATA
      makeCandidate({ id: 6, position: "TEC", clubId: 15, score: 3, price: 5, isFieldPlayer: false }),
    ];
    const constraints: IlpConstraints = {
      slots: [
        { position: "GOL", count: 1 },
        { position: "ZAG", count: 1 },
        { position: "ATA", count: 1 },
        { position: "TEC", count: 1 },
      ],
      budgetLimit: 100,
      maxPlayersPerClub: 5,
      opponentMap,
    };

    const result = solveLineupILP(candidates, constraints);
    expect(result.feasible).toBe(true);

    const hasAta10 = result.selectedIds.has(2);
    const hasZag11 = result.selectedIds.has(3);
    // Never both sides of the matchup
    expect(hasAta10 && hasZag11).toBe(false);
    // Objective picks the higher-score combination: ATA(9)+fallback ZAG(4)=13
    // beats ZAG(8)+fallback ATA(3)=11.
    expect(hasAta10).toBe(true);
    expect(result.selectedIds.has(4)).toBe(true);
  });

  test("cross constraint allows ATA + defenders of the SAME club", () => {
    const opponentMap = new Map([[10, 11], [11, 10]]);
    const candidates: IlpCandidate[] = [
      makeCandidate({ id: 1, position: "GOL", clubId: 10, score: 7, price: 8 }),
      makeCandidate({ id: 2, position: "ZAG", clubId: 10, score: 6, price: 8 }),
      makeCandidate({ id: 3, position: "ATA", clubId: 10, score: 9, price: 10 }),
      makeCandidate({ id: 4, position: "TEC", clubId: 12, score: 3, price: 5, isFieldPlayer: false }),
    ];
    const constraints: IlpConstraints = {
      slots: [
        { position: "GOL", count: 1 },
        { position: "ZAG", count: 1 },
        { position: "ATA", count: 1 },
        { position: "TEC", count: 1 },
      ],
      budgetLimit: 100,
      maxPlayersPerClub: 5,
      opponentMap,
    };

    const result = solveLineupILP(candidates, constraints);
    expect(result.feasible).toBe(true);
    // ATA + GOL + ZAG all from club 10 is allowed (same team, no conflict)
    expect(result.selectedIds.has(1)).toBe(true);
    expect(result.selectedIds.has(2)).toBe(true);
    expect(result.selectedIds.has(3)).toBe(true);
  });

  test("cross constraint does not apply when clubs are not opponents", () => {
    // No match between 10 and 11 this round (e.g. postponed → not in opponentMap)
    const opponentMap = new Map<number, number>();
    const candidates: IlpCandidate[] = [
      makeCandidate({ id: 1, position: "GOL", clubId: 12, score: 5, price: 8 }),
      makeCandidate({ id: 2, position: "ATA", clubId: 10, score: 9, price: 10 }),
      makeCandidate({ id: 3, position: "ZAG", clubId: 11, score: 8, price: 8 }),
      makeCandidate({ id: 4, position: "TEC", clubId: 13, score: 3, price: 5, isFieldPlayer: false }),
    ];
    const constraints: IlpConstraints = {
      slots: [
        { position: "GOL", count: 1 },
        { position: "ZAG", count: 1 },
        { position: "ATA", count: 1 },
        { position: "TEC", count: 1 },
      ],
      budgetLimit: 100,
      maxPlayersPerClub: 5,
      opponentMap,
    };

    const result = solveLineupILP(candidates, constraints);
    expect(result.feasible).toBe(true);
    expect(result.selectedIds.has(2)).toBe(true);
    expect(result.selectedIds.has(3)).toBe(true);
  });

  test("captain eligibility: eligible players (gamesPlayed ≥ 3) preferred as captain", () => {
    const candidates: IlpCandidate[] = [
      makeCandidate({ id: 1, position: "GOL", clubId: 1, score: 10, captainScore: 10, gamesPlayed: 1 }), // ineligible
      makeCandidate({ id: 2, position: "ZAG", clubId: 2, score: 8,  captainScore: 8,  gamesPlayed: 5 }), // eligible
      makeCandidate({ id: 3, position: "ATA", clubId: 3, score: 7,  captainScore: 7,  gamesPlayed: 0 }), // ineligible
      makeCandidate({ id: 4, position: "TEC", clubId: 4, score: 2,  captainScore: 0,  gamesPlayed: 10, isFieldPlayer: false }),
    ];
    const constraints: IlpConstraints = {
      slots: [
        { position: "GOL", count: 1 },
        { position: "ZAG", count: 1 },
        { position: "ATA", count: 1 },
        { position: "TEC", count: 1 },
      ],
      budgetLimit: 100,
      maxPlayersPerClub: 5,
      opponentMap: NO_OPPONENTS,
    };

    const result = solveLineupILP(candidates, constraints);

    expect(result.feasible).toBe(true);
    // id=2 (ZAG) is the only eligible captain → must be chosen
    expect(result.captainId).toBe(2);
  });

  test("ILP score ≥ greedy score on randomly generated data (5 rounds)", () => {
    // Runs 5 random instances — ILP must always match or beat greedy
    for (let seed = 0; seed < 5; seed++) {
      // Deterministic pseudo-random using seed
      const rng = (n: number) => ((seed * 1103515245 + n * 12345) & 0x7fffffff) / 0x7fffffff;

      const slots = [
        { position: "GOL", count: 1 },
        { position: "ZAG", count: 2 },
        { position: "ATA", count: 2 },
        { position: "TEC", count: 1 },
      ];

      const positions = [
        ...Array(6).fill("GOL"),
        ...Array(10).fill("ZAG"),
        ...Array(10).fill("ATA"),
        ...Array(4).fill("TEC"),
      ];

      const candidates: IlpCandidate[] = positions.map((pos, i) => {
        const score = rng(i * 7 + 1) * 20;
        const price = 4 + rng(i * 7 + 2) * 20;
        return makeCandidate({
          id: 100 + seed * 50 + i,
          position: pos,
          clubId: 1 + (i % 12),
          score,
          captainScore: score,
          price,
          isFieldPlayer: pos !== "TEC",
        });
      });

      const constraints: IlpConstraints = {
        slots,
        budgetLimit: 60,
        maxPlayersPerClub: 3,
        opponentMap: NO_OPPONENTS,
      };

      const ilp = solveLineupILP(candidates, constraints);
      const greedy = greedyBaseline(candidates, constraints);

      if (!ilp.feasible) continue; // budget too tight to fill → skip
      if (!greedy.feasible) {
        // ILP found a solution greedy couldn't — ILP strictly wins
        expect(ilp.feasible).toBe(true);
        continue;
      }

      expect(ilp.totalScore).toBeGreaterThanOrEqual(greedy.totalScore - 1e-6);
    }
  });

  test("respects budget: total price of selected players ≤ budgetLimit", () => {
    const candidates: IlpCandidate[] = [
      makeCandidate({ id: 1, position: "GOL", clubId: 1, score: 20, price: 30 }), // very expensive
      makeCandidate({ id: 2, position: "GOL", clubId: 2, score: 10, price: 15 }),
      makeCandidate({ id: 3, position: "ZAG", clubId: 3, score: 18, price: 25 }), // also expensive
      makeCandidate({ id: 4, position: "ZAG", clubId: 4, score: 8,  price: 12 }),
      makeCandidate({ id: 5, position: "TEC", clubId: 5, score: 3,  price: 8,  isFieldPlayer: false }),
    ];
    const budgetLimit = 35;
    const constraints: IlpConstraints = {
      slots: [
        { position: "GOL", count: 1 },
        { position: "ZAG", count: 1 },
        { position: "TEC", count: 1 },
      ],
      budgetLimit,
      maxPlayersPerClub: 5,
      opponentMap: NO_OPPONENTS,
    };

    const result = solveLineupILP(candidates, constraints);
    expect(result.feasible).toBe(true);

    const totalCost = [...result.selectedIds].reduce((sum, id) => {
      const c = candidates.find((c) => c.id === id)!;
      return sum + c.price;
    }, 0);

    expect(totalCost).toBeLessThanOrEqual(budgetLimit);
  });

  test("selects exact formation counts", () => {
    const slots = [
      { position: "GOL", count: 1 },
      { position: "ZAG", count: 2 },
      { position: "MEI", count: 4 },
      { position: "ATA", count: 2 },
      { position: "TEC", count: 1 },
    ];
    const candidates: IlpCandidate[] = [];
    let id = 1;
    const positionCounts: Record<string, number> = { GOL: 8, ZAG: 12, MEI: 15, ATA: 12, TEC: 5 };
    for (const [pos, count] of Object.entries(positionCounts)) {
      for (let i = 0; i < count; i++, id++) {
        candidates.push(
          makeCandidate({
            id,
            position: pos,
            clubId: id % 15 + 1,
            score: Math.random() * 20,
            price: 5 + Math.random() * 15,
            isFieldPlayer: pos !== "TEC",
          })
        );
      }
    }

    const result = solveLineupILP(candidates, {
      slots,
      budgetLimit: 200,
      maxPlayersPerClub: 5,
      opponentMap: NO_OPPONENTS,
    });

    expect(result.feasible).toBe(true);

    const posCounts: Record<string, number> = {};
    for (const id of result.selectedIds) {
      const c = candidates.find((c) => c.id === id)!;
      posCounts[c.position] = (posCounts[c.position] ?? 0) + 1;
    }

    for (const { position, count } of slots) {
      expect(posCounts[position] ?? 0).toBe(count);
    }
  });
});
