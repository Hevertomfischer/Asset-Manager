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
  useGetAdminConfig,
  useUpdateAdminConfig,
  type AdminLog,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/useAuth";
import { useSyncStatus } from "@/components/AutoSync";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Settings, RefreshCw, Database, TerminalSquare, Save, Loader2, Play, AlertCircle, Zap, Clock, RotateCcw } from "lucide-react";

export default function Admin() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const syncStatus = useSyncStatus();

  const { data: logsData, isLoading: logsLoading, isError: logsError } = useGetAdminLogs({ limit: 20 });
  const { data: weightsData, isLoading: weightsLoading, isError: weightsError } = useGetProjectionWeights();
  const { data: providersData, isLoading: providersLoading, isError: providersError } = useGetProvidersStatus();
  const { data: configData } = useGetAdminConfig();

  const updateWeights = useUpdateProjectionWeights();
  const updateConfig = useUpdateAdminConfig();
  const syncFull = useSyncFull();
  const syncMarket = useSyncMarket();
  const syncCurrentRound = useSyncCurrentRound();
  const recalcProjections = useRecalculateProjections();

  const DEFAULT_WEIGHTS: Record<string, number> = {
    formWeight: 0.3,
    availabilityWeight: 0.3,
    fixtureWeight: 0.2,
    valueWeight: 0.1,
    historyWeight: 0.1,
  };

  const [weights, setWeights] = useState<Record<string, number>>(DEFAULT_WEIGHTS);

  const [xgStaleDaysInput, setXgStaleDaysInput] = useState<string>("");

  useEffect(() => {
    if (configData?.xgStaleDays != null) {
      setXgStaleDaysInput(String(configData.xgStaleDays));
    }
  }, [configData]);

  const handleSaveConfig = () => {
    const parsed = parseInt(xgStaleDaysInput, 10);
    if (!parsed || parsed < 1 || parsed > 30) {
      toast({ title: "Valor inválido", description: "Digite um número entre 1 e 30.", variant: "destructive" });
      return;
    }
    updateConfig.mutate(
      { xgStaleDays: parsed },
      {
        onSuccess: () => toast({ title: "Configuração salva", description: `Alerta de xG após ${parsed} dia(s).` }),
        onError: (err) => toast({ title: "Falha ao salvar", description: err.message, variant: "destructive" }),
      }
    );
  };

  const [xgRound, setXgRound] = useState<string>("");
  const [xgSyncing, setXgSyncing] = useState(false);
  const [lastXgResult, setLastXgResult] = useState<{ clubsMapped: number; degraded: boolean } | null>(null);
  const [lastSyncXgSummary, setLastSyncXgSummary] = useState<{ matchesUpdated: number; clubsMapped: number; degraded: boolean } | null>(null);
  const [historicalRound, setHistoricalRound] = useState<string>("");
  const [historicalSyncing, setHistoricalSyncing] = useState(false);

  useEffect(() => {
    if (weightsData?.weights) {
      setWeights(weightsData.weights as Record<string, number>);
    }
  }, [weightsData]);

  useEffect(() => {
    if (!providersData || lastXgResult !== null) return;
    const xgProvider = providersData.providers.find((p) => p.source === "footystats_xg");
    if (xgProvider && xgProvider.clubsMapped != null) {
      setLastXgResult({
        clubsMapped: xgProvider.clubsMapped,
        degraded: xgProvider.status === "degraded",
      });
    }
  }, [providersData]);

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
    const labels: Record<string, string> = { full: "Completo", market: "Mercado", "current-round": "Rodada Atual" };
    mutation.mutate(undefined, {
      onSuccess: (data) => {
        const xgMatches = data?.xgMatchesUpdated;
        const xgClubs = data?.xgClubsMapped;
        const xgDegraded = data?.xgDegraded;

        if (type !== "market" && xgMatches != null && xgClubs != null) {
          setLastSyncXgSummary({ matchesUpdated: xgMatches, clubsMapped: xgClubs, degraded: xgDegraded ?? false });
        }

        toast({ title: `Sincronização ${labels[type]} disparada com sucesso` });
      },
      onError: (err) => toast({ title: "Sincronização falhou", description: err.message, variant: "destructive" }),
    });
  };

  const handleSyncXg = async () => {
    setXgSyncing(true);
    try {
      const body: Record<string, unknown> = {};
      const parsedRound = xgRound.trim() ? parseInt(xgRound.trim(), 10) : null;
      if (parsedRound && parsedRound > 0) body.round = parsedRound;
      const res = await fetch("/api/admin/sync/xg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { success?: boolean; matchesUpdated?: number; clubStatsParsed?: number; clubsMapped?: number; degraded?: boolean; warnings?: string[]; error?: string };
      if (data.success) {
        const mapped = data.clubsMapped ?? 0;
        const isDegraded = data.degraded ?? mapped < 15;
        setLastXgResult({ clubsMapped: mapped, degraded: isDegraded });
        if (isDegraded) {
          toast({
            title: "⚠️ xG sincronizado com degradação",
            description: `${data.matchesUpdated} partidas atualizadas, mas apenas ${mapped}/20 clubes foram mapeados. Projeções podem estar imprecisas.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "xG sincronizado com sucesso",
            description: `${data.matchesUpdated} partidas atualizadas, ${mapped}/20 clubes mapeados.`,
          });
        }
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
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3 h-3 shrink-0" />
          {syncStatus.lastSyncAt
            ? <>Última sincronização: <span className="font-medium text-foreground">{new Date(syncStatus.lastSyncAt).toLocaleString("pt-BR")}</span></>
            : "Aguardando primeira sincronização..."}
          {syncStatus.marketStatus && (
            <Badge variant="outline" className={`ml-2 text-[10px] ${syncStatus.marketStatus === "open" ? "border-green-500/50 text-green-400" : "border-muted-foreground/30 text-muted-foreground"}`}>
              Mercado {syncStatus.marketStatus === "open" ? "aberto" : "fechado"}
            </Badge>
          )}
        </div>
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
                      <Label className="text-sm font-semibold text-foreground">
                        {{ formWeight: "Forma", availabilityWeight: "Disponibilidade", fixtureWeight: "Confronto", valueWeight: "Valor", historyWeight: "Histórico" }[key] ?? key.replace("Weight", "")}
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

            <div className="pt-4 border-t border-border/50 space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-400" />
                  Alerta de dados xG após X dias
                </Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={xgStaleDaysInput}
                    onChange={(e) => setXgStaleDaysInput(e.target.value)}
                    className="h-9 w-24"
                    placeholder="4"
                  />
                  <Button
                    size="sm"
                    onClick={handleSaveConfig}
                    disabled={updateConfig.isPending}
                    variant="outline"
                    className="border-orange-500/40 text-orange-400 hover:bg-orange-500/10"
                  >
                    {updateConfig.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
                    Salvar
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Exibe aviso de "Desatualizado" no painel e no admin quando o último sync de xG for mais antigo que esse número de dias.
                </p>
              </div>

              {isAdmin && (
                <div className="flex gap-3 flex-wrap">
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
                  <Button
                    variant="outline"
                    onClick={() => {
                      setWeights(DEFAULT_WEIGHTS);
                      toast({ title: "Pesos restaurados", description: "Valores voltaram ao padrão do sistema. Clique em Salvar para persistir." });
                    }}
                    className="border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:border-muted-foreground/60"
                    title="Restaurar valores padrão"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Restaurar Default
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Data Pipeline Management */}
        <Card className="bg-card shadow-lg border-border/50">
          <CardHeader className="bg-secondary/20 border-b border-border/50">
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-primary" />
              {isAdmin ? "Controles do Pipeline" : "Status do Pipeline"}
            </CardTitle>
            <CardDescription>
              {isAdmin
                ? "Dispare ingestão manual de dados e veja o status dos provedores."
                : "Sincronização automática ativa — dados atualizados a cada hora e no login."}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            {isAdmin && (
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
                    <span className="font-semibold text-sm">Sync Completo</span>
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
            )}

            {lastSyncXgSummary && (
              <div className={`flex items-start gap-2 p-3 rounded-lg border text-sm ${
                lastSyncXgSummary.degraded
                  ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
                  : "bg-green-500/10 border-green-500/30 text-green-400"
              }`}>
                <Zap className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {lastSyncXgSummary.degraded ? <strong>⚠️ xG degradado — </strong> : null}
                  xG atualizado para <strong>{lastSyncXgSummary.matchesUpdated}</strong> {lastSyncXgSummary.matchesUpdated === 1 ? "partida" : "partidas"},{" "}
                  <strong>{lastSyncXgSummary.clubsMapped}</strong> clubes mapeados
                </span>
              </div>
            )}

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
                      footystats_xg: "Footystats xG",
                      historical_cartola: "Histórico Cartola",
                    };
                    const label = labelMap[p.source] ?? p.source.replace(/_/g, " ");

                    const xgStaleDays = configData?.xgStaleDays ?? 4;
                    const isXgStale = p.source === "footystats_xg" && (() => {
                      if (!p.lastCollectedAt) return true;
                      const ageMs = Date.now() - new Date(p.lastCollectedAt).getTime();
                      return ageMs > xgStaleDays * 24 * 60 * 60 * 1000;
                    })();

                    return (
                      <div
                        key={p.source}
                        className={`flex items-start justify-between p-3 rounded-lg border bg-background gap-2 ${
                          isXgStale ? "border-orange-500/50" : "border-border"
                        }`}
                      >
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
                          {isXgStale && (
                            <p className="text-xs text-orange-400 mt-1 flex items-center gap-1">
                              <Clock className="w-3 h-3 shrink-0" />
                              Dados desatualizados — sincronize antes do fechamento da rodada
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Badge
                            variant={p.status === "ok" ? "default" : p.status === "error" ? "destructive" : "secondary"}
                          >
                            {p.status === "ok" ? "OK" : p.status === "never_synced" ? "Não sincronizado" : p.status === "degraded" ? "Degradado" : "Erro"}
                          </Badge>
                          {isXgStale && (
                            <Badge
                              variant="outline"
                              className="text-[10px] border-orange-500/60 bg-orange-500/10 text-orange-400"
                            >
                              Desatualizado
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* xG Sync — admin only */}
      {isAdmin && <Card className={`bg-card shadow-lg ${lastXgResult?.degraded ? "border-yellow-500/50" : "border-border/50"}`}>
        <CardHeader className="bg-secondary/20 border-b border-border/50">
          <CardTitle className="flex items-center gap-2 flex-wrap">
            <Zap className="w-5 h-5 text-yellow-400" />
            Sincronizar xG (Expectativa de Gols)
            {lastXgResult && (
              <Badge
                variant="outline"
                className={`ml-auto text-xs font-semibold ${
                  lastXgResult.degraded
                    ? "border-yellow-500/60 bg-yellow-500/10 text-yellow-400"
                    : "border-green-500/60 bg-green-500/10 text-green-400"
                }`}
              >
                {lastXgResult.degraded ? "⚠️ " : ""}
                {lastXgResult.clubsMapped}/20 clubes mapeados
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Busca dados de xG diretamente do footystats.org (overall, casa e fora por clube). Nenhuma URL necessária. Deixe a rodada em branco para usar a rodada atual.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {lastXgResult?.degraded && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Apenas <strong>{lastXgResult.clubsMapped}/20</strong> clubes foram mapeados no último sync. Projeções de xG podem estar usando médias da liga para os clubes não encontrados. Verifique os logs para detalhes.
              </span>
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Rodada (opcional)</Label>
            <Input
              type="number"
              min={1}
              max={38}
              value={xgRound}
              onChange={(e) => setXgRound(e.target.value)}
              placeholder="Rodada atual (automático)"
              className="h-10 w-48"
            />
            <p className="text-[10px] text-muted-foreground">
              Fonte: footystats.org/pt/brazil/serie-a/xg
            </p>
          </div>
          <Button
            onClick={handleSyncXg}
            disabled={xgSyncing}
            className="w-full h-12 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 border border-yellow-500/40 font-bold"
            variant="outline"
          >
            {xgSyncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
            Sincronizar xG via Footystats
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            Após sincronizar o xG, recalcule as projeções para atualizar goleiros e zagueiros com probabilidades de SG mais precisas.
          </p>
        </CardContent>
      </Card>}

      {/* Historical Round Sync — admin only */}
      {isAdmin && <Card className="bg-card shadow-lg border-border/50">
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
      </Card>}

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
                    <TableHead>Rodada</TableHead>
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
                            {{ success: "Sucesso", ok: "OK", error: "Erro", degraded: "Degradado", info: "Info", never_synced: "Nunca sincronizado" }[log.status ?? ""] ?? log.status}
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
