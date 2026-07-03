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
  useGetAdminFeedback,
  usePatchFeedbackStatus,
  type AdminLog,
  type FeedbackStatus,
  type FeedbackType,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Settings, RefreshCw, Database, TerminalSquare, Save, Loader2, Play,
  AlertCircle, Zap, Clock, RotateCcw, MessageSquare, Bug, Lightbulb, Star, HelpCircle,
  ChevronLeft, ChevronRight,
} from "lucide-react";

// ── Feedback helpers ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  novo: "Novo",
  em_analise: "Em análise",
  resolvido: "Resolvido",
  arquivado: "Arquivado",
};

const STATUS_COLORS: Record<FeedbackStatus, string> = {
  novo: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  em_analise: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  resolvido: "text-green-400 border-green-500/30 bg-green-500/10",
  arquivado: "text-muted-foreground border-border/40 bg-secondary/30",
};

const TYPE_LABELS: Record<FeedbackType, string> = {
  bug: "Problema",
  ideia: "Ideia",
  elogio: "Elogio",
  duvida: "Dúvida",
};

const TYPE_ICONS: Record<FeedbackType, React.ReactNode> = {
  bug: <Bug className="w-3 h-3" />,
  ideia: <Lightbulb className="w-3 h-3" />,
  elogio: <Star className="w-3 h-3" />,
  duvida: <HelpCircle className="w-3 h-3" />,
};

const TYPE_COLORS: Record<FeedbackType, string> = {
  bug: "text-red-400 border-red-500/30 bg-red-500/10",
  ideia: "text-purple-400 border-purple-500/30 bg-purple-500/10",
  elogio: "text-green-400 border-green-500/30 bg-green-500/10",
  duvida: "text-orange-400 border-orange-500/30 bg-orange-500/10",
};

const FEEDBACK_LIMIT = 15;

// ── Configuração dos pesos do motor de projeção ───────────────────────────────

const WEIGHT_CONFIG: Record<string, { label: string; hint: string }> = {
  // Pesos principais de projeção
  formWeight: {
    label: "Forma",
    hint: "Desempenho do jogador nas últimas rodadas. Peso alto favorece quem está em boa sequência recente.",
  },
  availabilityWeight: {
    label: "Disponibilidade",
    hint: "Probabilidade de o jogador ser escalado. Penaliza jogadores com risco de ficar no banco ou fora por lesão.",
  },
  fixtureWeight: {
    label: "Confronto",
    hint: "Dificuldade do adversário na rodada. Confrontos fáceis elevam a projeção; adversários fortes a reduzem.",
  },
  valueWeight: {
    label: "Valor de Mercado",
    hint: "Custo-benefício em relação ao preço do jogador. Prioriza boas projeções por cartoleta investida.",
  },
  historyWeight: {
    label: "Histórico",
    hint: "Média histórica de pontos ao longo da temporada. Suaviza picos e vales pontuais do desempenho recente.",
  },
  // Pesos de calibração interna da projeção base
  overallAverage: {
    label: "Média Geral",
    hint: "Peso da média histórica do jogador como âncora da projeção. Quanto maior, mais conservador o modelo.",
  },
  recentForm: {
    label: "Forma Recente",
    hint: "Peso das últimas rodadas para capturar tendência de alta ou queda de desempenho no curto prazo.",
  },
  matchup: {
    label: "Qualidade do Confronto (xG)",
    hint: "Peso da dificuldade do adversário com base em Expected Goals (xG). Depende da disponibilidade dos dados do Footystats.",
  },
  playProbability: {
    label: "Probabilidade de Jogar",
    hint: "Peso da chance do jogador entrar em campo segundo o status no Cartola (Provável, Dúvida, etc.).",
  },
  homeAdvantage: {
    label: "Vantagem em Casa",
    hint: "Bônus por jogar em casa — times mandantes tendem a pontuar mais. Peso zero anula esse fator.",
  },
};

// ── FeedbackTab ───────────────────────────────────────────────────────────────

function FeedbackTab() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<FeedbackType | "">("");
  const [page, setPage] = useState(0);

  const offset = page * FEEDBACK_LIMIT;

  const { data, isLoading, isError } = useGetAdminFeedback({
    status: statusFilter,
    type: typeFilter,
    limit: FEEDBACK_LIMIT,
    offset,
  });

  const patchStatus = usePatchFeedbackStatus();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / FEEDBACK_LIMIT));

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [statusFilter, typeFilter]);

  const handleStatusChange = (id: number, status: FeedbackStatus) => {
    patchStatus.mutate(
      { id, status },
      {
        onError: (err) => toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as FeedbackStatus | "")}>
          <SelectTrigger className="h-9 w-44 text-sm">
            <SelectValue placeholder="Todos os status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos os status</SelectItem>
            <SelectItem value="novo">Novo</SelectItem>
            <SelectItem value="em_analise">Em análise</SelectItem>
            <SelectItem value="resolvido">Resolvido</SelectItem>
            <SelectItem value="arquivado">Arquivado</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as FeedbackType | "")}>
          <SelectTrigger className="h-9 w-40 text-sm">
            <SelectValue placeholder="Todos os tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Todos os tipos</SelectItem>
            <SelectItem value="bug">Problema</SelectItem>
            <SelectItem value="ideia">Ideia</SelectItem>
            <SelectItem value="elogio">Elogio</SelectItem>
            <SelectItem value="duvida">Dúvida</SelectItem>
          </SelectContent>
        </Select>

        {(statusFilter || typeFilter) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setStatusFilter(""); setTypeFilter(""); }}
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Limpar filtros
          </Button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {isLoading ? "..." : `${total} resultado${total !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Table */}
      <Card className="bg-card shadow-lg border-border/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm p-8">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              Carregando feedbacks...
            </div>
          ) : isError ? (
            <div className="flex items-center gap-2 text-destructive text-sm p-8 bg-destructive/10">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Erro ao carregar feedbacks. Tente novamente.
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <MessageSquare className="w-10 h-10 opacity-20" />
              <p className="text-sm">Nenhum feedback encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50">
                    <TableHead className="w-10 text-center">#</TableHead>
                    <TableHead>Página</TableHead>
                    <TableHead className="w-24">Tipo</TableHead>
                    <TableHead>Mensagem</TableHead>
                    <TableHead className="w-36">Data</TableHead>
                    <TableHead className="w-40">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id} className="border-border/30 hover:bg-secondary/20 transition-colors align-top">
                      <TableCell className="text-center text-xs text-muted-foreground font-mono">{item.id}</TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono max-w-[160px] truncate" title={item.page}>
                        {item.page}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] flex items-center gap-1 w-fit ${TYPE_COLORS[item.type as FeedbackType] ?? ""}`}
                        >
                          {TYPE_ICONS[item.type as FeedbackType]}
                          {TYPE_LABELS[item.type as FeedbackType] ?? item.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-foreground max-w-sm">
                        <p className="line-clamp-3 leading-relaxed" title={item.message}>{item.message}</p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleString("pt-BR", {
                          day: "2-digit", month: "2-digit", year: "2-digit",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.status}
                          onValueChange={(v) => handleStatusChange(item.id, v as FeedbackStatus)}
                          disabled={patchStatus.isPending}
                        >
                          <SelectTrigger className="h-7 text-[11px] w-36">
                            <SelectValue>
                              <span
                                className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border ${STATUS_COLORS[item.status as FeedbackStatus] ?? ""}`}
                              >
                                {STATUS_LABELS[item.status as FeedbackStatus] ?? item.status}
                              </span>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(STATUS_LABELS) as FeedbackStatus[]).map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">
                                {STATUS_LABELS[s]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Defaults do motor de projeção (espelham projectionWeights.ts no servidor) ─

const DEFAULT_WEIGHTS: Record<string, number> = {
  // Pesos de projeção principal
  formWeight: 0.3,
  availabilityWeight: 0.3,
  fixtureWeight: 0.2,
  valueWeight: 0.1,
  historyWeight: 0.1,
  // Pesos de calibração interna
  overallAverage: 0.3,
  recentForm: 0.35,
  matchup: 0.15,
  playProbability: 0.15,
  homeAdvantage: 0.05,
};

// ── Admin page ────────────────────────────────────────────────────────────────

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

  useEffect(() => {
    if (weightsData?.weights) {
      const incoming: Record<string, number> = {};
      for (const [k, v] of Object.entries(weightsData.weights)) {
        if (typeof v === "number" && !Number.isNaN(v)) incoming[k] = v;
      }
      if (Object.keys(incoming).length > 0) setWeights((prev) => ({ ...prev, ...incoming }));
    }
  }, [weightsData]);

  const handleSaveWeights = () => {
    const total = Object.values(weights).reduce((s, v) => s + v, 0);
    if (Math.abs(total - 1) > 0.01) {
      toast({ title: "Pesos inválidos", description: `A soma deve ser 1.00 (atual: ${total.toFixed(2)})`, variant: "destructive" });
      return;
    }
    updateWeights.mutate({ data: weights }, {
      onSuccess: () => toast({ title: "Pesos salvos", description: "Motor de projeção atualizado." }),
      onError: (err) => toast({ title: "Falha ao salvar pesos", description: err.message, variant: "destructive" }),
    });
  };

  const handleSyncFull = () => {
    syncFull.mutate(undefined, {
      onSuccess: (data) => toast({ title: "Sync completo iniciado", description: (data as { message?: string })?.message }),
      onError: (err) => toast({ title: "Erro no sync", description: err.message, variant: "destructive" }),
    });
  };

  const handleSyncMarket = () => {
    syncMarket.mutate(undefined, {
      onSuccess: () => toast({ title: "Mercado sincronizado" }),
      onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
    });
  };

  const handleSyncCurrentRound = () => {
    syncCurrentRound.mutate(undefined, {
      onSuccess: () => toast({ title: "Rodada atual sincronizada" }),
      onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
    });
  };

  const handleRecalc = () => {
    recalcProjections.mutate(undefined, {
      onSuccess: () => toast({ title: "Projeções recalculadas" }),
      onError: (err) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
    });
  };

  const handleSyncXg = async () => {
    if (!xgRound) return;
    setXgSyncing(true);
    setLastXgResult(null);
    try {
      const res = await fetch(`/api/admin/sync-xg?round=${xgRound}`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { clubsMapped?: number; degraded?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setLastXgResult({ clubsMapped: json.clubsMapped ?? 0, degraded: json.degraded ?? false });
      toast({ title: "xG sincronizado", description: `${json.clubsMapped ?? 0} clubes mapeados.` });
    } catch (err) {
      toast({ title: "Erro no sync xG", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setXgSyncing(false);
    }
  };

  const [historicalRound, setHistoricalRound] = useState<string>("");
  const [historicalSyncing, setHistoricalSyncing] = useState(false);

  const handleSyncHistorical = async () => {
    if (!historicalRound) return;
    setHistoricalSyncing(true);
    try {
      const res = await fetch(`/api/admin/sync/historical/${historicalRound}`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast({ title: "Rodada histórica sincronizada", description: json.message ?? "" });
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
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

      <Tabs defaultValue="sistema">
        <TabsList className="mb-6">
          <TabsTrigger value="sistema">
            <Settings className="w-4 h-4 mr-2" />
            Sistema
          </TabsTrigger>
          <TabsTrigger value="feedback">
            <MessageSquare className="w-4 h-4 mr-2" />
            Feedback
          </TabsTrigger>
        </TabsList>

        {/* ── Aba Sistema ─────────────────────────────────────────────────── */}
        <TabsContent value="sistema" className="space-y-8">
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
                  <div className="space-y-5">
                    {Object.entries(weights).map(([key, value]) => {
                      const cfg = WEIGHT_CONFIG[key];
                      return (
                        <div key={key} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm font-semibold text-foreground">
                              {cfg?.label ?? key}
                            </Label>
                            <span className="font-mono text-sm text-primary font-bold">{value.toFixed(2)}</span>
                          </div>
                          {cfg?.hint && (
                            <p className="text-[11px] text-muted-foreground leading-snug">
                              {cfg.hint}
                            </p>
                          )}
                          <Slider
                            value={[value]}
                            max={1}
                            min={0}
                            step={0.05}
                            onValueChange={(v) => setWeights((prev) => ({ ...prev, [key]: v[0] }))}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="pt-4 border-t border-border/50 space-y-4">
                  {isAdmin && (
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
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
                      onClick={() => {
                        setWeights(DEFAULT_WEIGHTS);
                        toast({ title: "Pesos restaurados", description: "Valores padrão do sistema carregados. Clique em Salvar para confirmar." });
                      }}
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restaurar padrão
                    </Button>
                    <Button
                      onClick={handleSaveWeights}
                      disabled={updateWeights.isPending}
                      className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/40 font-bold"
                      variant="outline"
                    >
                      {updateWeights.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                      Salvar Pesos
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pipeline Controls */}
            <Card className="bg-card shadow-lg border-border/50">
              <CardHeader className="bg-secondary/20 border-b border-border/50">
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  Pipeline de Dados
                </CardTitle>
                <CardDescription>
                  Sincronize dados do Cartola FC e recalcule projeções manualmente.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {providersLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    Carregando status...
                  </div>
                ) : providersError ? (
                  <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-lg border border-destructive/30">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    Erro ao carregar provedores.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {providers.map((p) => (
                      <div key={p.source} className="flex items-center justify-between py-2 border-b border-border/20 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold capitalize">{p.source.replace(/_/g, " ")}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`text-[10px] uppercase border ${
                              p.status === "ok" || p.status === "success"
                                ? "text-green-500 border-green-500/30 bg-green-500/10"
                                : p.status === "error"
                                  ? "text-red-500 border-red-500/30 bg-red-500/10"
                                  : p.status === "degraded"
                                    ? "text-yellow-500 border-yellow-500/30 bg-yellow-500/10"
                                    : "text-muted-foreground border-border/40"
                            }`}
                          >
                            {{ ok: "OK", success: "Sucesso", error: "Erro", degraded: "Degradado", never_synced: "Nunca" }[p.status] ?? p.status}
                          </Badge>
                          {p.lastCollectedAt && (
                            <span className="text-[10px] text-muted-foreground hidden sm:inline">
                              {new Date(p.lastCollectedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <Button onClick={handleSyncFull} disabled={syncFull.isPending} variant="outline" className="border-primary/40 text-primary hover:bg-primary/10 font-bold">
                    {syncFull.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                    Sync Completo
                  </Button>
                  <Button onClick={handleSyncMarket} disabled={syncMarket.isPending} variant="outline" className="border-blue-500/40 text-blue-400 hover:bg-blue-500/10 font-bold">
                    {syncMarket.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                    Mercado
                  </Button>
                  <Button onClick={handleSyncCurrentRound} disabled={syncCurrentRound.isPending} variant="outline" className="border-green-500/40 text-green-400 hover:bg-green-500/10 font-bold">
                    {syncCurrentRound.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                    Rodada Atual
                  </Button>
                  <Button onClick={handleRecalc} disabled={recalcProjections.isPending} variant="outline" className="border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10 font-bold">
                    {recalcProjections.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
                    Recalcular
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* xG Sync */}
          {isAdmin && <Card className={`bg-card shadow-lg ${lastXgResult?.degraded ? "border-yellow-500/50" : "border-border/50"}`}>
            <CardHeader className="bg-secondary/20 border-b border-border/50">
              <CardTitle className="flex items-center gap-2 flex-wrap">
                <Zap className="w-5 h-5 text-accent" />
                Sincronizar Dados xG
                {lastXgResult && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] ml-auto ${lastXgResult.degraded ? "text-yellow-400 border-yellow-500/30 bg-yellow-500/10" : "text-green-400 border-green-500/30 bg-green-500/10"}`}
                  >
                    {lastXgResult.degraded ? "Degradado" : "OK"} — {lastXgResult.clubsMapped} clubes
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                Importa dados de Expected Goals (xG) do Footystats para a rodada especificada.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Número da Rodada</Label>
                  <Input
                    type="number"
                    min={1}
                    value={xgRound}
                    onChange={(e) => setXgRound(e.target.value)}
                    placeholder="Ex: 19"
                    className="h-10 w-32"
                  />
                </div>
                <Button
                  onClick={handleSyncXg}
                  disabled={xgSyncing || !xgRound}
                  className="h-10 bg-accent/20 hover:bg-accent/30 text-accent border border-accent/40 font-bold"
                  variant="outline"
                >
                  {xgSyncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                  Sincronizar xG
                </Button>
              </div>
            </CardContent>
          </Card>}

          {/* Historical Sync */}
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
        </TabsContent>

        {/* ── Aba Feedback ────────────────────────────────────────────────── */}
        <TabsContent value="feedback">
          <FeedbackTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
