import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

async function fetcher(endpoint: string, options?: RequestInit) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || `Request failed with status ${res.status}`);
  }
  return res.json();
}

export function useLogs(limit = 20) {
  return useQuery({
    queryKey: ["/admin/logs", limit],
    queryFn: () => fetcher(`/admin/logs?limit=${limit}`),
  });
}

export function useProjectionWeights() {
  return useQuery({
    queryKey: ["/admin/projection-weights"],
    queryFn: () => fetcher(`/admin/projection-weights`),
  });
}

export function useUpdateProjectionWeights() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (weights: Record<string, number>) => 
      fetcher(`/admin/projection-weights`, {
        method: "POST",
        body: JSON.stringify(weights),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/admin/projection-weights"] });
    },
  });
}

export function useSyncFull() {
  return useMutation({
    mutationFn: () => fetcher(`/admin/sync/full`, { method: "POST" }),
  });
}

export function useSyncMarket() {
  return useMutation({
    mutationFn: () => fetcher(`/admin/sync/market`, { method: "POST" }),
  });
}

export function useSavedLineups(round?: number) {
  return useQuery({
    queryKey: ["/lineup", round],
    queryFn: () => fetcher(`/lineup${round ? `?round=${round}` : ''}`),
  });
}

export function useSaveLineup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => fetcher(`/lineup/${id}/save`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/lineup"] });
    },
  });
}

export function getPositionColor(pos: string) {
  switch (pos.toUpperCase()) {
    case "GOL": return "text-[#EAB308] bg-[#EAB308]/10 border-[#EAB308]/30";
    case "ZAG": return "text-[#3B82F6] bg-[#3B82F6]/10 border-[#3B82F6]/30";
    case "LAT": return "text-[#06B6D4] bg-[#06B6D4]/10 border-[#06B6D4]/30";
    case "MEI": return "text-[#A855F7] bg-[#A855F7]/10 border-[#A855F7]/30";
    case "ATA": return "text-[#EF4444] bg-[#EF4444]/10 border-[#EF4444]/30";
    case "TEC": return "text-[#10B981] bg-[#10B981]/10 border-[#10B981]/30";
    default: return "text-gray-400 bg-gray-400/10 border-gray-400/30";
  }
}
