import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTrack } from "@/hooks/useTrack";
import {
  useGetPlayers,
  type LineupPlayer,
  type LineupSuggestion,
  type Player,
} from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Search,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  ArrowLeftRight,
  ChevronLeft,
} from "lucide-react";
import { getPositionColor } from "@/hooks/use-custom-api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineupMetrics {
  expectedPoints: number;
  totalRisk: number;
  costUsed: number;
  differential: number;
}

interface SimulateResult {
  before: LineupMetrics;
  after: LineupMetrics;
  delta: { expectedPoints: number; totalRisk: number; cost: number };
  valid: boolean;
  reason: string | null;
}

export interface SwapSimulatorProps {
  isOpen: boolean;
  onClose: () => void;
  outPlayer: LineupPlayer;
  lineup: LineupSuggestion;
  budget: number;
  onApply: (outId: number, inPlayer: Player, after: LineupMetrics) => void;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DeltaCell({
  value,
  lowerIsBetter = false,
  format,
}: {
  value: number;
  lowerIsBetter?: boolean;
  format?: (n: number) => string;
}) {
  if (Math.abs(value) < 0.005)
    return <span className="text-muted-foreground text-xs">—</span>;

  const isGood = lowerIsBetter ? value < 0 : value > 0;
  const sign = value > 0 ? "+" : "";
  const color = isGood ? "text-green-500" : "text-red-500";
  const Icon = value > 0 ? TrendingUp : TrendingDown;
  const label = format ? format(value) : `${sign}${value.toFixed(2)}`;

  return (
    <span className={`inline-flex items-center gap-0.5 font-bold text-xs ${color}`}>
      <Icon className="w-3 h-3 shrink-0" />
      {label}
    </span>
  );
}

function MetricRow({
  label,
  before,
  after,
  delta,
  fmt,
  lowerIsBetter,
}: {
  label: string;
  before: number;
  after: number;
  delta: number;
  fmt: (n: number) => string;
  lowerIsBetter?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 py-2.5 border-b border-border/20 last:border-0">
      <span className="text-xs text-muted-foreground w-32 shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 text-xs font-mono flex-1 min-w-0">
        <span className="text-muted-foreground shrink-0">{fmt(before)}</span>
        <ArrowRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />
        <span className="font-bold text-foreground shrink-0">{fmt(after)}</span>
      </div>
      <DeltaCell value={delta} lowerIsBetter={lowerIsBetter} format={(v) => {
        const s = v > 0 ? "+" : "";
        return `${s}${fmt(v).replace(/^-/, "\u2212")}`;
      }} />
    </div>
  );
}

function CandidateRow({
  player,
  isLoading,
  onClick,
}: {
  player: Player;
  isLoading: boolean;
  onClick: () => void;
}) {
  const prob = player.availability?.playProbability ?? null;
  const isLowProb = prob !== null && prob < 0.5;
  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-border/40 bg-card hover:bg-secondary/40 hover:border-primary/40 transition-all text-left group disabled:opacity-50"
    >
      <Avatar className="w-8 h-8 border border-border shrink-0">
        <AvatarImage src={player.club?.badgeUrl ?? undefined} />
        <AvatarFallback className="bg-secondary text-[10px]">
          {player.club?.abbreviation?.slice(0, 2) ?? "??"}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
            {player.nickname ?? player.name ?? "Desconhecido"}
          </p>
          {isLowProb && (
            <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0" />
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {player.club?.name ?? ""}{" "}
          {prob !== null && `· ${(prob * 100).toFixed(0)}% jogo`}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-primary font-mono">
          {(player.projection?.expectedPoints ?? 0).toFixed(1)} pts
        </p>
        <p className="text-[10px] text-muted-foreground font-mono">
          C$ {(player.price ?? 0).toFixed(2)}
        </p>
      </div>
      {isLoading && <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SwapSimulator({
  isOpen,
  onClose,
  outPlayer,
  lineup,
  budget,
  onApply,
}: SwapSimulatorProps) {
  const [search, setSearch] = useState("");
  const [phase, setPhase] = useState<"select" | "result">("select");
  const [selectedCandidate, setSelectedCandidate] = useState<Player | null>(null);
  const [simulateResult, setSimulateResult] = useState<SimulateResult | null>(null);
  const [simulatingId, setSimulatingId] = useState<number | null>(null);
  const track = useTrack();

  // Fetch eligible players of the same position
  const { data: playersData, isLoading: isFetchingPlayers } = useGetPlayers(
    outPlayer.position ? { position: outPlayer.position, probableOnly: "false" } : undefined
  );

  // Players already in lineup (to exclude from candidates)
  const lineupIdSet = useMemo(
    () => new Set((lineup.players ?? []).map((p) => p.playerId)),
    [lineup.players]
  );

  const candidates = useMemo(() => {
    const all = playersData?.players ?? [];
    const lower = search.toLowerCase();
    return all
      .filter(
        (p) =>
          p.id !== outPlayer.playerId &&
          !lineupIdSet.has(p.id) &&
          (!lower ||
            p.name?.toLowerCase().includes(lower) ||
            p.nickname?.toLowerCase().includes(lower) ||
            p.club?.name?.toLowerCase().includes(lower))
      )
      .sort(
        (a, b) =>
          (b.projection?.expectedPoints ?? 0) - (a.projection?.expectedPoints ?? 0)
      );
  }, [playersData, search, lineupIdSet, outPlayer.playerId]);

  const simulateMutation = useMutation<SimulateResult, Error, Player>({
    mutationFn: async (candidate) => {
      const lineupIds = (lineup.players ?? [])
        .map((p) => p.playerId)
        .filter((id): id is number => id != null);
      const body = {
        lineup: lineupIds,
        captainId: lineup.captainPlayerId ?? null,
        swap: { outId: outPlayer.playerId!, inId: candidate.id! },
        budget,
        round: lineup.round,
      };
      const res = await fetch("/api/lineup/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      return data as SimulateResult;
    },
    onSuccess: (result, candidate) => {
      setSelectedCandidate(candidate);
      setSimulateResult(result);
      setSimulatingId(null);
      setPhase("result");
      track("simulation_used", {
        valid: result.valid,
        outPlayerId: outPlayer.playerId ?? undefined,
        inPlayerId: candidate.id ?? undefined,
      });
    },
    onError: () => {
      setSimulatingId(null);
    },
  });

  const handleSelectCandidate = (candidate: Player) => {
    setSimulatingId(candidate.id ?? null);
    simulateMutation.mutate(candidate);
  };

  const handleApply = () => {
    if (!selectedCandidate || !simulateResult) return;
    onApply(outPlayer.playerId!, selectedCandidate, simulateResult.after);
    handleClose();
  };

  const handleBack = () => {
    setPhase("select");
    setSelectedCandidate(null);
    setSimulateResult(null);
    setSimulatingId(null);
    simulateMutation.reset();
  };

  const handleClose = () => {
    setSearch("");
    setPhase("select");
    setSelectedCandidate(null);
    setSimulateResult(null);
    setSimulatingId(null);
    simulateMutation.reset();
    onClose();
  };

  const posColor = getPositionColor(outPlayer.position ?? "");

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-sm flex flex-col p-0 overflow-hidden"
      >
        {/* ── Header ───────────────────────────────────────────── */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/40 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <ArrowLeftRight className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-sm leading-tight">
                Simular troca
              </SheetTitle>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge
                  variant="outline"
                  className={`text-[10px] font-mono ${posColor}`}
                >
                  {outPlayer.position}
                </Badge>
                <span className="text-xs text-muted-foreground truncate">
                  {outPlayer.nickname ?? outPlayer.name}
                </span>
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* ── Phase: SELECT ─────────────────────────────────────── */}
        {phase === "select" && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Search */}
            <div className="px-4 py-3 border-b border-border/30 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar substituto..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9 text-sm bg-background border-border"
                />
              </div>
            </div>

            {/* Candidate list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {isFetchingPlayers ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <p className="text-xs">Carregando jogadores...</p>
                </div>
              ) : candidates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-1 text-muted-foreground">
                  <p className="text-sm font-medium">Nenhum candidato encontrado</p>
                  <p className="text-xs">Tente outro termo de busca</p>
                </div>
              ) : (
                <>
                  {simulateMutation.isError && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs mb-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      {simulateMutation.error?.message ?? "Erro ao simular"}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                    {candidates.length} disponíveis · clique para simular
                  </p>
                  {candidates.map((c) => (
                    <CandidateRow
                      key={c.id}
                      player={c}
                      isLoading={simulatingId === c.id && simulateMutation.isPending}
                      onClick={() => handleSelectCandidate(c)}
                    />
                  ))}
                </>
              )}
            </div>

            {/* Cancel */}
            <div className="px-4 pb-5 pt-3 border-t border-border/30 shrink-0">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleClose}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {/* ── Phase: RESULT ─────────────────────────────────────── */}
        {phase === "result" && simulateResult && selectedCandidate && (
          <div className="flex flex-col flex-1 overflow-y-auto">
            <div className="px-5 py-4 flex-1 space-y-5">
              {/* Swap summary */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/30 border border-border/40">
                <div className="flex-1 min-w-0 text-center">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Saindo</p>
                  <p className="text-sm font-bold text-foreground truncate">
                    {outPlayer.nickname ?? outPlayer.name}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground">
                    C$ {(outPlayer.price ?? 0).toFixed(2)}
                  </p>
                </div>
                <ArrowRight className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0 text-center">
                  <p className="text-[10px] text-muted-foreground mb-0.5">Entrando</p>
                  <p className="text-sm font-bold text-primary truncate">
                    {selectedCandidate.nickname ?? selectedCandidate.name}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground">
                    C$ {(selectedCandidate.price ?? 0).toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Invalid swap message */}
              {!simulateResult.valid && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/30">
                  <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-destructive">
                      Troca inválida
                    </p>
                    <p className="text-xs text-destructive/80 mt-0.5 leading-relaxed">
                      {simulateResult.reason ?? "Troca não permitida pelas regras da escalação."}
                    </p>
                  </div>
                </div>
              )}

              {/* Before vs After panel */}
              {simulateResult.valid && (
                <>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                        Antes × Depois
                      </p>
                    </div>
                    <div className="bg-secondary/30 rounded-xl border border-border/40 px-4 py-1">
                      <MetricRow
                        label="Pts Esperados"
                        before={simulateResult.before.expectedPoints}
                        after={simulateResult.after.expectedPoints}
                        delta={simulateResult.delta.expectedPoints}
                        fmt={(n) => `${n.toFixed(1)} pts`}
                      />
                      <MetricRow
                        label="Risco médio"
                        before={simulateResult.before.totalRisk}
                        after={simulateResult.after.totalRisk}
                        delta={simulateResult.delta.totalRisk}
                        fmt={(n) => n.toFixed(3)}
                        lowerIsBetter
                      />
                      <MetricRow
                        label="Cartoletas"
                        before={simulateResult.before.costUsed}
                        after={simulateResult.after.costUsed}
                        delta={simulateResult.delta.cost}
                        fmt={(n) => `C$${n.toFixed(2)}`}
                        lowerIsBetter
                      />
                      <MetricRow
                        label="Diferenciais"
                        before={simulateResult.before.differential}
                        after={simulateResult.after.differential}
                        delta={
                          simulateResult.after.differential -
                          simulateResult.before.differential
                        }
                        fmt={(n) => String(Math.round(n))}
                      />
                    </div>
                  </div>

                  {/* Budget remaining info */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                    <span>Orçamento disponível</span>
                    <span className="font-mono font-bold text-foreground">
                      C$ {(budget - simulateResult.after.costUsed).toFixed(2)} restante
                    </span>
                  </div>
                </>
              )}
            </div>

            <Separator className="opacity-30" />

            {/* Action buttons */}
            <div className="px-5 py-4 space-y-2 shrink-0">
              {simulateResult.valid && (
                <Button
                  className="w-full bg-gradient-to-r from-primary to-accent font-semibold"
                  onClick={handleApply}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Aplicar troca
                </Button>
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={handleBack}
              >
                <ChevronLeft className="w-4 h-4 mr-1.5" />
                {simulateResult.valid ? "Escolher outro" : "Voltar"}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
