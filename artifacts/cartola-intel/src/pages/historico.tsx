import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { History, TrendingUp, TrendingDown, AlertCircle, Trophy, Bomb, Info, BarChart2 } from "lucide-react";
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

async function fetchBacktest(round?: number): Promise<BacktestResponse> {
  const params = round ? `?round=${round}&limit=10` : "?limit=10";
  const res = await fetch(`/api/history/backtest${params}`);
  if (!res.ok) throw new Error("Failed to fetch backtest");
  return res.json() as Promise<BacktestResponse>;
}

async function fetchRounds(): Promise<{ rounds: number[] }> {
  const res = await fetch("/api/history/rounds");
  if (!res.ok) throw new Error("Failed to fetch rounds");
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <BarChart2 className="w-12 h-12 text-muted-foreground/40" />
      <div>
        <p className="text-muted-foreground font-medium">Nenhum dado de histórico disponível</p>
        <p className="text-sm text-muted-foreground/60 mt-1">
          Aguarde a conclusão de ao menos uma rodada para que o backtest seja calculado.
        </p>
        <p className="text-sm text-muted-foreground/60 mt-1">
          Sincronize os dados pelo Admin e aguarde a rodada encerrar.
        </p>
      </div>
    </div>
  );
}

export default function Historico() {
  const [selectedRound, setSelectedRound] = useState<string>("all");

  const { data: roundsData } = useQuery({
    queryKey: ["history-rounds"],
    queryFn: fetchRounds,
  });

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
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <History className="w-6 h-6 text-primary" />
            Histórico & Backtest
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Comparação entre projeções e pontuações reais. Quanto menor o erro, melhor o motor de projeção.
          </p>
        </div>
        <Select value={selectedRound} onValueChange={setSelectedRound}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Todas as rodadas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as rodadas</SelectItem>
            {rounds.map((r) => (
              <SelectItem key={r} value={String(r)}>
                Rodada {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-24 bg-muted/20 rounded-lg m-4" />
            </Card>
          ))}
        </div>
      )}

      {isError && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-sm text-red-400">Falha ao carregar dados de backtest. Verifique se o servidor está rodando.</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && !hasData && summary?.message && (
        <EmptyState />
      )}

      {!isLoading && !isError && hasData && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm text-muted-foreground font-medium">Erro Médio Absoluto</p>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3.5 h-3.5 text-muted-foreground/60" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-52">
                      MAE (Mean Absolute Error): média da diferença absoluta entre projeção e pontuação real. Quanto menor, melhor.
                    </TooltipContent>
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
                    <TooltipTrigger>
                      <Info className="w-3.5 h-3.5 text-muted-foreground/60" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-52">
                      MAE médio para cada posição. Posições com maior erro são mais difíceis de projetar.
                    </TooltipContent>
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
                        <TooltipTrigger>
                          <span className="text-xs text-muted-foreground">{stats.overestimatedPct}% superestimados</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          Percentual de jogadores cuja projeção foi maior que o real.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <MaeBar mae={stats.mae} />
                  </div>
                ))}
                {Object.keys(byPosition).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Sem dados por posição</p>
                )}
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
                {byRound.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Sem histórico por rodada</p>
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
                    <TooltipTrigger>
                      <Info className="w-3.5 h-3.5 text-muted-foreground/60" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-52">
                      Jogadores onde a projeção chegou mais perto da pontuação real.
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(data?.bestPredictions ?? []).map((p, i) => (
                  <PlayerRow key={`best-${p.playerId}-${p.round}`} player={p} rank={i + 1} isGood={true} />
                ))}
                {(data?.bestPredictions ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Sem dados</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 text-red-400">
                  <Bomb className="w-4 h-4" />
                  Maiores Erros
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3.5 h-3.5 text-muted-foreground/60" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-52">
                      Jogadores com maior divergência entre projeção e real. Útil para ajustar pesos.
                    </TooltipContent>
                  </Tooltip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(data?.worstPredictions ?? []).map((p, i) => (
                  <PlayerRow key={`worst-${p.playerId}-${p.round}`} player={p} rank={i + 1} isGood={false} />
                ))}
                {(data?.worstPredictions ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Sem dados</p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
