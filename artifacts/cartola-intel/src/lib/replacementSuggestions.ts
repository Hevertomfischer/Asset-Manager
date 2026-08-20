import type { LineupPlayer, Player } from "@workspace/api-client-react";

const UNAVAILABLE_STATUS = /suspens|lesion|contus|indispon|afastad|fora|n[aã]o joga|\bnulo\b/i;
const MIN_PLAY_PROBABILITY = 0.25;

function hasBlockedAvailability(player: Player): boolean {
  const availability = player.availability;
  const statuses = [
    player.status,
    availability?.probableStatus,
    availability?.injuryStatus,
    availability?.suspensionStatus,
  ].filter((value): value is string => Boolean(value));

  return (
    (availability?.playProbability ?? 1) < MIN_PLAY_PROBABILITY ||
    statuses.some((status) => UNAVAILABLE_STATUS.test(status))
  );
}

export interface ReplacementSuggestion {
  player: Player;
  expectedPoints: number;
  deltaExpectedPoints: number;
  playProbability: number | null;
}

export function getReplacementSuggestions(
  players: Player[],
  outPlayer: LineupPlayer,
  lineupPlayerIds: Set<number>,
  limit = 3,
): ReplacementSuggestion[] {
  const outExpectedPoints = outPlayer.expectedPoints ?? 0;

  return players
    .filter((player) => {
      const expectedPoints = player.projection?.expectedPoints ?? 0;
      return (
        player.position === outPlayer.position &&
        !lineupPlayerIds.has(player.id) &&
        expectedPoints > 0 &&
        !hasBlockedAvailability(player)
      );
    })
    .sort((a, b) => {
      const expectedDiff =
        (b.projection?.expectedPoints ?? 0) - (a.projection?.expectedPoints ?? 0);
      if (expectedDiff !== 0) return expectedDiff;

      const recommendationDiff =
        (b.projection?.recommendationScore ?? 0) -
        (a.projection?.recommendationScore ?? 0);
      if (recommendationDiff !== 0) return recommendationDiff;

      const availabilityDiff =
        (b.availability?.playProbability ?? 1) -
        (a.availability?.playProbability ?? 1);
      if (availabilityDiff !== 0) return availabilityDiff;

      return a.id - b.id;
    })
    .slice(0, limit)
    .map((player) => {
      const expectedPoints = player.projection?.expectedPoints ?? 0;
      return {
        player,
        expectedPoints,
        deltaExpectedPoints: expectedPoints - outExpectedPoints,
        playProbability: player.availability?.playProbability ?? null,
      };
    });
}