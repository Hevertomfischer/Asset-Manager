import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const mocks = vi.hoisted(() => ({
  projections: vi.fn(), players: vi.fn(), availability: vi.fn(), matches: vi.fn(),
  insert: vi.fn(), reserves: vi.fn(), pro: vi.fn(),
  select: vi.fn(), update: vi.fn(),
}));
vi.mock("@workspace/db", () => ({
  db: {
    query: { playersTable: { findMany: mocks.players } },
    select: mocks.select, update: mocks.update,
  },
}));
vi.mock("../repositories/projectionRepository", () => ({
  getProjectionsByRound: mocks.projections,
  getLatestProjectionRound: vi.fn(async () => 1),
}));
vi.mock("../repositories/matchRepository", () => ({ getMatchesByRound: mocks.matches }));
vi.mock("../repositories/lineupRepository", () => ({
  insertLineupSuggestion: mocks.insert, insertLineupReserves: mocks.reserves,
  getLineupReserves: vi.fn(), getLineupSubstitutions: vi.fn(),
  insertLineupSubstitutions: vi.fn(), markLineupSaved: vi.fn(),
}));
vi.mock("../services/accessService", () => ({ isPro: mocks.pro }));

import {
  calculateLineup, generateLineup, type LineupSnapshot,
} from "../optimizers/lineupOptimizer";
import { compareFormations, evaluateFormations } from "../services/formationComparison";
import lineupRouter from "../routes/lineup";

function snapshot(): LineupSnapshot {
  const players: LineupSnapshot["players"] = [];
  const projections: LineupSnapshot["projections"] = [];
  let id = 1;
  for (const position of ["GOL", "LAT", "ZAG", "MEI", "ATA", "TEC"]) {
    for (let index = 0; index < 7; index++, id++) {
      const expected = ({ GOL: 4, LAT: 5, ZAG: 3, MEI: 7, ATA: 9, TEC: 2 }[position] ?? 1) + index / 10;
      players.push({
        id, name: `Jogador ${id}`, position, clubId: id, price: 5,
        gamesPlayed: 10, status: "Provável",
      } as LineupSnapshot["players"][number]);
      projections.push({
        playerId: id, round: 1, expectedPoints: expected, floorPoints: expected - 1,
        ceilingPoints: expected + 1, riskScore: 0.1, valueScore: 1,
        recommendationScore: expected, playProbability: 1,
      } as LineupSnapshot["projections"][number]);
    }
  }
  return { players, projections, availabilities: [], roundMatches: [] };
}
const request = { round: 1, budgetLimit: 100, strategy: "safe" as const };
let data: LineupSnapshot;

beforeEach(() => {
  vi.clearAllMocks();
  data = snapshot();
  mocks.projections.mockResolvedValue(data.projections);
  mocks.players.mockResolvedValue(data.players);
  mocks.availability.mockResolvedValue([]);
  mocks.matches.mockResolvedValue([]);
  mocks.select.mockReturnValue({ from: mocks.availability });
  mocks.pro.mockResolvedValue(false);
  mocks.insert.mockResolvedValue({ id: 123 });
  mocks.reserves.mockResolvedValue([]);
});

describe("Formation comparison", () => {
  test("ranks all seven suggestions including the captain bonus exactly once", () => {
    const comparison = evaluateFormations(request, data);
    expect(comparison.results).toHaveLength(7);
    expect(comparison.bestFormation).toBe(comparison.results[0]!.formation);
    comparison.results.forEach((row, index) => {
      expect(row.feasible).toBe(true);
      const calculated = calculateLineup({ ...request, formation: row.formation }, data);
      const sum = calculated.players.reduce((total, p) => total + (p.projection.expectedPoints ?? 0), 0);
      const captain = calculated.players.find((p) => p.isCaptain)!;
      expect(row.expectedPoints).toBeCloseTo(sum + captain.projection.expectedPoints!, 2);
      expect(row.balance).toBe(40);
      expect(row.differenceFromBest).toBeCloseTo(comparison.results[0]!.expectedPoints! - row.expectedPoints!, 2);
      if (index) expect(comparison.results[index - 1]!.expectedPoints!).toBeGreaterThanOrEqual(row.expectedPoints!);
    });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.reserves).not.toHaveBeenCalled();
  });

  test("preserves locks, exclusions and low-probability locks in each feasible formation", () => {
    const lock = data.players.find((p) => p.position === "MEI")!.id;
    const exclude = data.players.find((p) => p.position === "ATA")!.id;
    data.projections.find((p) => p.playerId === lock)!.playProbability = 0.01;
    const constrained = { ...request, lockedPlayerIds: [lock], excludedPlayerIds: [exclude] };
    for (const row of evaluateFormations(constrained, data).results) {
      expect(row.feasible).toBe(true);
      const lineup = calculateLineup({ ...constrained, formation: row.formation }, data);
      expect(lineup.players.some((p) => p.playerId === lock)).toBe(true);
      expect(lineup.players.some((p) => p.playerId === exclude)).toBe(false);
      expect(lineup.totalCost).toBeLessThanOrEqual(request.budgetLimit);
    }
  });

  test("keeps partial feasibility and explains formations incompatible with a lateral lock", () => {
    const lock = data.players.find((p) => p.position === "LAT")!.id;
    const comparison = evaluateFormations({ ...request, lockedPlayerIds: [lock] }, data);
    const invalid = comparison.results.filter((r) => !r.feasible);
    expect(invalid.map((r) => r.formation)).toEqual(["3-4-3", "3-5-2"]);
    expect(invalid.every((r) => r.reason?.includes("LAT"))).toBe(true);
    expect(comparison.results.filter((r) => r.feasible)).toHaveLength(5);
  });

  test("returns all seven infeasible outcomes when budget cannot fill any formation", () => {
    const comparison = evaluateFormations({ ...request, budgetLimit: 1 }, data);
    expect(comparison.bestFormation).toBeNull();
    expect(comparison.results.every((r) => !r.feasible && r.reason && r.expectedPoints === null)).toBe(true);
  });

  test("resolves equal expected points deterministically with zero differences", () => {
    data.projections.forEach((p) => { p.expectedPoints = 5; });
    const comparison = evaluateFormations(request, data);
    expect(comparison.results.map((r) => r.formation)).toEqual(
      ["3-4-3", "3-5-2", "4-3-3", "4-4-2", "4-5-1", "5-3-2", "5-4-1"]
    );
    expect(comparison.results.every((r) => r.expectedPoints === 65 && r.differenceFromBest === 0)).toBe(true);
  });

  test("loads a single snapshot and performs no writes for the whole comparison", async () => {
    const comparison = await compareFormations(request);
    expect(comparison.results).toHaveLength(7);
    for (const fn of [mocks.projections, mocks.players, mocks.matches, mocks.availability]) {
      expect(fn).toHaveBeenCalledTimes(1);
    }
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.reserves).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  test("operational failures are not labeled as infeasible formations", () => {
    expect(() => evaluateFormations(request, { ...data, projections: [] }))
      .toThrow("No projections");
  });

  test("normal generation still persists exactly one suggestion and its reserves", async () => {
    const generated = await generateLineup({ ...request, formation: "4-3-3" });
    expect(generated.id).toBe(123);
    expect(generated.players).toHaveLength(12);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.reserves).toHaveBeenCalledTimes(1);
    expect(mocks.insert.mock.calls[0]![0].expectedPoints).toBe(generated.expectedPoints);
    expect(mocks.reserves.mock.calls[0]![0]).toBe(123);
  });
});

describe("Comparison HTTP access and quota", () => {
  let server: Server;
  let url: string;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
      req.user = { id: 42 } as Express.User;
      next();
    });
    app.use("/api", lineupRouter);
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", (error?: Error) => error ? reject(error) : resolve());
    });
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/lineup/compare-formations`;
  });
  afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
  const post = (body: object) => fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ round: 1, budget: 100, strategy: "safe", ...body }),
  });

  test("free comparison bypasses generation count and never saves or updates", async () => {
    const response = await post({});
    expect(response.status).toBe(200);
    expect((await response.json() as { results: unknown[] }).results).toHaveLength(7);
    expect(mocks.select).toHaveBeenCalledTimes(1); // availability only, not generation count
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.reserves).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  test.each([
    { strategy: "aggressive" },
    { lockedPlayerIds: [1, 2] },
    { excludedPlayerIds: [1, 2, 3, 4] },
  ])("free limits return 402 with upgradeRequired: %j", async (body) => {
    const response = await post(body);
    expect(response.status).toBe(402);
    expect((await response.json() as { upgradeRequired: boolean }).upgradeRequired).toBe(true);
    expect(mocks.players).not.toHaveBeenCalled();
  });
  test("Pro permits advanced strategy and multiple constraints", async () => {
    mocks.pro.mockResolvedValue(true);
    const response = await post({
      strategy: "aggressive", lockedPlayerIds: [1, 36], excludedPlayerIds: [2, 3, 4, 5],
    });
    expect(response.status).toBe(200);
    expect((await response.json() as { results: { feasible: boolean }[] }).results.some((r) => r.feasible)).toBe(true);
  });
  test.each([
    { budget: -1 }, { budget: "100" }, { round: 1.5 }, { lockedPlayerIds: [null] },
  ])("invalid input returns 400: %j", async (body) => {
    expect((await post(body)).status).toBe(400);
  });
  test("overlapping lock/exclusion returns readable 422", async () => {
    const response = await post({ lockedPlayerIds: [1], excludedPlayerIds: [1] });
    expect(response.status).toBe(422);
    expect((await response.json() as { error: string }).error).toContain("travados e excluídos");
  });
});
