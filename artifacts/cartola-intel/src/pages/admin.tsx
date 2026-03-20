import { useState, useEffect } from "react";
import {
  useGetProvidersStatus,
  useRecalculateProjections,
  useSyncCurrentRound,
  useSyncFull,
  useSyncMarket,
  useGetAdminLogs,
  useGetProjectionWeights,
  useUpdateProjectionWeights,
  type AdminLog,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Settings, RefreshCw, Database, TerminalSquare, Save, Loader2, Play, AlertCircle, Zap } from "lucide-react";

export default function Admin() {
  const { toast } = useToast();

  const { data: logsData, isLoading: logsLoading, isError: logsError } = useGetAdminLogs({ limit: 20 });
  const { data: weightsData, isLoading: weightsLoading, isError: weightsError } = useGetProjectionWeights();
  const { data: providersData, isLoading: providersLoading, isError: providersError } = useGetProvidersStatus();

  const updateWeights = useUpdateProjectionWeights();
  const syncFull = useSyncFull();
  const syncMarket = useSyncMarket();
  const syncCurrentRound = useSyncCurrentRound();
  const recalcProjections = useRecalculateProjections();

  const [weights, setWeights] = useState<Record<string, number>>({
    formWeight: 0.3,
    availabilityWeight: 0.3,
    fixtureWeight: 0.2,
    valueWeight: 0.1,
    historyWeight: 0.1,
  });

  const [xgUrl, setXgUrl] = useState("https://ge.globo.com/gato-mestre/dicas/noticia/2026/03/18/veja-a-expectativa-de-gols-xg-e-as-dicas-de-sg-para-a-rodada-7-do-cartola-2026.ghtml");
  const [xgSyncing, setXgSyncing] = useState(false);
  const [historicalRound, setHistoricalRound] = useState<string>("");
  const [historicalSyncing, setHistoricalSyncing] = useState(false);

  useEffect(() => {
    if (weightsData?.weights) {
      setWeights(weightsData.weights as Record<string, number>);
    }
  }, [weightsData]);

  const handleSaveWeights = () => {
    updateWeights.mutate(
      { data: weights },
      {
        onSuccess: () => toast({ title: "Pesos atualizados com sucesso" }),
        onError: (err) => toast({ title: "Falha ao atualizar pesos", description: err.message, variant: "destructive" }),
      }
    );
  };

  const handleRecalc = () => {
    recalcProjections.mutate(undefined, {
      onSuccess: (data) => toast({ title: "Projeções recalculadas", description: data?.message }),
      onError: (err) => toast({ title: "Recalculo falhou", description: err.message, variant: "destructive" }),
    });
  };

  const handleSync = (type: "full" | "market" | "current-round") => {
    const mutation = type === "full" ? syncFull : type === "market" ? syncMarket : syncCurrentRound;
    const labels: Record<string, string> = { full: "Full", market: "Mercado", "current-round": "Rodada Atual" };
    mutation.mutate(undefined, {
      onSuccess: () => toast({ title: `Sync ${labels[type]} disparado com sucesso` }),
      onError: (err) => toast({ title: "Sync falhou", description: err.message, variant: "destructive" }),
    });
  };

  const handleSyncXg = async () => {
    if (!xgUrl.trim()) {
      toast({ title: "URL inválida", description: "Cole a URL do artigo do Gato Mestre.", variant: "destructive" });
      return;
    }
    setXgSyncing(true);
    try {
      const res = await fetch("/api/admin/sync/xg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: xgUrl.trim() }),
      });
      const data = await res.json() as { success?: boolean; matchesUpdated?: number; clubStatsParsed?: number; clubsMapped?: number; warnings?: string[]; error?: string };
      if (data.success) {
        toast({
          title: "xG sincronizado com sucesso",
          description: `${data.matchesUpdated} partidas atualizadas, ${data.clubStatsParsed} stats de times extraídas, ${data.clubsMapped} times mapeados.`,
        });
      } else {
        toast({ title: "Falha no sync xG", description: data.error ?? "Erro desconhecido", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Erro de rede", description: String(err), variant: "destructive" });
    } finally {
      setXgSyncing(false);
    }
  };

  const handleSyncHistorical = async () => {
    const round = parseInt(historicalRound, 10);
    if (!round || round < 1) {
      toast({ title: "Rodada inválida", description: "Digite um número de rodada válido.", variant: "destructive" });
      return;
    }
    setHistoricalSyncing(true);
    try {
      const res = await fetch("/api/admin/sync/historical-round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ round }),
      });
      const data = await res.json() as { success?: boolean; message?: string; error?: string };
      if (data.success) {
        toast({ title: `Rodada ${round} sincronizada`, description: data.message });
      } else {
        toast({ title: "Falha no sync histórico", description: data.error ?? "Erro desconhecido", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Erro de rede", description: String(err), variant: "destructive" });
    } finally {
      setHistoricalSyncing(false);
    }
  };

  const logs: AdminLog[] = logsData?.logs || [];
  const providers = providersData?.providers || [];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
          <Settings className="w-8 h-8 text-primary" />
          Administração
        </h1>
        <p className="text-muted-foreground mt-1">Gerencie pesos, pipelines de dados e logs do sistema.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Engine Configuration */}
        <Card className="bg-card shadow-lg border-border/50">
          <CardHeader className="bg-secondary/20 border-b border-border/50">
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-accent" />
              Configuração do Motor
            </CardTitle>
            <CardDescription>Ajuste os pesos usados pelo algoritmo de projeção.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {weightsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm p-3">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                Carregando configuração...
              </div>
            ) : weightsError ? (
              <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Erro ao carregar pesos. Tente novamente.
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(weights).map(([key, value]) => (
                  <div key={key} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold capitalize text-foreground">
                        {key.replace("Weight", "")} Weight
                      </Label>
                      <span className="font-mono text-sm text-primary font-bold">{value.toFixed(2)}</span>
                    </div>
                    <Slider
                      value={[value]}
                      max={1}
                      min={0}
                      step={0.05}
                      onValueChange={(v) => setWeights((prev) => ({ ...prev, [key]: v[0] }))}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="pt-4 border-t border-border/50 flex gap-4">
              <Button
                onClick={handleSaveWeights}
                disabled={updateWeights.isPending || weightsError}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {updateWeights.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar Pesos
              </Button>
              <Button
                variant="secondary"
                onClick={handleRecalc}
                disabled={recalcProjections.isPending}
                className="flex-1 border border-border"
              >
                {recalcProjections.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Recalcular Agora
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Data Pipeline Management */}
        <Card className="bg-card shadow-lg border-border/50">
          <CardHeader className="bg-secondary/20 border-b border-border/50">
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-primary" />
              Controles do Pipeline
            </CardTitle>
            <CardDescription>Dispare ingestão manual de dados e veja o status dos provedores.</CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 gap-3">
              <Button
                className="h-14 flex items-center justify-center gap-3 bg-primary hover:bg-primary/90 text-primary-foreground transition-all shadow-lg shadow-primary/20"
                onClick={() => handleSync("current-round")}
                disabled={syncCurrentRound.isPending}
              >
                {syncCurrentRound.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                <span className="font-bold">Sincronizar Rodada Atual</span>
              </Button>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-12 flex items-center justify-center gap-2 border-border hover:border-primary hover:bg-primary/5 transition-all"
                  onClick={() => handleSync("full")}
                  disabled={syncFull.isPending}
                >
                  {syncFull.isPending ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <Play className="w-4 h-4 text-primary" />}
                  <span className="font-semibold text-sm">Sync Full</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-12 flex items-center justify-center gap-2 border-border hover:border-accent hover:bg-accent/5 transition-all"
                  onClick={() => handleSync("market")}
                  disabled={syncMarket.isPending}
                >
                  {syncMarket.isPending ? <Loader2 className="w-4 h-4 animate-spin text-accent" /> : <Play className="w-4 h-4 text-accent" />}
                  <span className="font-semibold text-sm">Sync Mercado</span>
                </Button>
              </div>
            </div>

            <div className="space-y-3 pt-4">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Status dos Provedores</Label>
              {providersLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm p-3">
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  Carregando provedores...
                </div>
              ) : providersError ? (
                <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Erro ao carregar status dos provedores.
                </div>
              ) : (
                <div className="space-y-2">
                  {providers.map((p) => {
                    const labelMap: Record<string, string> = {
                      cartola_api: "Cartola API",
                      cartola_status: "Cartola Status (Disponibilidade)",
                      ge_probables: "GE Prováveis",
                      gato_mestre: "Gato Mestre",
                      historical_cartola: "Histórico Cartola",
                    };
                    const label = labelMap[p.source] ?? p.source.replace(/_/g, " ");
                    return (
                      <div key={p.source} className="flex items-start justify-between p-3 rounded-lg border border-border bg-background gap-2">
                        <div className="min-w-0">
                          <span className="font-medium text-sm">{label}</span>
                          <p className="text-xs text-muted-foreground">
                            {p.lastCollectedAt
                              ? new Date(p.lastCollectedAt).toLocaleString("pt-BR")
                              : "Nunca sincronizado"}
                          </p>
                          {p.lastMessage && (
                            <p className="text-xs text-muted-foreground/70 truncate max-w-xs" title={p.lastMessage}>
                              {p.lastMessage}
                            </p>
                          )}
                        </div>
                        <Badge
                          variant={p.status === "ok" ? "default" : p.status === "error" ? "destructive" : "secondary"}
                          className="shrink-0"
                        >
                          {p.status === "ok" ? "OK" : p.status === "never_synced" ? "Não sincronizado" : p.status === "degraded" ? "Degradado" : "Erro"}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* xG Sync */}
      <Card className="bg-card shadow-lg border-border/50">
        <CardHeader className="bg-secondary/20 border-b border-border/50">
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            Sincronizar xG (Expectativa de Gols)
          </CardTitle>
          <CardDescription>
            Cole a URL do artigo do Gato Mestre com xG da rodada. Os valores serão extraídos e usados nas projeções e confrontos.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">URL do Artigo (Gato Mestre / GE)</Label>
            <Input
              value={xgUrl}
              onChange={(e) => setXgUrl(e.target.value)}
              placeholder="https://ge.globo.com/gato-mestre/dicas/noticia/..."
              className="font-mono text-xs h-10"
            />
            <p className="text-[10px] text-muted-foreground">
              Padrão: <span className="font-mono">ge.globo.com/gato-mestre/dicas/noticia/YYYY/MM/DD/veja-a-expectativa-de-gols-xg-...-rodada-N-do-cartola-AAAA.ghtml</span>
            </p>
          </div>
          <Button
            onClick={handleSyncXg}
            disabled={xgSyncing}
            className="w-full h-12 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/40 font-bold"
            variant="outline"
          >
            {xgSyncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
            Sincronizar xG da Rodada
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            Após sincronizar o xG, recalcule as projeções para atualizar goalkeepers e zagueiros com probabilidades de SG mais precisas.
          </p>
        </CardContent>
      </Card>

      {/* Historical Round Sync */}
      <Card className="bg-card shadow-lg border-border/50">
        <CardHeader className="bg-secondary/20 border-b border-border/50">
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-blue-400" />
            Sincronizar Pontuação Histórica
          </CardTitle>
          <CardDescription>
            Busca os pontos reais (scouts finais) de uma rodada já encerrada. Use para popular o backtest com dados reais.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Número da Rodada</Label>
              <Input
                type="number"
                min={1}
                value={historicalRound}
                onChange={(e) => setHistoricalRound(e.target.value)}
                placeholder="Ex: 7"
                className="h-10 w-32"
              />
            </div>
            <Button
              onClick={handleSyncHistorical}
              disabled={historicalSyncing || !historicalRound}
              className="h-10 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/40 font-bold"
              variant="outline"
            >
              {historicalSyncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              Sincronizar
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Após sincronizar, acesse o Histórico para ver os pontos reais vs. projetados no backtest de escalação.
          </p>
        </CardContent>
      </Card>

      {/* System Logs */}
      <Card className="bg-card shadow-lg border-border/50">
        <CardHeader className="bg-secondary/20 border-b border-border/50">
          <CardTitle className="flex items-center gap-2">
            <TerminalSquare className="w-5 h-5 text-muted-foreground" />
            Logs do Sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm p-6">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              Carregando logs...
            </div>
          ) : logsError ? (
            <div className="flex items-center gap-2 text-destructive text-sm p-6 bg-destructive/10">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Erro ao carregar logs. Tente novamente.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead className="w-[180px]">Timestamp</TableHead>
                    <TableHead>Fonte</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Round</TableHead>
                    <TableHead className="w-1/2">Mensagem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                        Nenhum log disponível
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log, i) => (
                      <TableRow key={i} className="border-border/30 hover:bg-secondary/20 transition-colors">
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {new Date(log.collectedAt || log.createdAt || "").toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-xs font-semibold capitalize">{log.source?.replace(/_/g, " ")}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-[10px] uppercase border ${
                              log.status === "success" || log.status === "ok"
                                ? "text-green-500 border-green-500/30 bg-green-500/10"
                                : log.status === "error"
                                  ? "text-red-500 border-red-500/30 bg-red-500/10"
                                  : "text-yellow-500 border-yellow-500/30 bg-yellow-500/10"
                            }`}
                          >
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{log.round ?? "-"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-md truncate" title={log.message ?? ""}>
                          {log.message}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
