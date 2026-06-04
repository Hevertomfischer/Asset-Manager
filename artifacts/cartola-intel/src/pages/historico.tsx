import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { usePaywall } from "@/context/PaywallContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { History, AlertCircle, Trophy, Bomb, Info, BarChart2, Users, Crown, TrendingUp, TrendingDown, Minus, Star, CheckCircle2, XCircle } from "lucide-react";
import { ProGate } from "@/components/ProGate";
import { getPositionColor } from "@/hooks/use-custom-api";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Dot,
} from "recharts";

interface BacktestPlayer {
  playerId: number;
  name: string;
  position: string;
  round: number;
  projected: number;
  actual: number;
  error: number;
  absError: number;
  overestimated: boolean;
}

interface ByPosition {
  mae: number;
  count: number;
  overestimatedPct: number;
}

interface ByRound {
  round: number;
  mae: number;
  count: number;
}

interface BacktestSummary {
  mae: number;
  maePlayedOnly: number;
  playedCount: number;
  dnpCount: number;
  totalPlayers: number;
  byPosition: Record<string, ByPosition>;
  byRound: ByRound[];
  message: string | null;
}

interface BacktestResponse {
  summary: BacktestSummary;
  bestPredictions: BacktestPlayer[];
  worstPredictions: BacktestPlayer[];
}

interface LineupBacktestPlayer {
  playerId: number;
  name: string;
  nickname: string | null;
  position: string;
  isCaptain: boolean;
  isCoach: boolean;
  clubAbbr: string | null;
  clubName: string | null;
  projected: number | null;
  actual: number | null;
  actualRaw: number | null;
  error: number | null;
}

interface LineupBacktestRound {
  round: number;
  lineupId: number;
  strategyType: string;
  formation: string;
  totalCost: number | null;
  projectedTotal: number | null;
  projectedComparableTotal: number | null;
  actualTotal: number | null;
  difference: number | null;
  differenceSign: "above" | "below" | null;
  hasActualData: boolean;
  playersWithData: number;
  allCoveredByData: boolean;
  players: LineupBacktestPlayer[];
}

interface LineupBacktestResponse {
  rounds: LineupBacktestRound[];
  message: string | null;
}

async function fetchBacktest(round?: number): Promise<BacktestResponse> {
  const params = round ? `?round=${round}&limit=10` : "?limit=10";
  const res = await fetch(`/api/history/backtest${params}`, { credentials: "include" });
  if (!res.ok) throw Object.assign(new Error("Failed to fetch backtest"), { status: res.status });
  return res.json() as Promise<BacktestResponse>;
}

async function fetchLineupBacktest(round?: number): Promise<LineupBacktestResponse> {
  const params = round ? `?round=${round}` : "";
  const res = await fetch(`/api/history/lineup-backtest${params}`, { credentials: "include" });
  if (!res.ok) throw Object.assign(new Error("Failed to fetch lineup backtest"), { status: res.status });
  return res.json() as Promise<LineupBacktestResponse>;
}

async function fetchRounds(): Promise<{ rounds: number[] }> {
  const res = await fetch("/api/history/rounds", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch rounds");
  return res.json() as Promise<{ rounds: number[] }>;
}

async function fetchLineupRounds(): Promise<{ rounds: number[] }> {
  const res = await fetch("/api/history/lineup-rounds", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch lineup rounds");
  return res.json() as Promise<{ rounds: number[] }>;
}

function MaeBar({ mae, max = 10 }: { mae: number; max?: number }) {
  const pct = Math.min((mae / max) * 100, 100);
  const color = mae <= 2 ? "bg-green-500" : mae <= 5 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-border/30 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-foreground font-bold w-10 text-right">{mae.toFixed(2)}</span>
    </div>
  );
}

function PlayerRow({ player, rank, isGood }: { player: BacktestPlayer; rank: number; isGood: boolean }) {
  const errorColor = isGood ? "text-green-500" : player.overestimated ? "text-red-400" : "text-blue-400";
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/20 last:border-0">
      <span className="text-xs text-muted-foreground font-mono w-5">#{rank}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{player.name}</p>
        <p className="text-[10px] text-muted-foreground">Rodada {player.round}</p>
      </div>
      <Badge variant="outline" className={`text-[10px] font-mono shrink-0 ${getPositionColor(player.position)}`}>
        {player.position}
      </Badge>
      <div className="text-right shrink-0">
        <p className="text-xs font-mono text-muted-foreground">
          Proj: <span className="text-foreground">{player.projected}</span>
          {" · "}
          Real: <span className="text-foreground">{player.actual}</span>
        </p>
        <p className={`text-xs font-mono font-bold ${errorColor}`}>
          {player.overestimated ? "−" : "+"}{player.absError} pts
        </p>
      </div>
    </div>
  );
}

function DiffIndicator({ value, sign }: { value: number | null; sign?: "above" | "below" | null }) {
  if (value === null) return <span className="text-muted-foreground font-mono text-xs">—</span>;
  if (value < 0.5) return (
    <span className="flex items-center gap-1 text-muted-foreground text-xs font-mono font-bold">
      <Minus className="w-3 h-3" /> {value.toFixed(2)}
    </span>
  );
  return sign === "above" ? (
    <span className="flex items-center gap-1 text-green-500 text-xs font-mono font-bold">
      <TrendingUp className="w-3 h-3" /> +{value.toFixed(2)}
    </span>
  ) : (
    <span className="flex items-center gap-1 text-red-400 text-xs font-mono font-bold">
      <TrendingDown className="w-3 h-3" /> −{value.toFixed(2)}
    </span>
  );
}

function LineupBacktestCard({ data, hideRoundTitle = false }: { data: LineupBacktestRound; hideRoundTitle?: boolean }) {
  const totalPlayers = (data.players ?? []).filter((p) => p.position !== "TEC").length;
  const playersWithData = data.playersWithData ?? 0;
  const allCoveredByData = data.allCoveredByData ?? true;
  const projectedComparableTotal = data.projectedComparableTotal ?? null;
  const isPartial = !allCoveredByData && data.hasActualData;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              {!hideRoundTitle && <>Rodada {data.round}</>}
              {isPartial && (
                <span className="text-[10px] font-normal text-yellow-500 bg-yellow-500/10 border border-yellow-500/30 px-1.5 py-0.5 rounded">
                  {playersWithData}/{totalPlayers} com dados
                </span>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {strategyLabels[data.strategyType] ?? data.strategyType} · {data.formation} · C$ {data.totalCost?.toFixed(2) ?? "—"}
            </p>
          </div>
          <div className="flex gap-4 text-right">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Projetado</p>
              <p className="text-2xl font-bold font-mono text-foreground">{data.projectedTotal?.toFixed(2) ?? "—"}</p>
              {isPartial && projectedComparableTotal != null && (
                <p className="text-[10px] text-muted-foreground">({projectedComparableTotal.toFixed(2)} comparável)</p>
              )}
            </div>
            {data.hasActualData && (
              <>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Real</p>
                  <p className={`text-2xl font-bold font-mono ${
                    data.differenceSign === "above" ? "text-green-500" : "text-red-400"
                  }`}>
                    {data.actualTotal?.toFixed(2) ?? "—"}
                  </p>
                  {isPartial && (
                    <p className="text-[10px] text-muted-foreground">parcial</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{isPartial ? "Dif. (compar.)" : "Dif. Abs."}</p>
                  <div className="text-2xl font-bold font-mono mt-0.5">
                    <DiffIndicator value={data.difference} sign={data.differenceSign} />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!data.hasActualData ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center border border-dashed border-border/40 rounded-lg bg-muted/10">
            <History className="w-8 h-8 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Pontuação real ainda não disponível</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Os dados reais desta rodada ainda não foram sincronizados. Aguarde o encerramento da rodada e sincronize pelo Admin.
              </p>
            </div>
            <div className="mt-1 text-xs text-muted-foreground/50">
              Escalação projetada: <span className="font-mono font-bold text-foreground">{data.projectedTotal?.toFixed(2) ?? "—"} pts</span> com {data.players.length} jogadores
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="text-left py-2 pr-3 text-xs text-muted-foreground font-semibold uppercase tracking-wider">Jogador</th>
                  <th className="text-center py-2 px-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider w-16">Pos</th>
                  <th className="text-right py-2 px-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider">Projetado</th>
                  <th className="text-right py-2 px-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider">Real</th>
                  <th className="text-right py-2 pl-2 text-xs text-muted-foreground font-semibold uppercase tracking-wider">Dif.</th>
                </tr>
              </thead>
              <tbody>
                {data.players.map((p) => {
                  const diff = p.actual !== null && p.projected !== null ? p.actual - p.projected : null;
                  const rowBg = p.isCaptain ? "bg-yellow-500/5" : p.isCoach ? "bg-primary/5" : "";
                  return (
                    <tr key={p.playerId} className={`border-b border-border/20 last:border-0 ${rowBg}`}>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          {p.isCaptain && <Crown className="w-3.5 h-3.5 text-yellow-500 shrink-0" />}
                          <div>
                            <p className="font-semibold text-foreground leading-tight">{p.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {p.clubAbbr ?? p.clubName ?? ""}
                              {p.isCaptain && <span className="ml-1 text-yellow-500 font-bold">× 2</span>}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <Badge variant="outline" className={`text-[10px] font-mono ${getPositionColor(p.position)}`}>
                          {p.position}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-sm text-foreground">
                        {p.projected !== null ? p.projected.toFixed(2) : "—"}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-sm">
                        {p.actual !== null ? (
                          <span className={(p.actual ?? 0) >= (p.projected ?? 0) ? "text-green-500" : "text-red-400"}>
                            {p.actual.toFixed(2)}
                            {p.isCaptain && p.actualRaw !== null && (
                              <span className="text-[10px] text-muted-foreground ml-1">({p.actualRaw.toFixed(2)}×2)</span>
                            )}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="py-2 pl-2 text-right">
                        {diff !== null ? (
                          <span className={`font-mono text-xs font-bold ${diff >= 0 ? "text-green-500" : "text-red-400"}`}>
                            {diff >= 0 ? "+" : ""}{diff.toFixed(2)}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/60 bg-secondary/20">
                  <td colSpan={2} className="py-2 pr-3 font-bold text-sm text-foreground">Total</td>
                  <td className="py-2 px-2 text-right font-mono font-bold text-foreground">
                    {data.projectedTotal?.toFixed(2) ?? "—"}
                  </td>
                  <td className="py-2 px-2 text-right font-mono font-bold">
                    <span className={data.differenceSign === "above" ? "text-green-500" : "text-red-400"}>
                      {data.actualTotal?.toFixed(2) ?? "—"}
                    </span>
                  </td>
                  <td className="py-2 pl-2 text-right">
                    <DiffIndicator value={data.difference} sign={data.differenceSign} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GenericEmptyState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <BarChart2 className="w-12 h-12 text-muted-foreground/40" />
      <div>
        <p className="text-muted-foreground font-medium">Nenhum dado disponível</p>
        <p className="text-sm text-muted-foreground/60 mt-1">
          {message ?? "Aguarde a conclusão de ao menos uma rodada."}
        </p>
      </div>
    </div>
  );
}

function PlayerBacktestTab() {
  const [selectedRound, setSelectedRound] = useState<string>("all");
  const { openPaywall } = usePaywall();
  const { data: roundsData } = useQuery({ queryKey: ["history-rounds"], queryFn: fetchRounds });
  const roundParam = selectedRound === "all" ? undefined : Number(selectedRound);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["backtest", selectedRound],
    queryFn: () => fetchBacktest(roundParam),
  });
  useEffect(() => {
    if (isError && (error as { status?: number })?.status === 402) openPaywall();
  }, [isError, error, openPaywall]);

  const summary = data?.summary;
  const byPosition = summary?.byPosition ?? {};
  const byRound = summary?.byRound ?? [];
  const rounds = roundsData?.rounds ?? [];
  const hasData = (summary?.totalPlayers ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Comparação entre projeções individuais e pontuações reais. Quanto menor o erro, melhor o motor.
        </p>
        <Select value={selectedRound} onValueChange={setSelectedRound}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Todas as rodadas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as rodadas</SelectItem>
            {rounds.map((r) => (
              <SelectItem key={r} value={String(r)}>Rodada {r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse"><CardContent className="h-24 bg-muted/20 rounded-lg m-4" /></Card>
          ))}
        </div>
      )}
      {isError && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-sm text-red-400">Falha ao carregar dados de backtest.</p>
          </CardContent>
        </Card>
      )}
      {!isLoading && !isError && !hasData && <GenericEmptyState message={summary?.message ?? undefined} />}
      {!isLoading && !isError && hasData && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-1.5 mb-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">MAE Geral</p>
                  <Tooltip>
                    <TooltipTrigger><Info className="w-3 h-3 text-muted-foreground/60" /></TooltipTrigger>
                    <TooltipContent className="max-w-60">
                      Inclui todos os jogadores projetados — mesmo quem não jogou (pontos = 0). O erro desses jogadores é menor porque a projeção já foi descontada pela probabilidade de jogo, mascarando o erro real do motor.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-3xl font-bold font-mono text-foreground">{summary?.mae ?? "-"}</p>
                <p className="text-xs text-muted-foreground mt-1">pts · todos os projetados</p>
              </CardContent>
            </Card>
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="pt-5">
                <div className="flex items-center gap-1.5 mb-1">
                  <p className="text-xs text-primary font-semibold uppercase tracking-wide">MAE Quem Jogou</p>
                  <Tooltip>
                    <TooltipTrigger><Info className="w-3 h-3 text-primary/60" /></TooltipTrigger>
                    <TooltipContent className="max-w-60">
                      MAE honesto: compara projeções apenas com jogadores que efetivamente entraram em campo (pontuação &gt; 0). Este é o indicador real da acurácia do motor de pontuação.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-3xl font-bold font-mono text-primary">{summary?.maePlayedOnly ?? "-"}</p>
                <p className="text-xs text-primary/70 mt-1">pts · {summary?.playedCount ?? 0} jogadores ativos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Não Jogaram</p>
                <p className="text-3xl font-bold font-mono text-foreground">{summary?.dnpCount ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {summary && summary.totalPlayers > 0
                    ? `${((summary.dnpCount / summary.totalPlayers) * 100).toFixed(0)}% do total`
                    : "jogadores ausentes"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Rodadas Avaliadas</p>
                <p className="text-3xl font-bold font-mono text-foreground">{byRound.length}</p>
                <p className="text-xs text-muted-foreground mt-1">{summary?.totalPlayers ?? 0} pares projeção × real</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-primary" />
                  Erro por Posição
                  <Tooltip>
                    <TooltipTrigger><Info className="w-3.5 h-3.5 text-muted-foreground/60" /></TooltipTrigger>
                    <TooltipContent className="max-w-52">Posições com maior erro são mais difíceis de projetar.</TooltipContent>
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(byPosition).sort((a, b) => a[1].mae - b[1].mae).map(([pos, stats]) => (
                  <div key={pos}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] font-mono ${getPositionColor(pos)}`}>{pos}</Badge>
                        <span className="text-xs text-muted-foreground">{stats.count} jogadores</span>
                      </div>
                      <Tooltip>
                        <TooltipTrigger><span className="text-xs text-muted-foreground">{stats.overestimatedPct}% superestimados</span></TooltipTrigger>
                        <TooltipContent>Percentual de jogadores cuja projeção foi maior que o real.</TooltipContent>
                      </Tooltip>
                    </div>
                    <MaeBar mae={stats.mae} />
                  </div>
                ))}
                {Object.keys(byPosition).length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sem dados por posição</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="w-4 h-4 text-primary" />
                  Evolução por Rodada
                </CardTitle>
              </CardHeader>
              <CardContent>
                {byRound.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Sem histórico por rodada</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart
                      data={byRound.map((r) => ({ rodada: r.round, mae: parseFloat(r.mae.toFixed(2)), jogadores: r.count }))}
                      margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                      <XAxis
                        dataKey="rodada"
                        tickFormatter={(v) => `R${v}`}
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => v.toFixed(1)}
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        width={36}
                      />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as { rodada: number; mae: number; jogadores: number };
                          return (
                            <div style={{
                              backgroundColor: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: 8,
                              padding: "8px 12px",
                              fontSize: 12,
                              lineHeight: 1.6,
                            }}>
                              <p style={{ fontWeight: 600, marginBottom: 4 }}>Rodada {d.rodada}</p>
                              <p>MAE: <strong>{d.mae.toFixed(2)}</strong></p>
                              <p>Jogadores: <strong>{d.jogadores}</strong></p>
                            </div>
                          );
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="mae"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={<Dot r={3} fill="hsl(var(--primary))" strokeWidth={0} />}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-green-500">
                  <Trophy className="w-4 h-4" />
                  Melhores Previsões
                  <Tooltip>
                    <TooltipTrigger><Info className="w-3.5 h-3.5 text-muted-foreground/60" /></TooltipTrigger>
                    <TooltipContent className="max-w-52">Jogadores onde a projeção chegou mais perto da pontuação real.</TooltipContent>
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(data?.bestPredictions ?? []).map((p, i) => <PlayerRow key={`best-${p.playerId}-${p.round}`} player={p} rank={i + 1} isGood={true} />)}
                {(data?.bestPredictions ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sem dados</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-red-400">
                  <Bomb className="w-4 h-4" />
                  Maiores Erros
                  <Tooltip>
                    <TooltipTrigger><Info className="w-3.5 h-3.5 text-muted-foreground/60" /></TooltipTrigger>
                    <TooltipContent className="max-w-52">Jogadores com maior divergência entre projeção e real.</TooltipContent>
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(data?.worstPredictions ?? []).map((p, i) => <PlayerRow key={`worst-${p.playerId}-${p.round}`} player={p} rank={i + 1} isGood={false} />)}
                {(data?.worstPredictions ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sem dados</p>}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

const STRATEGY_ORDER = ["safe", "aggressive", "cost-benefit", "antimassa", "valorizacao"];
const strategyLabels: Record<string, string> = {
  safe: "Seguro",
  aggressive: "Agressivo",
  "cost-benefit": "Custo-Benefício",
  antimassa: "Antimassa",
  valorizacao: "Valorização",
};

function RoundStrategyGroup({ roundNum, lineups }: { roundNum: number; lineups: LineupBacktestRound[] }) {
  const sorted = [...lineups].sort(
    (a, b) => STRATEGY_ORDER.indexOf(a.strategyType) - STRATEGY_ORDER.indexOf(b.strategyType)
  );
  const defaultTab = sorted[0]?.strategyType ?? "safe";

  if (sorted.length === 1) {
    return (
      <div className="space-y-2">
        <h3 className="text-base font-bold text-foreground flex items-center gap-2">
          <History className="w-4 h-4 text-primary" />
          Rodada {roundNum}
          <span className="text-xs font-normal text-muted-foreground">
            {strategyLabels[sorted[0]!.strategyType] ?? sorted[0]!.strategyType} · {sorted[0]!.formation}
          </span>
        </h3>
        <LineupBacktestCard data={sorted[0]!} hideRoundTitle />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-base font-bold text-foreground flex items-center gap-2">
        <History className="w-4 h-4 text-primary" />
        Rodada {roundNum}
        <span className="text-xs font-normal text-muted-foreground">{sorted.length} estratégias</span>
      </h3>
      <Tabs defaultValue={defaultTab}>
        <TabsList className="mb-3 flex-wrap h-auto gap-1">
          {sorted.map((lu) => (
            <TabsTrigger key={lu.strategyType} value={lu.strategyType} className="text-xs">
              {strategyLabels[lu.strategyType] ?? lu.strategyType}
              {lu.hasActualData && (
                <span className={`ml-1.5 w-1.5 h-1.5 rounded-full inline-block ${lu.differenceSign === "above" ? "bg-green-500" : lu.differenceSign === "below" ? "bg-red-400" : "bg-muted-foreground"}`} />
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        {sorted.map((lu) => (
          <TabsContent key={lu.strategyType} value={lu.strategyType}>
            <LineupBacktestCard data={lu} hideRoundTitle />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function LineupBacktestTab() {
  const [selectedRound, setSelectedRound] = useState<string>("all");
  const { openPaywall } = usePaywall();
  const { data: roundsData } = useQuery({ queryKey: ["lineup-rounds"], queryFn: fetchLineupRounds });
  const roundParam = selectedRound === "all" ? undefined : Number(selectedRound);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["lineup-backtest", selectedRound],
    queryFn: () => fetchLineupBacktest(roundParam),
  });
  useEffect(() => {
    if (isError && (error as { status?: number })?.status === 402) openPaywall();
  }, [isError, error, openPaywall]);

  const lineupRounds = roundsData?.rounds ?? [];
  const backtestRounds = data?.rounds ?? [];

  // Group by round number
  const roundGroups = backtestRounds.reduce<Map<number, LineupBacktestRound[]>>((map, entry) => {
    if (!map.has(entry.round)) map.set(entry.round, []);
    map.get(entry.round)!.push(entry);
    return map;
  }, new Map());
  const sortedRoundKeys = [...roundGroups.keys()].sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Escalações sugeridas por rodada e estratégia: pontuação projetada vs. real com capitão em dobro.
        </p>
        <Select value={selectedRound} onValueChange={setSelectedRound}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Todas as rodadas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as rodadas</SelectItem>
            {lineupRounds.map((r) => (
              <SelectItem key={r} value={String(r)}>Rodada {r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse"><CardContent className="h-40 bg-muted/20 rounded-lg m-4" /></Card>
          ))}
        </div>
      )}
      {isError && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-sm text-red-400">Falha ao carregar backtest de escalação.</p>
          </CardContent>
        </Card>
      )}
      {!isLoading && !isError && sortedRoundKeys.length === 0 && (
        <GenericEmptyState message={data?.message ?? "Gere uma escalação pela página de Escalação para que o backtest seja calculado."} />
      )}
      {!isLoading && !isError && sortedRoundKeys.length > 0 && (
        <div className="space-y-8">
          {sortedRoundKeys.map((roundNum) => (
            <RoundStrategyGroup
              key={roundNum}
              roundNum={roundNum}
              lineups={roundGroups.get(roundNum)!}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Perfect Team ─────────────────────────────────────────────────────────────

interface PerfectTeamPlayer {
  playerId: number;
  name: string;
  nickname: string | null;
  position: string;
  clubId: number | null;
  clubName: string | null;
  clubBadgeUrl: string | null;
  actualPoints: number;
  ourProjection: number | null;
  ourRankInPosition: number | null;
  totalInPosition: number;
  wasInOurLineup: boolean;
}

interface PerfectTeamStats {
  hitCount: number;
  hitPct: number;
  avgDeviation: number | null;
  avgRank: number | null;
  totalActual: number;
  totalProjected: number | null;
}

interface PerfectTeamResponse {
  round: number;
  perfectTeam: PerfectTeamPlayer[];
  stats: PerfectTeamStats | null;
  message: string | null;
}

async function fetchPerfectTeam(round: number): Promise<PerfectTeamResponse> {
  const res = await fetch(`/api/history/perfect-team?round=${round}`, { credentials: "include" });
  if (!res.ok) throw Object.assign(new Error("Failed"), { status: res.status });
  return res.json() as Promise<PerfectTeamResponse>;
}

async function fetchPerfectTeamRounds(): Promise<{ rounds: number[] }> {
  const res = await fetch("/api/history/perfect-team-rounds", { credentials: "include" });
  if (!res.ok) throw new Error("Failed");
  return res.json() as Promise<{ rounds: number[] }>;
}

const POSITION_ORDER = ["GOL", "ZAG", "LAT", "MEI", "ATA", "TEC"];

function PerfectTeamTab() {
  const [selectedRound, setSelectedRound] = useState<string>("");

  const { data: roundsData } = useQuery({
    queryKey: ["perfect-team-rounds"],
    queryFn: fetchPerfectTeamRounds,
  });

  const rounds = roundsData?.rounds ?? [];

  // Default to latest round
  useEffect(() => {
    if (rounds.length > 0 && !selectedRound) {
      setSelectedRound(String(rounds[rounds.length - 1]));
    }
  }, [rounds, selectedRound]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["perfect-team", selectedRound],
    queryFn: () => fetchPerfectTeam(Number(selectedRound)),
    enabled: !!selectedRound,
  });

  const stats = data?.stats;
  const team = data?.perfectTeam ?? [];
  const grouped = POSITION_ORDER.reduce<Record<string, PerfectTeamPlayer[]>>((acc, pos) => {
    acc[pos] = team.filter((p) => p.position === pos);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Round selector */}
      <div className="flex items-center gap-3">
        <Select value={selectedRound} onValueChange={setSelectedRound}>
          <SelectTrigger className="w-44 bg-secondary border-border">
            <SelectValue placeholder="Selecione a rodada" />
          </SelectTrigger>
          <SelectContent>
            {[...rounds].reverse().map((r) => (
              <SelectItem key={r} value={String(r)}>Rodada {r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedRound && (
          <p className="text-xs text-muted-foreground">
            Time perfeito hindsight — melhores pontuadores reais por posição
          </p>
        )}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>}
      {isError && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-sm text-red-400">Falha ao carregar time perfeito.</p>
          </CardContent>
        </Card>
      )}
      {data?.message && !isLoading && (
        <p className="text-sm text-muted-foreground text-center py-8">{data.message}</p>
      )}

      {!isLoading && !isError && stats && (
        <>
          {/* Stats cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className={stats.hitPct >= 50 ? "border-primary/30 bg-primary/5" : "border-yellow-500/30 bg-yellow-500/5"}>
              <CardContent className="pt-5">
                <div className="flex items-center gap-1.5 mb-1">
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: stats.hitPct >= 50 ? "hsl(var(--primary))" : "#eab308" }}>
                    % Acerto
                  </p>
                  <Tooltip>
                    <TooltipTrigger><Info className="w-3 h-3 text-muted-foreground/60" /></TooltipTrigger>
                    <TooltipContent className="max-w-56">
                      Percentual dos jogadores do time perfeito que estavam na nossa escalação sugerida para esta rodada.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-3xl font-bold font-mono" style={{ color: stats.hitPct >= 50 ? "hsl(var(--primary))" : "#eab308" }}>
                  {stats.hitPct}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">{stats.hitCount} de {team.length} jogadores</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-1.5 mb-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Desvio Médio</p>
                  <Tooltip>
                    <TooltipTrigger><Info className="w-3 h-3 text-muted-foreground/60" /></TooltipTrigger>
                    <TooltipContent className="max-w-56">
                      Diferença absoluta média entre nossa projeção e os pontos reais dos jogadores do time perfeito.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-3xl font-bold font-mono text-foreground">
                  {stats.avgDeviation !== null ? stats.avgDeviation : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">pts por jogador</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-1.5 mb-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Rank Médio</p>
                  <Tooltip>
                    <TooltipTrigger><Info className="w-3 h-3 text-muted-foreground/60" /></TooltipTrigger>
                    <TooltipContent className="max-w-56">
                      Posição média em que rankeamos os jogadores do time perfeito nas nossas projeções por posição. Rank 1 = mais bem projetado.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-3xl font-bold font-mono text-foreground">
                  #{stats.avgRank !== null ? stats.avgRank : "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">posição média no ranking</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Pontos Totais</p>
                <p className="text-3xl font-bold font-mono text-foreground">{stats.totalActual}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.totalProjected !== null ? `projetamos ${stats.totalProjected} pts` : "sem projeção"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Perfect team grid */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-400" />
                Time Perfeito — Rodada {selectedRound}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40 text-[11px] text-muted-foreground uppercase tracking-wide">
                      <th className="text-left px-4 py-2 font-medium">Pos</th>
                      <th className="text-left px-4 py-2 font-medium">Jogador</th>
                      <th className="text-right px-4 py-2 font-medium">Pts Reais</th>
                      <th className="text-right px-4 py-2 font-medium">Nossa Proj.</th>
                      <th className="text-right px-4 py-2 font-medium">Rank</th>
                      <th className="text-center px-4 py-2 font-medium">No Nosso Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {POSITION_ORDER.flatMap((pos) =>
                      (grouped[pos] ?? []).map((p, i) => {
                        const deviation = p.ourProjection !== null ? p.ourProjection - p.actualPoints : null;
                        const deviationColor = deviation === null ? "" : Math.abs(deviation) <= 2 ? "text-green-400" : Math.abs(deviation) <= 5 ? "text-yellow-400" : "text-red-400";
                        return (
                          <tr key={`${p.playerId}-${i}`} className="border-b border-border/20 last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3">
                              <Badge variant="outline" className={`text-[10px] font-mono ${getPositionColor(p.position)}`}>
                                {p.position}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {p.clubBadgeUrl && (
                                  <img src={p.clubBadgeUrl} alt="" className="w-5 h-5 object-contain shrink-0" />
                                )}
                                <div>
                                  <p className="font-semibold text-foreground leading-tight">
                                    {p.nickname ?? p.name}
                                  </p>
                                  {p.clubName && (
                                    <p className="text-[10px] text-muted-foreground">{p.clubName}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className="font-mono font-bold text-yellow-400">{p.actualPoints}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {p.ourProjection !== null ? (
                                <div>
                                  <span className="font-mono text-foreground">{p.ourProjection}</span>
                                  {deviation !== null && (
                                    <span className={`text-[10px] ml-1 ${deviationColor}`}>
                                      ({deviation > 0 ? "+" : ""}{deviation.toFixed(1)})
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {p.ourRankInPosition !== null ? (
                                <span className={`font-mono text-sm ${p.ourRankInPosition <= 3 ? "text-green-400 font-bold" : p.ourRankInPosition <= 8 ? "text-yellow-400" : "text-muted-foreground"}`}>
                                  #{p.ourRankInPosition}
                                  <span className="text-muted-foreground font-normal text-[10px]">/{p.totalInPosition}</span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {p.wasInOurLineup ? (
                                <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto" />
                              ) : (
                                <XCircle className="w-4 h-4 text-muted-foreground/40 mx-auto" />
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Legend */}
          <p className="text-[11px] text-muted-foreground">
            <strong>Rank:</strong> posição do jogador no nosso ranking de projeções por posição nesta rodada.
            Verde = top 3, Amarelo = top 8. Desvio = nossa projeção − pontos reais.
          </p>
        </>
      )}
    </div>
  );
}

// ── Budget Optimal ────────────────────────────────────────────────────────────

interface BudgetOptimalPlayer {
  playerId: number;
  name: string;
  nickname: string | null;
  position: string;
  clubId: number | null;
  clubName: string | null;
  clubBadgeUrl: string | null;
  price: number;
  projectedPoints: number | null;
  actualPoints: number | null;
}

interface BudgetOptimalStrategy {
  strategyType: string;
  budgetLimit: number;
  totalCost: number;
  ourProjectedPoints: number;
  ourActualPoints: number;
  optimalActualPoints: number;
  pointsGap: number;
  efficiencyPct: number;
  ourPlayers: (BudgetOptimalPlayer & { wasOptimal: boolean })[];
  optimalPlayers: (BudgetOptimalPlayer & { wasInOurTeam: boolean })[];
}

interface BudgetOptimalResponse {
  round: number;
  strategies: BudgetOptimalStrategy[];
  message: string | null;
}

async function fetchBudgetOptimal(round: number): Promise<BudgetOptimalResponse> {
  const res = await fetch(`/api/history/budget-optimal?round=${round}`, { credentials: "include" });
  if (!res.ok) throw Object.assign(new Error("Failed"), { status: res.status });
  return res.json() as Promise<BudgetOptimalResponse>;
}

const STRATEGY_LABELS: Record<string, string> = {
  safe: "Segura",
  equilibrada: "Equilibrada",
  balanced: "Equilibrada",
  aggressive: "Agressiva",
  agressiva: "Agressiva",
  "cost-benefit": "Custo-Benefício",
  frontier: "Fronteira",
};

function StrategyCompareCard({ s }: { s: BudgetOptimalStrategy }) {
  const [open, setOpen] = useState(false);
  const label = STRATEGY_LABELS[s.strategyType] ?? s.strategyType;
  const effColor = s.efficiencyPct >= 80 ? "text-green-400" : s.efficiencyPct >= 60 ? "text-yellow-400" : "text-red-400";
  const matchCount = s.ourPlayers.filter((p) => p.wasOptimal).length;

  const ourByPos = POSITION_ORDER.reduce<Record<string, (BudgetOptimalPlayer & { wasOptimal: boolean })[]>>((acc, pos) => {
    acc[pos] = s.ourPlayers.filter((p) => p.position === pos);
    return acc;
  }, {});
  const optByPos = POSITION_ORDER.reduce<Record<string, (BudgetOptimalPlayer & { wasInOurTeam: boolean })[]>>((acc, pos) => {
    acc[pos] = s.optimalPlayers.filter((p) => p.position === pos);
    return acc;
  }, {});

  return (
    <Card className="overflow-hidden">
      <CardHeader
        className="pb-3 cursor-pointer select-none hover:bg-muted/20 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Estratégia: {label}
          </CardTitle>
          <Badge variant="outline" className="text-xs font-mono">
            C$ {s.budgetLimit.toFixed(1)}
          </Badge>
        </div>
        {/* Summary row */}
        <div className="grid grid-cols-4 gap-3 mt-3">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Nossos Pts</p>
            <p className="text-xl font-bold font-mono text-foreground">{s.ourActualPoints}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Melhor Possível</p>
            <p className="text-xl font-bold font-mono text-yellow-400">{s.optimalActualPoints}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Gap</p>
            <p className={`text-xl font-bold font-mono ${s.pointsGap > 0 ? "text-red-400" : "text-green-400"}`}>
              {s.pointsGap > 0 ? "-" : "+"}{Math.abs(s.pointsGap)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Eficiência</p>
            <p className={`text-xl font-bold font-mono ${effColor}`}>{s.efficiencyPct}%</p>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          {matchCount} de {s.ourPlayers.length} jogadores coincidem com o ótimo •{" "}
          <span className="text-muted-foreground/70">clique para ver detalhe</span>
        </p>
      </CardHeader>

      {open && (
        <CardContent className="p-0 border-t border-border/40">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 text-[11px] text-muted-foreground uppercase tracking-wide bg-muted/10">
                  <th className="text-left px-3 py-2 font-medium w-14">Pos</th>
                  <th className="text-left px-3 py-2 font-medium">Nosso Time</th>
                  <th className="text-right px-3 py-2 font-medium">Pts</th>
                  <th className="text-left px-3 py-2 font-medium pl-5 border-l border-border/30">Melhor Possível</th>
                  <th className="text-right px-3 py-2 font-medium">Pts</th>
                </tr>
              </thead>
              <tbody>
                {POSITION_ORDER.flatMap((pos) => {
                  const ourGroup = ourByPos[pos] ?? [];
                  const optGroup = optByPos[pos] ?? [];
                  const maxLen = Math.max(ourGroup.length, optGroup.length);
                  return Array.from({ length: maxLen }, (_, i) => {
                    const ours = ourGroup[i];
                    const opt = optGroup[i];
                    const same = ours && opt && ours.playerId === opt.playerId;
                    return (
                      <tr key={`${pos}-${i}`} className="border-b border-border/20 last:border-0 hover:bg-muted/10 transition-colors">
                        <td className="px-3 py-2.5">
                          {i === 0 && (
                            <Badge variant="outline" className={`text-[10px] font-mono ${getPositionColor(pos)}`}>
                              {pos}
                            </Badge>
                          )}
                        </td>
                        {/* Our player */}
                        <td className="px-3 py-2.5">
                          {ours ? (
                            <div className="flex items-center gap-1.5">
                              {ours.clubBadgeUrl && <img src={ours.clubBadgeUrl} alt="" className="w-4 h-4 object-contain shrink-0" />}
                              <span className={`font-medium leading-tight ${same ? "text-muted-foreground" : ""}`}>
                                {ours.nickname ?? ours.name}
                              </span>
                              {ours.wasOptimal && <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />}
                            </div>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {ours && (
                            <span className={`font-mono text-sm ${(ours.actualPoints ?? 0) === 0 ? "text-muted-foreground" : "text-foreground"}`}>
                              {ours.actualPoints ?? "—"}
                            </span>
                          )}
                        </td>
                        {/* Optimal player */}
                        <td className="px-3 py-2.5 pl-5 border-l border-border/30">
                          {opt && !same ? (
                            <div className="flex items-center gap-1.5">
                              {opt.clubBadgeUrl && <img src={opt.clubBadgeUrl} alt="" className="w-4 h-4 object-contain shrink-0" />}
                              <span className="font-medium text-yellow-300 leading-tight">{opt.nickname ?? opt.name}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">C${opt.price.toFixed(1)}</span>
                            </div>
                          ) : opt && same ? (
                            <span className="text-[11px] text-green-400">✓ mesmo jogador</span>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {opt && !same && (
                            <span className="font-mono text-sm text-yellow-400">{opt.actualPoints ?? "—"}</span>
                          )}
                        </td>
                      </tr>
                    );
                  });
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/40 bg-muted/10">
                  <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-right text-muted-foreground">Total</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-foreground">{s.ourActualPoints}</td>
                  <td className="px-3 py-2 pl-5 border-l border-border/30 text-xs text-muted-foreground">ótimo no orçamento</td>
                  <td className="px-3 py-2 text-right font-mono font-bold text-yellow-400">{s.optimalActualPoints}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border/20">
            Preço atual dos jogadores como aproximação do preço na rodada •
            ✓ = coincide com o ótimo
          </p>
        </CardContent>
      )}
    </Card>
  );
}

function BudgetOptimalTab() {
  const [selectedRound, setSelectedRound] = useState<string>("");

  const { data: roundsData } = useQuery({
    queryKey: ["lineup-rounds"],
    queryFn: fetchLineupRounds,
  });

  const rounds = roundsData?.rounds ?? [];

  useEffect(() => {
    if (rounds.length > 0 && !selectedRound) {
      setSelectedRound(String(rounds[rounds.length - 1]));
    }
  }, [rounds, selectedRound]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["budget-optimal", selectedRound],
    queryFn: () => fetchBudgetOptimal(Number(selectedRound)),
    enabled: !!selectedRound,
  });

  return (
    <div className="space-y-5">
      {/* Round selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedRound} onValueChange={setSelectedRound}>
          <SelectTrigger className="w-44 bg-secondary border-border">
            <SelectValue placeholder="Selecione a rodada" />
          </SelectTrigger>
          <SelectContent>
            {[...rounds].reverse().map((r) => (
              <SelectItem key={r} value={String(r)}>Rodada {r}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Melhor time possível com o mesmo orçamento de cada estratégia salva
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>}
      {isError && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-sm text-red-400">Falha ao carregar comparativo.</p>
          </CardContent>
        </Card>
      )}
      {data?.message && !isLoading && (
        <p className="text-sm text-muted-foreground text-center py-8">{data.message}</p>
      )}

      {!isLoading && !isError && data && data.strategies.length > 0 && (
        <div className="space-y-4">
          {data.strategies.map((s) => (
            <StrategyCompareCard key={s.strategyType} s={s} />
          ))}
          <p className="text-[11px] text-muted-foreground">
            <strong>Eficiência</strong> = nossos pts reais ÷ melhor possível no orçamento × 100.
            Preços usados são aproximações do momento atual — podem diferir em ±5% do valor real na rodada.
          </p>
        </div>
      )}
    </div>
  );
}

export default function Historico() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <History className="w-6 h-6 text-primary" />
          Histórico & Backtest
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Analise o desempenho das projeções e das escalações rodada a rodada.
        </p>
      </div>

      <ProGate>
        <Tabs defaultValue="time-perfeito">
          <TabsList className="mb-2 flex-wrap h-auto gap-1">
            <TabsTrigger value="time-perfeito" className="flex items-center gap-2">
              <Star className="w-4 h-4" />
              Time Perfeito
            </TabsTrigger>
            <TabsTrigger value="melhor-orcamento" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Melhor no Orçamento
            </TabsTrigger>
            <TabsTrigger value="escalacao" className="flex items-center gap-2">
              <Crown className="w-4 h-4" />
              Backtest de Escalação
            </TabsTrigger>
            <TabsTrigger value="jogadores" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Backtest por Jogador
            </TabsTrigger>
          </TabsList>
          <TabsContent value="time-perfeito">
            <PerfectTeamTab />
          </TabsContent>
          <TabsContent value="melhor-orcamento">
            <BudgetOptimalTab />
          </TabsContent>
          <TabsContent value="escalacao">
            <LineupBacktestTab />
          </TabsContent>
          <TabsContent value="jogadores">
            <PlayerBacktestTab />
          </TabsContent>
        </Tabs>
      </ProGate>
    </div>
  );
}
