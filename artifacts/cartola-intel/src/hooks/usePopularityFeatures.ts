import { useGetSyncStatus, getGetSyncStatusQueryKey } from "@workspace/api-client-react";

export function popularityReasonLabel(reason?: string) {
  const labels: Record<string, string> = {
    ready: "Coleta recente com cobertura suficiente",
    no_data: "Sem coleta bem-sucedida",
    source_error: "A última coleta falhou",
    stale: "Coleta com mais de 24 horas",
    insufficient_coverage: "Cobertura insuficiente",
    forced_failure: "Simulação de falha ativada",
    unavailable: "Status indisponível",
  };
  return labels[reason ?? "unavailable"] ?? labels.unavailable;
}

/** Falha fechada: carregando/erro também não libera recursos de popularidade. */
export function usePopularityFeatures() {
  const query = useGetSyncStatus({ query: {
    queryKey: getGetSyncStatusQueryKey(),
    staleTime: 15000,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    retry: false,
  } });
  return {
    enabled: !query.isError && query.data?.popularityFeaturesEnabled === true,
    status: query.data?.popularity,
    isLoading: query.isLoading,
  };
}
