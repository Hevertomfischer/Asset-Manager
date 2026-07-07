import { useQuery } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export interface AdminUserItem {
  id: number;
  email: string;
  name: string | null;
  provider: string | null;
  role: string | null;
  createdAt: string;
  plan: string | null;
  subscriptionEnd: string | null;
}

export interface AdminUsersListResponse {
  items: AdminUserItem[];
  total: number;
  limit: number;
  offset: number;
}

export const ADMIN_USERS_QUERY_KEY = ["/api/admin/users"] as const;

export const useGetAdminUsers = (params: {
  search?: string;
  limit?: number;
  offset?: number;
}) => {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  const query = qs.toString();

  return useQuery<AdminUsersListResponse>({
    queryKey: [...ADMIN_USERS_QUERY_KEY, params],
    queryFn: () =>
      customFetch<AdminUsersListResponse>(`/api/admin/users${query ? `?${query}` : ""}`),
    staleTime: 30_000,
  });
};
