import { expect, test } from "vitest";
import { selectReserves } from "../services/reserveService";

const reserveCandidate = {
  playerId: 2, playerName: "Reserva", playerNickname: null, position: "ATA",
  clubId: 1, expectedPoints: 7, floorPoints: 3, ceilingPoints: 10,
  price: 5, playProbability: 0.9,
};

test("reserve selection preserves the official average", () => {
  const reserves = selectReserves([{ ...reserveCandidate, averagePoints: 4.2 }], new Set(), ["ATA"]);
  expect(reserves[0]?.averagePoints).toBe(4.2);
});

test("an unavailable average stays null rather than becoming an invented zero", () => {
  const reserves = selectReserves([reserveCandidate], new Set(), ["ATA"]);
  expect(reserves[0]?.averagePoints).toBeNull();
});
