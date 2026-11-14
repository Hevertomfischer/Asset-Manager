import { useGetHistoricalRepairProgress, useStartHistoricalRepair, getGetHistoricalRepairProgressQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw } from "lucide-react";

export function HistoricalRepairCard() {
  const { toast } = useToast();
  const status = useGetHistoricalRepairProgress({
    query: { queryKey: getGetHistoricalRepairProgressQueryKey(), refetchInterval: (query) => query.state.data?.progress?.status === "running" ? 3000 : 30000, retry: false },
  });
  const start = useStartHistoricalRepair({
    mutation: {
      onSuccess: () => { void status.refetch(); toast({ title: "Ressincronização iniciada", description: "Os pesos serão calibrados somente após todas as rodadas concluírem." }); },
      onError: (e) => toast({ title: "Não foi possível iniciar o reparo", description: e.message, variant: "destructive" }),
    },
  });
  const progress = status.data?.progress;
  const running = progress?.status === "running";
  return (
    <Card className="bg-card border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Reparar todas as rodadas encerradas</CardTitle>
        <CardDescription>
          Busca novamente os pontos e scouts finais na fonte oficial, substitui dados antigos,
          consolida duplicatas e recalibra os pesos ao final. Não recalcula projeções congeladas
          e não transforma o histórico legado em série confiável.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {status.isError && <p role="alert" className="text-destructive">Não foi possível consultar o reparo. <button className="underline" onClick={() => void status.refetch()}>Tentar novamente</button></p>}
        {progress && (
          <div aria-live="polite" className="space-y-1">
            <p>{running ? "Em execução" : progress.status === "completed" ? "Concluído — pesos calibrados" : "Interrompido — pode ser repetido"}</p>
            <p className="text-muted-foreground">{progress.completedRounds} de {progress.lastClosedRound} rodadas · {progress.upserted?.toLocaleString("pt-BR")} scouts atualizados</p>
            {!!progress.missingPlayers && <p className="text-amber-400">{progress.missingPlayers} registros sem identificação suficiente. Verifique antes de concluir a migração.</p>}
            {progress.error && <p role="alert" className="text-destructive break-words">{progress.error.split("\n")[0]}</p>}
          </div>
        )}
        <Button disabled={running || start.isPending || status.isLoading || status.isError} onClick={() => start.mutate(undefined)} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${running || start.isPending ? "animate-spin" : ""}`} />
          {running ? "Ressincronizando…" : "Ressincronizar e calibrar"}
        </Button>
        <p className="text-xs text-muted-foreground">O índice único deve ser publicado apenas depois da consolidação e da conferência dos dados de produção.</p>
      </CardContent>
    </Card>
  );
}
