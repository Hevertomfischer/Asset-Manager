import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

// ── Types ────────────────────────────────────────────────────────────────────

export interface UserTeam {
  id: number;
  name: string;
  createdAt: string;
  roundCount: number;
  seasonPoints: number;
}

export interface UserTeamRoundPlayer {
  playerId: number;
  name: string;
  nickname: string | null;
  position: string;
  price: number;
  clubName: string | null;
  clubBadgeUrl: string | null;
  isCaptain: boolean;
  isCoach: boolean;
  actualPoints: number | null;
  actualPointsRaw: number | null;
}

export interface UserTeamRound {
  id: number;
  round: number;
  source: string;
  budgetUsed: number | null;
  lineupSuggestionId: number | null;
  players: UserTeamRoundPlayer[];
  actualTotal: number | null;
  optimalActualPoints: number | null;
  efficiencyPct: number | null;
}

// ── Query keys ───────────────────────────────────────────────────────────────

export const USER_TEAMS_QUERY_KEY = ["/api/user-teams"] as const;
export const userTeamRoundsKey = (id: number) => ["/api/user-teams", id, "rounds"] as const;

// ── Hooks ─────────────────────────────────────────────────────────────────────

export const useGetUserTeams = () =>
  useQuery<{ teams: UserTeam[] }>({
    queryKey: USER_TEAMS_QUERY_KEY,
    queryFn: () => customFetch("/api/user-teams"),
    staleTime: 60_000,
  });

export const useCreateUserTeam = () => {
  const queryClient = useQueryClient();
  return useMutation<{ team: UserTeam }, Error, { name: string }>({
    mutationFn: (data) =>
      customFetch("/api/user-teams", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USER_TEAMS_QUERY_KEY });
    },
  });
};

export const useRegisterRoundFromSuggestion = () => {
  const queryClient = useQueryClient();
  return useMutation<
    { round: UserTeamRound },
    Error,
    { teamId: number; lineupSuggestionId: number }
  >({
    mutationFn: ({ teamId, lineupSuggestionId }) =>
      customFetch(`/api/user-teams/${teamId}/rounds/from-suggestion`, {
        method: "POST",
        body: JSON.stringify({ lineupSuggestionId }),
      }),
    onSuccess: (_data, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: USER_TEAMS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: userTeamRoundsKey(teamId) });
    },
  });
};
