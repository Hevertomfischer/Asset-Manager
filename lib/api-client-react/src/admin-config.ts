import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export interface AdminConfig {
  xgStaleDays: number;
}

export const ADMIN_CONFIG_QUERY_KEY = ["/api/admin/config"] as const;

export const useGetAdminConfig = () => {
  return useQuery<AdminConfig>({
    queryKey: ADMIN_CONFIG_QUERY_KEY,
    queryFn: () => customFetch<AdminConfig>("/api/admin/config"),
    staleTime: 5 * 60 * 1000,
  });
};

export const useUpdateAdminConfig = () => {
  const queryClient = useQueryClient();
  return useMutation<AdminConfig, Error, Partial<AdminConfig>>({
    mutationFn: (data) =>
      customFetch<AdminConfig>("/api/admin/config", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(ADMIN_CONFIG_QUERY_KEY, updated);
    },
  });
};
