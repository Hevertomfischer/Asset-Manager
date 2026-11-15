import { describe, expect, it } from "vitest";
import type { LineupPlayer, Player } from "@workspace/api-client-react";
import { getReplacementSuggestions } from "../replacementSuggestions";

const outPlayer: LineupPlayer = {
  playerId: 1,
  name: "Titular",
  position: "ATA",
  expectedPoints: 5,
};

function candidate(id: number, expectedPoints: number, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: `Jogador ${id}`,
    position: "ATA",
    projection: { expectedPoints, recommendationScore: expectedPoints },
    availability: { playProbability: 0.8 },
    ...overrides,
  };
}

describe("getReplacementSuggestions", () => {
  it("ranks the three highest projected eligible players", () => {
    const players = [
      candidate(2, 7),
      candidate(3, 8),
      candidate(4, 6),
      candidate(5, 9),
    ];

    const result = getReplacementSuggestions(players, outPlayer, new Set([1]));

    expect(result.map((suggestion) => suggestion.player.id)).toEqual([5, 3, 2]);
    expect(result[0]?.deltaExpectedPoints).toBe(4);
  });

  it("excludes current starters and unavailable players", () => {
    const players = [
      candidate(2, 10),
      candidate(3, 9, { availability: { playProbability: 0.1, suspensionStatus: "Suspenso" } }),
      candidate(4, 8, { availability: { playProbability: 0.8, injuryStatus: "Contundido" } }),
      candidate(5, 7, { position: "MEI" }),
      candidate(6, 6),
      candidate(7, 11, { status: "Nulo" }),
    ];

    const result = getReplacementSuggestions(players, outPlayer, new Set([1, 2]));

    expect(result.map((suggestion) => suggestion.player.id)).toEqual([6]);
  });

  it.each(["Contundido", "Contusão", "Lesionado", "Suspenso", "Indisponível"])(
    "excludes %s even when the reported play probability is high",
    (injuryStatus) => {
      const players = [
        candidate(4, 10, { availability: { playProbability: 0.95, injuryStatus } }),
        candidate(6, 6),
      ];
      const result = getReplacementSuggestions(players, outPlayer, new Set([1]));
      expect(result.map(({ player }) => player.id)).toEqual([6]);
    },
  );
});