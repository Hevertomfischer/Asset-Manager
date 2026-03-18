import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { History, AlertCircle, Trophy, Bomb, Info, BarChart2, Users, Crown, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { getPositionColor } from "@/hooks/use-custom-api";

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
  actualTotal: number | null;
  difference: number | null;
  differenceSign: "above" | "below" | null;
  hasActualData: boolean;
  players: LineupBacktestPlayer[];
}

interface LineupBacktestResponse {
  rounds: LineupBacktestRound[];
  message: string | null;
}

async function fetchBacktest(round?: number): Promise<BacktestResponse> {
  const params = round ? `?round=${round}&limit=10` : "?limit=10";
  const res = await fetch(`/api/history/backtest${params}`);
  if (!res.ok) throw new Error("Failed to fetch backtest");
  return res.json() as Promise<BacktestResponse>;
}

async function fetchLineupBacktest(round?: number): Promise<LineupBacktestResponse> {
  const params = round ? `?round=${round}` : "";
  const res = await fetch(`/api/history/lineup-backtest${params}`);
  if (!res.ok) throw new Error("Failed to fetch lineup backtest");
  return res.json() as Promise<LineupBacktestResponse>;
}

async function fetchRounds(): Promise<{ rounds: number[] }> {
  const res = await fetch("/api/history/rounds");
  if (!res.ok) throw new Error("Failed to fetch rounds");
  return res.json() as Promise<{ rounds: number[] }>;
}

async function fetchLineupRounds(): Promise<{ rounds: number[] }> {
  const res = await fetch("/api/history/lineup-rounds");
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

function LineupBacktestCard({ data }: { data: LineupBacktestRound }) {
  const strategyLabels: Record<string, string> = {
    safe: "Seguro",
    aggressive: "Agressivo",
    "cost-benefit": "Custo-Benefício",
    antimassa: "Antimassa",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              Rodada {data.round}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {strategyLabels[data.strategyType] ?? data.strategyType} · {data.formation} · C$ {data.totalCost?.toFixed(2) ?? "—"}
            </p>
          </div>
          <div className="flex gap-4 text-right">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Projetado</p>
              <p className="text-2xl font-bold font-mono text-foreground">{data.projectedTotal?.toFixed(2) ?? "—"}</p>
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
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Dif. Abs.</p>
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
  const { data: roundsData } = useQuery({ queryKey: ["history-rounds"], queryFn: fetchRounds });
  const roundParam = selectedRound === "all" ? undefined : Number(selectedRound);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["backtest", selectedRound],
    queryFn: () => fetchBacktest(roundParam),
  });

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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm text-muted-foreground font-medium">Erro Médio Absoluto</p>
                  <Tooltip>
                    <TooltipTrigger><Info className="w-3.5 h-3.5 text-muted-foreground/60" /></TooltipTrigger>
                    <TooltipContent className="max-w-52">MAE: média da diferença absoluta entre projeção e real. Quanto menor, melhor.</TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-3xl font-bold font-mono text-foreground">{summary?.mae ?? "-"}</p>
                <p className="text-xs text-muted-foreground mt-1">pts por jogador</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground font-medium mb-1">Jogadores Analisados</p>
                <p className="text-3xl font-bold font-mono text-foreground">{summary?.totalPlayers ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">pares projeção × real</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground font-medium mb-1">Rodadas com Dados</p>
                <p className="text-3xl font-bold font-mono text-foreground">{byRound.length}</p>
                <p className="text-xs text-muted-foreground mt-1">rodadas avaliadas</p>
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
              <CardContent className="space-y-3">
                {byRound.map((r) => (
                  <div key={r.round}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">Rodada {r.round}</span>
                      <span className="text-xs text-muted-foreground">{r.count} jogadores</span>
                    </div>
                    <MaeBar mae={r.mae} />
                  </div>
                ))}
                {byRound.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sem histórico por rodada</p>}
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

function LineupBacktestTab() {
  const [selectedRound, setSelectedRound] = useState<string>("all");
  const { data: roundsData } = useQuery({ queryKey: ["lineup-rounds"], queryFn: fetchLineupRounds });
  const roundParam = selectedRound === "all" ? undefined : Number(selectedRound);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["lineup-backtest", selectedRound],
    queryFn: () => fetchLineupBacktest(roundParam),
  });

  const lineupRounds = roundsData?.rounds ?? [];
  const backtestRounds = data?.rounds ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Melhor escalação sugerida por rodada: pontuação projetada vs. real com capitão em dobro.
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
      {!isLoading && !isError && backtestRounds.length === 0 && (
        <GenericEmptyState message={data?.message ?? "Gere uma escalação pela página de Escalação para que o backtest seja calculado."} />
      )}
      {!isLoading && !isError && backtestRounds.length > 0 && (
        <div className="space-y-4">
          {backtestRounds.map((round) => (
            <LineupBacktestCard key={round.round} data={round} />
          ))}
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

      <Tabs defaultValue="escalacao">
        <TabsList className="mb-2">
          <TabsTrigger value="escalacao" className="flex items-center gap-2">
            <Crown className="w-4 h-4" />
            Backtest de Escalação
          </TabsTrigger>
          <TabsTrigger value="jogadores" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Backtest por Jogador
          </TabsTrigger>
        </TabsList>
        <TabsContent value="escalacao">
          <LineupBacktestTab />
        </TabsContent>
        <TabsContent value="jogadores">
          <PlayerBacktestTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
