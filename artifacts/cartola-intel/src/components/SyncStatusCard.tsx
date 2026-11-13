import { Link } from "react-router-dom";
import { useGetSyncStatus, getGetSyncStatusQueryKey } from "@workspace/api-client-react";
import { Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "Ainda não registrado";
}

export function SyncStatusCard({ isAdmin }: { isAdmin: boolean }) {
  const { data, isLoading, isError, refetch } = useGetSyncStatus({
    query: { queryKey: getGetSyncStatusQueryKey(), staleTime: 30_000, refetchInterval: 60_000 },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="w-5 h-5 text-accent" /> Status dos dados
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm" aria-live="polite">
        {isLoading ? <p className="text-muted-foreground">Carregando status...</p> : isError ? (
          <div role="alert">
            <p>Status dos dados indisponível no momento.</p>
            <Button variant="outline" className="mt-2" onClick={() => void refetch()}>Tentar novamente</Button>
          </div>
        ) : data ? (
          <>
            <Badge variant={data.providersDegraded ? "destructive" : "secondary"}>
              {data.isRunning ? "Sincronizando" : data.providersDegraded ? "Dados parcialmente indisponíveis" : data.lastSyncAt ? "Dados sincronizados" : "Aguardando sincronização"}
            </Badge>
            <dl className="space-y-2 text-muted-foreground">
              <div><dt>Última sincronização</dt><dd>{formatDate(data.lastSyncAt)}</dd></div>
              <div><dt>Última consulta ao mercado</dt><dd>{formatDate(data.lastMarketCheckAt)}</dd></div>
              <div><dt>Mercado</dt><dd>{data.marketStatus === "open" ? "Aberto" : data.marketStatus === "closed" ? "Fechado" : "Ainda não informado"}</dd></div>
            </dl>
          </>
        ) : null}
        {isAdmin && <Button asChild variant="outline" className="w-full"><Link to="/admin">Gerenciar Pipeline</Link></Button>}
      </CardContent>
    </Card>
  );
}
