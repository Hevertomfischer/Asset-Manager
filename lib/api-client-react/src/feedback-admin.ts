import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type FeedbackStatus = "novo" | "em_analise" | "resolvido" | "arquivado";
export type FeedbackType = "bug" | "ideia" | "elogio" | "duvida";

export interface FeedbackItem {
  id: number;
  userId: number | null;
  page: string;
  type: FeedbackType;
  message: string;
  status: FeedbackStatus;
  createdAt: string;
}

export interface FeedbackListResponse {
  items: FeedbackItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface FeedbackNewCountResponse {
  count: number;
}

export const ADMIN_FEEDBACK_QUERY_KEY = ["/api/admin/feedback"] as const;
export const ADMIN_FEEDBACK_NEW_COUNT_KEY = ["/api/admin/feedback/new-count"] as const;

export const useGetAdminFeedback = (params: {
  status?: FeedbackStatus | "";
  type?: FeedbackType | "";
  limit?: number;
  offset?: number;
}) => {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.type) qs.set("type", params.type);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  const query = qs.toString();

  return useQuery<FeedbackListResponse>({
    queryKey: [...ADMIN_FEEDBACK_QUERY_KEY, params],
    queryFn: () => customFetch<FeedbackListResponse>(`/api/admin/feedback${query ? `?${query}` : ""}`),
    staleTime: 30_000,
  });
};

export const useGetAdminFeedbackNewCount = (enabled = true) => {
  return useQuery<FeedbackNewCountResponse>({
    queryKey: ADMIN_FEEDBACK_NEW_COUNT_KEY,
    queryFn: () => customFetch<FeedbackNewCountResponse>("/api/admin/feedback/new-count"),
    staleTime: 60_000,
    refetchInterval: 60_000,
    enabled,
  });
};

export const usePatchFeedbackStatus = () => {
  const queryClient = useQueryClient();
  return useMutation<FeedbackItem, Error, { id: number; status: FeedbackStatus }>({
    mutationFn: ({ id, status }) =>
      customFetch<FeedbackItem>(`/api/admin/feedback/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ADMIN_FEEDBACK_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ADMIN_FEEDBACK_NEW_COUNT_KEY });
    },
  });
};
