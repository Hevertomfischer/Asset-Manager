import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useGenerateLineup,
  useGetCurrentRound,
  useSaveLineup,
  type LineupGenerateRequestStrategy,
  type LineupSuggestion,
  type LineupPlayer,
  type LineupReservePlayer,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Shield, Zap, Scale, Calculator, Loader2, Save, Crown, Star, Shuffle, TrendingUp, Users, ArrowLeftRight, ClipboardList, LayoutDashboard, List, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getPositionColor } from "@/hooks/use-custom-api";
import { ProGate } from "@/components/ProGate";
import { ProBadge } from "@/components/ProBadge";
import { usePaywall } from "@/context/PaywallContext";
import { useAuth } from "@/hooks/useAuth";
import { useTrack } from "@/hooks/useTrack";
import { type ExplanationJson, type InsightKind, getTopBadges, explainPlayer, normalizeMatchup } from "@/lib/explainPlayer";
import { PlayerExplanationSheet } from "@/components/PlayerExplanationSheet";
import { SwapSimulator } from "@/components/SwapSimulator";
import { LineupProbabilities } from "@/components/LineupProbabilities";
import { RegisterRoundDialog } from "@/components/RegisterRoundDialog";
import type { Player } from "@workspace/api-client-react";
import { PlayerCard, PlayerBadges } from "@/components/PlayerCard";
import { FieldView } from "@/components/FieldView";
import { ExportLineupSheet } from "@/components/lineup/ExportLineupSheet";
import { ReplacementSuggestions } from "@/components/ReplacementSuggestions";
import { PageSkeleton } from "@/components/states/PageSkeleton";
import { ErrorState } from "@/components/states/ErrorState";
import { EmptyState } from "@/components/states/EmptyState";

function LineupPlayerCard({
  player,
  captainId,
  coachId,
  onSwapRequest,
  strategy,
}: {
  player: LineupPlayer;
  captainId?: number | null;
  coachId?: number | null;
  onSwapRequest?: () => void;
  strategy?: string;
}) {
  const isCaptain = player.playerId === captainId;
  const isCoach = player.position === "TEC" || player.playerId === coachId;
  const exp = (player.explanation ?? {}) as ExplanationJson;
  const topBadges = isCoach ? [] : getTopBadges(exp, { isCaptain });

  return (
    <div
      className={`p-4 rounded-xl border motion-safe:transition-all ${
        isCaptain
          ? "border-attention/50 bg-attention/5 shadow-[0_0_15px_hsl(var(--attention)/0.1)]"
          : isCoach
            ? "border-primary/40 bg-primary/5"
            : "border-border/50 bg-card"
      }`}
    >
      <PlayerCard
        variant="lineup"
        player={{
          name: player.name ?? "Desconhecido",
          nickname: player.nickname,
          position: player.position,
          club: { abbreviation: player.clubAbbr ?? player.clubName ?? undefined },
          price: player.price,
          expectedPoints: player.expectedPoints,
        }}
        isCaptain={isCaptain}
        isCoach={isCoach}
      />

      {isCaptain && (
        <div className="mt-1 mb-2 px-2 py-1 rounded-md bg-attention/20 text-attention text-xs font-bold text-center">
          Capitão
        </div>
      )}
      {isCoach && !isCaptain && (
        <div className="mt-1 mb-2 px-2 py-1 rounded-md bg-primary/20 text-primary text-xs font-bold text-center">
          Técnico
        </div>
      )}

      {!isCoach && (
        <div className="mt-2 pt-2 border-t border-border/30 space-y-1.5">
          {/* Valorização margin row — shown only in valorizacao strategy */}
          {strategy === "valorizacao" && player.valorizacaoMargin != null && (
            <div className="flex items-center gap-1">
              {player.valorizacaoMargin >= 0 ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-positive/15 text-positive text-xs font-semibold">
                  <TrendingUp className="w-3 h-3" />
                  folga +{player.valorizacaoMargin.toFixed(1)} pts
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-danger/10 text-danger text-xs font-semibold">
                  falta {Math.abs(player.valorizacaoMargin).toFixed(1)} pts
                </span>
              )}
              {player.minimoParaValorizar != null && (
                <span className="text-xs text-muted-foreground tabular-nums">MPV {player.minimoParaValorizar.toFixed(1)}</span>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-1 flex-wrap">
            <PlayerBadges badges={topBadges} />
            <div className="flex items-center gap-1">
              {onSwapRequest && (
                <button
                  onClick={onSwapRequest}
                  title="Simular troca"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-muted-foreground hover:text-primary hover:bg-primary/10 border border-transparent hover:border-primary/20 motion-safe:transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ArrowLeftRight className="w-3 h-3" />
                  Trocar
                </button>
              )}
              <PlayerExplanationSheet
                exp={exp}
                playerName={player.nickname ?? player.name ?? ""}
                position={player.position ?? undefined}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReserveCard({ reserve }: { reserve: LineupReservePlayer }) {
  return (
    <div
      className={`p-3 rounded-xl border motion-safe:transition-all ${
        reserve.isLuxuryReserve
          ? "border-purple-500/50 bg-purple-500/5"
          : "border-border/40 bg-card/60"
      }`}
    >
      <PlayerCard
        variant="compact"
        player={{
          name: reserve.name ?? "Desconhecido",
          nickname: reserve.nickname,
          position: reserve.position,
          club: {
            abbreviation: reserve.clubAbbr ?? reserve.clubName ?? undefined,
          },
          expectedPoints: reserve.expectedPoints,
        }}
      >
        {reserve.isLuxuryReserve && (
          <span className="text-xs font-bold text-purple-400 shrink-0">Luxo</span>
        )}
      </PlayerCard>
      <div className="flex items-center justify-between text-xs mt-1.5 tabular-nums">
        <span className="text-muted-foreground">C$ {(reserve.price ?? 0).toFixed(2)}</span>
      </div>
    </div>
  );
}

const VALID_STRATEGIES = ["safe", "aggressive", "cost-benefit", "antimassa", "valorizacao"] as const;
type ValidStrategy = (typeof VALID_STRATEGIES)[number];
const PRO_STRATEGIES = new Set<ValidStrategy>(["aggressive", "cost-benefit", "antimassa", "valorizacao"]);
const STRATEGY_NAMES: Record<ValidStrategy, string> = {
  safe: "Seguro",
  aggressive: "Agressivo",
  "cost-benefit": "Custo-Benefício",
  antimassa: "Antimassa",
  valorizacao: "Valorização",
};

function parseStrategy(value: string | null): ValidStrategy | null {
  return value && (VALID_STRATEGIES as readonly string[]).includes(value)
    ? value as ValidStrategy
    : null;
}

export default function Lineup() {
  const [searchParams] = useSearchParams();

  const urlStrategy = parseStrategy(searchParams.get("strategy"));
  const requestedParam = parseStrategy(searchParams.get("requested"));
  const initialStrategy: ValidStrategy =
    urlStrategy ?? "cost-benefit";

  const [formation, setFormation] = useState("4-3-3");
  const [strategy, setStrategy] = useState<ValidStrategy>(initialStrategy);
  const [budget, setBudget] = useState(100.00);
  const [budgetText, setBudgetText] = useState("100.00");

  const { toast } = useToast();
  const { openPaywall } = usePaywall();
  const { isPro, isLoading: isAuthLoading } = useAuth();
  const track = useTrack();
  const {
    data: roundData,
    isLoading: isRoundLoading,
    isError: isRoundError,
    refetch: refetchRound,
  } = useGetCurrentRound();
  const generateLineupMutation = useGenerateLineup();
  const saveLineupMutation = useSaveLineup();

  const [currentLineup, setCurrentLineup] = useState<LineupSuggestion | null>(null);
  const [swapOutPlayer, setSwapOutPlayer] = useState<LineupPlayer | null>(null);
  const [suggestedSwapCandidate, setSuggestedSwapCandidate] = useState<Player | null>(null);
  const [swapOutReserve, setSwapOutReserve] = useState<LineupReservePlayer | null>(null);
  const [fieldClickedPlayer, setFieldClickedPlayer] = useState<LineupPlayer | null>(null);
  const [reserveClickedPlayer, setReserveClickedPlayer] = useState<LineupReservePlayer | null>(null);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"field" | "list">(() => {
    try { return (localStorage.getItem("lineup_view_mode") as "field" | "list") ?? "field"; }
    catch { return "field"; }
  });

  const autoGenerateRef = useRef(false);
  const requestedProStrategy =
    requestedParam && PRO_STRATEGIES.has(requestedParam)
      ? requestedParam
      : urlStrategy && PRO_STRATEGIES.has(urlStrategy)
        ? urlStrategy
        : null;
  const downgradedStrategy = !isAuthLoading && !isPro ? requestedProStrategy : null;
  useEffect(() => {
    if (
      isAuthLoading ||
      isRoundLoading ||
      isRoundError ||
      roundData?.marketOpen === false ||
      searchParams.get("autoGenerate") !== "true" ||
      autoGenerateRef.current
    ) return;
    autoGenerateRef.current = true;
    const generationStrategy: ValidStrategy = downgradedStrategy ? "safe" : strategy;
    if (downgradedStrategy) {
      setStrategy("safe");
      track("onboarding_strategy_downgraded", { requested: downgradedStrategy });
    }
    const timer = setTimeout(() => {
      generateLineupMutation.mutate(
        { data: { budget, formation, strategy: generationStrategy as LineupGenerateRequestStrategy } },
        {
          onSuccess: (data) => {
            if (data.lineup) {
              setCurrentLineup(data.lineup);
              track("lineup_generated", { strategy: generationStrategy, formation, budget, expectedPoints: data.lineup.expectedPoints ?? 0, source: "auto" });
              toast({
                title: "Escalação Gerada",
                description: `Pontuação esperada: ${(data.lineup.expectedPoints ?? 0).toFixed(1)} pts`,
              });
            }
          },
          onError: (error) => {
            toast({
              title: "Falha na geração",
              description: error.message || "Não foi possível gerar escalação",
              variant: "destructive",
            });
          },
        }
      );
    }, 500);
    return () => clearTimeout(timer);
  // The URL and form defaults are fixed for this one-shot onboarding action.
  // Depending on `strategy` here would cancel the timer when the downgrade
  // updates the visible selection to "safe".
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthLoading, isPro, isRoundLoading, isRoundError, roundData?.marketOpen]);

  const handleGenerate = () => {
    if (isRoundLoading || isRoundError || roundData?.marketOpen === false) return;
    generateLineupMutation.mutate(
      { data: { budget, formation, strategy: strategy as LineupGenerateRequestStrategy } },
      {
        onSuccess: (data) => {
          if (data.lineup) {
            setCurrentLineup(data.lineup);
            track("lineup_generated", { strategy, formation, budget, expectedPoints: data.lineup.expectedPoints ?? 0, source: "manual" });
            toast({
              title: "Escalação Gerada",
              description: `Pontuação esperada: ${(data.lineup.expectedPoints ?? 0).toFixed(1)} pts`,
            });
          }
        },
        onError: (error) => {
          if ((error as { status?: number }).status === 402) {
            openPaywall();
            return;
          }
          toast({
            title: "Falha na geração",
            description: error.message || "Não foi possível gerar escalação com as restrições fornecidas",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleSave = () => {
    if (!currentLineup?.id) return;
    saveLineupMutation.mutate(
      { id: currentLineup.id },
      {
        onSuccess: () => toast({ title: "Escalação salva com sucesso" }),
        onError: () => toast({ title: "Falha ao salvar", variant: "destructive" }),
      }
    );
  };

  const handleSwapRequest = (player: LineupPlayer) => {
    if (!isPro) { openPaywall(); return; }
    setSuggestedSwapCandidate(null);
    setSwapOutPlayer(player);
  };

  const handleSuggestedSwapRequest = (outPlayer: LineupPlayer, candidate: Player) => {
    if (!isPro) { openPaywall(); return; }
    setFieldClickedPlayer(null);
    setSuggestedSwapCandidate(candidate);
    setSwapOutPlayer(outPlayer);
  };

  const handleReserveSwapRequest = (reserve: LineupReservePlayer) => {
    if (!isPro) { openPaywall(); return; }
    setReserveClickedPlayer(reserve);
  };

  const handleSetLuxuryReserve = (playerId: number) => {
    if (!currentLineup) return;
    setCurrentLineup({
      ...currentLineup,
      reserves: (currentLineup.reserves ?? []).map((r) => ({
        ...r,
        isLuxuryReserve: r.playerId === playerId,
      })),
    });
    setReserveClickedPlayer(null);
    toast({ title: "Reserva de Luxo definido" });
  };

  const handleApplyReserveSwap = (outId: number, inPlayer: Player) => {
    if (!currentLineup) return;
    const outReserve = currentLineup.reserves?.find((r) => r.playerId === outId);
    const outName = outReserve?.nickname ?? outReserve?.name ?? "Reserva";
    const newReserve: LineupReservePlayer = {
      playerId: inPlayer.id,
      name: inPlayer.name,
      nickname: inPlayer.nickname,
      position: outReserve?.position,
      price: inPlayer.price,
      averagePoints: inPlayer.averagePoints,
      expectedPoints: inPlayer.projection?.expectedPoints ?? null,
      clubId: inPlayer.club?.id ?? null,
      clubAbbr: inPlayer.club?.abbreviation ?? null,
      clubName: inPlayer.club?.name ?? null,
      isLuxuryReserve: outReserve?.isLuxuryReserve ?? false,
      orderIndex: outReserve?.orderIndex ?? 0,
    };
    setCurrentLineup({
      ...currentLineup,
      reserves: currentLineup.reserves?.map((r) =>
        r.playerId === outId ? newReserve : r
      ) ?? [],
    });
    setSwapOutReserve(null);
    toast({ title: "Reserva trocada", description: `${outName} → ${inPlayer.nickname ?? inPlayer.name}` });
  };

  const handleSetCaptain = (playerId: number) => {
    if (!currentLineup) return;
    setCurrentLineup({ ...currentLineup, captainPlayerId: playerId });
    setFieldClickedPlayer(null);
    toast({ title: "Capitão definido" });
  };

  const handleApplySwap = (
    outId: number,
    inPlayer: Player,
    afterMetrics: { expectedPoints: number; totalRisk: number; costUsed: number; differential: number }
  ) => {
    if (!currentLineup) return;
    const outPlayer = currentLineup.players?.find((p) => p.playerId === outId);
    const outName = outPlayer?.nickname ?? outPlayer?.name ?? "Jogador";
    const newLineupPlayer: LineupPlayer = {
      playerId: inPlayer.id,
      name: inPlayer.name,
      nickname: inPlayer.nickname,
      position: currentLineup.players?.find((p) => p.playerId === outId)?.position,
      price: inPlayer.price,
      averagePoints: inPlayer.averagePoints,
      expectedPoints: inPlayer.projection?.expectedPoints ?? null,
      floorPoints: inPlayer.projection?.floorPoints ?? null,
      ceilingPoints: inPlayer.projection?.ceilingPoints ?? null,
      riskScore: inPlayer.projection?.riskScore ?? null,
      explanation: (inPlayer.projection?.explanationJson ?? null) as Record<string, unknown> | null,
      clubId: inPlayer.club?.id ?? null,
      clubAbbr: inPlayer.club?.abbreviation ?? null,
      clubName: inPlayer.club?.name ?? null,
    };
    setCurrentLineup({
      ...currentLineup,
      players: currentLineup.players?.map((p) =>
        p.playerId === outId ? newLineupPlayer : p
      ) ?? [],
      expectedPoints: afterMetrics.expectedPoints,
      totalCost: afterMetrics.costUsed,
      riskScore: afterMetrics.totalRisk,
    });
    setSwapOutPlayer(null);
    setSuggestedSwapCandidate(null);
    toast({
      title: "Troca aplicada",
      description: `${outName} → ${inPlayer.nickname ?? inPlayer.name}`,
    });
  };

  const strategies: { value: ValidStrategy; label: string; icon: typeof Shield; desc: string; requiresPro?: boolean }[] = [
    { value: "safe", label: "Seguro (Alto Piso)", icon: Shield, desc: "Minimiza risco, seleciona jogadores consistentes." },
    { value: "aggressive", label: "Agressivo (Alto Teto)", icon: Zap, desc: "Maximiza pontos potenciais, aceita volatilidade.", requiresPro: true },
    { value: "cost-benefit", label: "Custo-Benefício", icon: Scale, desc: "Melhor relação pontos por cartoleta.", requiresPro: true },
    { value: "antimassa", label: "Antimassa (Diferencial)", icon: Shuffle, desc: "Prioriza diferenciais: alta projeção e baixa escalação.", requiresPro: true },
    { value: "valorizacao", label: "Valorização", icon: TrendingUp, desc: "Prioriza jogadores com tendência de subir de preço.", requiresPro: true },
  ];

  const fieldPlayers = currentLineup?.players?.filter((p) => p.position !== "TEC") ?? [];
  const coachPlayer = currentLineup?.players?.find((p) => p.position === "TEC");

  const groupByPosition = (players: LineupPlayer[]) => {
    const groups: Record<string, LineupPlayer[]> = {};
    players.forEach((p) => {
      const pos = p.position ?? "?";
      if (!groups[pos]) groups[pos] = [];
      groups[pos].push(p);
    });
    return groups;
  };

  const positionGroups = groupByPosition(fieldPlayers);
  const positionOrder = ["GOL", "ZAG", "LAT", "MEI", "ATA"];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 motion-safe:animate-in fade-in slide-in-from-bottom-4 motion-safe:duration-500">
      {/* Controls Sidebar */}
      <div className="lg:col-span-4 space-y-6">
        <div className="mb-2">
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            <Calculator className="w-8 h-8 text-primary" />
            Escalação
          </h1>
          <p className="text-muted-foreground mt-1">Gere escalações otimizadas com IA baseadas nas suas restrições.</p>
        </div>

        {downgradedStrategy && (
          <div className="flex flex-col gap-2 rounded-xl border border-attention/30 bg-attention/10 p-3 text-sm">
            <p className="text-foreground">
              Montamos no modo Seguro. O modo {STRATEGY_NAMES[downgradedStrategy]} faz parte do Pro.
            </p>
            <button
              type="button"
              onClick={openPaywall}
              className="self-start text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Conhecer o Pro
            </button>
          </div>
        )}

        <Card className="bg-card shadow-xl border-border/50 rounded-2xl overflow-hidden">
          <CardHeader className="bg-secondary/30 border-b border-border/50 py-2.5 px-4">
            <CardTitle className="text-sm font-semibold">Parâmetros</CardTitle>
          </CardHeader>
          <CardContent className="p-3 space-y-3">
            {/* Formação + Orçamento em linha */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground font-semibold">Formação</Label>
                <Select value={formation} onValueChange={setFormation}>
                  <SelectTrigger className="h-9 bg-background border-border rounded-lg text-sm">
                    <SelectValue placeholder="Formação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3-4-3">3-4-3</SelectItem>
                    <SelectItem value="3-5-2">3-5-2</SelectItem>
                    <SelectItem value="4-3-3">4-3-3</SelectItem>
                    <SelectItem value="4-4-2">4-4-2</SelectItem>
                    <SelectItem value="4-5-1">4-5-1</SelectItem>
                    <SelectItem value="5-3-2">5-3-2</SelectItem>
                    <SelectItem value="5-4-1">5-4-1</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground font-semibold">Orçamento</Label>
                <div className="flex items-center gap-1 h-9 px-2 bg-background border border-border rounded-lg">
                  <span className="text-xs font-mono text-primary">C$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={budgetText}
                    onChange={(e) => {
                      const raw = e.target.value.replace(",", ".");
                      if (/^\d{0,3}(\.\d{0,2})?$/.test(raw)) setBudgetText(raw);
                    }}
                    onBlur={() => {
                      const v = parseFloat(budgetText);
                      const clamped = isNaN(v) ? budget : Math.min(500, Math.max(80, v));
                      setBudget(clamped);
                      setBudgetText(clamped.toFixed(2));
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                     className="flex-1 text-right text-sm font-mono font-bold text-primary bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring min-w-0"
                  />
                </div>
              </div>
            </div>

            <Slider value={[budget]} onValueChange={(v) => { const val = v[0] ?? budget; setBudget(val); setBudgetText(val.toFixed(2)); }} max={500} min={80} step={0.01} className="py-0.5" />

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground font-semibold">Estratégia</Label>
              <TooltipProvider delayDuration={400}>
                <div className="space-y-1">
                  {strategies.map((s) => {
                    const isActive = strategy === s.value;
                    const btn = (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setStrategy(s.value)}
                            className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left motion-safe:transition-all motion-safe:duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              isActive
                                ? "border-primary bg-primary/10"
                                : "border-border bg-background hover:border-muted-foreground/50"
                            }`}
                          >
                            <s.icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                            <span className={`text-xs font-semibold flex-1 ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                              {s.label}
                            </span>
                            {s.requiresPro && (
                              <ProBadge className="shrink-0" />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[200px] text-xs">
                          {s.desc}
                        </TooltipContent>
                      </Tooltip>
                    );
                    return (
                      <div key={s.value}>
                        {s.requiresPro ? <ProGate compact>{btn}</ProGate> : btn}
                      </div>
                    );
                  })}
                </div>
              </TooltipProvider>
            </div>

            <Button
              className="w-full h-10 rounded-xl text-sm font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/40 motion-safe:hover:-translate-y-0.5 motion-safe:transition-all bg-gradient-to-r from-primary to-accent"
              onClick={handleGenerate}
              disabled={generateLineupMutation.isPending || isRoundLoading || isRoundError || roundData?.marketOpen === false}
            >
              {roundData?.marketOpen === false ? (
                <><Lock className="w-4 h-4 mr-2" /> Mercado fechado</>
              ) : generateLineupMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando...</>
              ) : (
                <><Calculator className="w-4 h-4 mr-2" /> Gerar Escalação</>
              )}
            </Button>

          </CardContent>
        </Card>
      </div>

      {/* Lineup Display */}
      <div className="lg:col-span-8 flex flex-col">
        {generateLineupMutation.isPending ? (
          <PageSkeleton variant="pitch" aria-label="Gerando escalação otimizada" />
        ) : generateLineupMutation.isError && (generateLineupMutation.error as { status?: number })?.status !== 402 ? (
          <ErrorState
            title="Falha na geração da escalação"
            description={generateLineupMutation.error?.message || "Não foi possível gerar escalação com as restrições fornecidas."}
            onRetry={() => {
              generateLineupMutation.reset();
              handleGenerate();
            }}
          />
        ) : currentLineup ? (
          <div className="w-full motion-safe:animate-in zoom-in-95 motion-safe:duration-500 space-y-3">
            {/* Summary bar — compact */}
            <div className="flex items-center justify-between gap-2 bg-card border border-border/50 px-3 py-2 rounded-xl shadow-sm">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground font-semibold leading-none mb-0.5">Pts esp.</p>
                   <p className="text-sm font-mono font-bold text-primary leading-none tabular-nums">{(currentLineup.expectedPoints ?? 0).toFixed(1)}</p>
                </div>
                <div className="w-px h-6 bg-border/50" />
                <div className="text-center">
                  <p className="text-xs text-muted-foreground font-semibold leading-none mb-0.5">Custo</p>
                   <p className="text-sm font-mono font-bold text-foreground leading-none tabular-nums">C$ {(currentLineup.totalCost ?? 0).toFixed(2)}</p>
                </div>
                <div className="w-px h-6 bg-border/50" />
                <div className="text-center">
                  <p className="text-xs text-muted-foreground font-semibold leading-none mb-0.5">
                    {strategy === "valorizacao" ? "Valoriz." : "Formação"}
                  </p>
                  <p className="text-sm font-mono font-bold text-foreground leading-none">
                    {strategy === "valorizacao" ? (() => {
                      const total = (currentLineup.players ?? []).reduce((sum, p) => {
                        const exp = (p.explanation ?? {}) as ExplanationJson;
                        return sum + (exp.priceVariation ?? 0);
                      }, 0);
                      return (total >= 0 ? "+" : "") + total.toFixed(2);
                    })() : currentLineup.formation}
                  </p>
                </div>
                <div className="w-px h-6 bg-border/50" />
                <div className="text-center">
                  <p className="text-xs text-muted-foreground font-semibold leading-none mb-0.5">Risco</p>
                   <p className="text-sm font-mono font-bold text-attention leading-none tabular-nums">{(currentLineup.riskScore ?? 0).toFixed(2)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {/* View toggle inline */}
                <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-0.5 mr-1">
                  <button
                    aria-label="Exibir escalação no campo"
                    onClick={() => { setViewMode("field"); try { localStorage.setItem("lineup_view_mode", "field"); } catch { /* ignore */ } }}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold motion-safe:transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${viewMode === "field" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <LayoutDashboard className="w-3 h-3" />
                    <span className="hidden sm:inline">Campo</span>
                  </button>
                  <button
                    aria-label="Exibir escalação em lista"
                    onClick={() => { setViewMode("list"); try { localStorage.setItem("lineup_view_mode", "list"); } catch { /* ignore */ } }}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold motion-safe:transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${viewMode === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <List className="w-3 h-3" />
                    <span className="hidden sm:inline">Lista</span>
                  </button>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs rounded-lg border-border bg-secondary hover:bg-primary hover:text-primary-foreground hover:border-primary motion-safe:transition-all"
                  onClick={handleSave}
                  disabled={saveLineupMutation.isPending}
                >
                  {saveLineupMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  <span className="ml-1 hidden sm:inline">Salvar</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs rounded-lg border-primary/40 bg-primary/5 text-primary hover:bg-primary hover:text-primary-foreground motion-safe:transition-all"
                  onClick={() => setRegisterDialogOpen(true)}
                >
                  <ClipboardList className="w-3 h-3" />
                  <span className="ml-1 hidden sm:inline">Meu time</span>
                </Button>
                <ExportLineupSheet lineup={currentLineup} />
              </div>
            </div>

            {/* Valorization strategy banner — compact */}
            {strategy === "valorizacao" && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-positive/10 border border-positive/30">
                <TrendingUp className="w-3.5 h-3.5 text-positive shrink-0" />
                  <p className="text-xs text-muted-foreground leading-tight">
                  <span className="text-positive font-semibold">Valorização</span> — jogadores com maior folga acima do MPV.
                </p>
              </div>
            )}

            {/* Field view */}
            {viewMode === "field" && (
              <FieldView
                players={currentLineup.players ?? []}
                reserves={currentLineup.reserves ?? []}
                lineup={currentLineup}
                captainId={currentLineup.captainPlayerId}
                coachId={currentLineup.coachPlayerId}
                onPlayerClick={setFieldClickedPlayer}
                onReserveClick={handleReserveSwapRequest}
                onSuggestedSwap={handleSuggestedSwapRequest}
                onSwapRequest={handleSwapRequest}
              />
            )}

            {/* List view */}
            {viewMode === "list" && (
              <div className="space-y-4">
                {positionOrder.map((pos) => {
                  const players = positionGroups[pos];
                  if (!players?.length) return null;
                  return (
                    <div key={pos}>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className={`font-mono text-xs ${getPositionColor(pos)}`}>{pos}</Badge>
                        <span className="text-xs text-muted-foreground">{players.length} jogador{players.length > 1 ? "es" : ""}</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {players.map((p) => (
                          <LineupPlayerCard
                            key={p.playerId}
                            player={p}
                            captainId={currentLineup.captainPlayerId}
                            coachId={currentLineup.coachPlayerId}
                            onSwapRequest={() => handleSwapRequest(p)}
                            strategy={strategy}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Coach */}
                {coachPlayer && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className={`font-mono text-xs ${getPositionColor("TEC")}`}>TEC</Badge>
                      <span className="text-xs text-muted-foreground">Técnico</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      <LineupPlayerCard
                        player={coachPlayer}
                        captainId={currentLineup.captainPlayerId}
                        coachId={currentLineup.coachPlayerId}
                        strategy={strategy}
                      />
                    </div>
                  </div>
                )}

                {/* Bench Reserves */}
                {(currentLineup.reserves?.length ?? 0) > 0 && (
                  <div className="pt-2 border-t border-border/30">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-semibold text-foreground">Banco de Reservas</span>
                      <Badge variant="secondary" className="text-xs">{currentLineup.reserves!.length}</Badge>
                      <span className="text-xs text-muted-foreground ml-1">
                        {currentLineup.reserves!.some((r) => r.isLuxuryReserve) && (
                          <span className="text-purple-400">· 1 reserva de luxo</span>
                        )}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                      {[...currentLineup.reserves!]
                        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
                        .map((r) => (
                          <ReserveCard key={r.playerId} reserve={r} />
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 opacity-60">
                      Reservas selecionadas com probabilidade de jogo {">"} 25%. A reserva de luxo entra quando todos os titulares jogaram e ela supera o pior titular.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Monte Carlo probability distribution (Pro) */}
            <LineupProbabilities lineup={currentLineup} />
          </div>
        ) : isRoundLoading ? (
          <PageSkeleton variant="pitch" aria-label="Carregando status da rodada" />
        ) : isRoundError ? (
          <ErrorState
            title="Não foi possível verificar o mercado"
            description="Verifique o status da rodada antes de gerar uma escalação."
            onRetry={refetchRound}
          />
        ) : roundData?.marketOpen === false ? (
          <EmptyState
            icon={Lock}
            title="Mercado fechado"
            description="A escalação desta rodada encerrou. Você ainda pode acompanhar as parciais e consultar os resultados."
            actionLabel="Ver parciais e resultados"
            actionHref="/historico"
          />
        ) : (
          <div className="w-full h-[600px] border-2 border-dashed border-border/50 rounded-3xl flex flex-col items-center justify-center text-muted-foreground bg-card/30">
            <Shield className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">Nenhuma escalação gerada</p>
            <p className="text-sm opacity-70 mt-1">Configure os parâmetros e clique em gerar</p>
          </div>
        )}
      </div>

      {/* Field player detail sheet */}
      {fieldClickedPlayer && (() => {
        const p = fieldClickedPlayer;
        const exp = (p.explanation ?? {}) as ExplanationJson;
        const isCaptain = p.playerId === currentLineup?.captainPlayerId;
        const isCoach = p.position === "TEC";
        const insights = isCoach ? [] : explainPlayer(p.position ? { ...exp, position: p.position } : exp);

        const formScore = exp.formScore ?? 0;
        const formPct = Math.min(100, (formScore / 10) * 100);
        const matchupScore = exp.matchupScore ?? 1;
        const matchupPct = normalizeMatchup(matchupScore);
        const volatility = exp.volatility ?? 0;
        const riskPct = Math.min(100, volatility * 100);
        const playProb = (exp.playProbability ?? 1) * 100;

        return (
          <Dialog open={!!fieldClickedPlayer} onOpenChange={(o) => { if (!o) setFieldClickedPlayer(null); }}>
            <DialogContent className="max-w-sm w-full rounded-2xl overflow-y-auto max-h-[85dvh]">
              <DialogHeader className="mb-2">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col flex-1 min-w-0">
                    <DialogTitle className="text-lg leading-tight truncate">
                      {p.nickname ?? p.name ?? "Jogador"}
                    </DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                        Análise do jogador e alternativas de substituição para esta escalação.
                      </DialogDescription>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {p.position && (
                        <span className="text-xs font-mono font-bold text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                          {p.position}
                        </span>
                      )}
                      {p.clubAbbr && (
                        <span className="text-xs text-muted-foreground">{p.clubAbbr}</span>
                      )}
                      {isCaptain && (
                        <span className="text-xs font-bold text-attention bg-attention/15 px-1.5 py-0.5 rounded">
                          ★ Capitão
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {p.price != null && (
                      <p className="text-2xl font-mono font-bold text-foreground">
                        <span className="text-sm font-normal text-muted-foreground mr-0.5">C$</span>{p.price.toFixed(2)}
                      </p>
                    )}
                    {p.expectedPoints != null && (
                      <p className="text-xs text-primary font-mono font-semibold">{p.expectedPoints.toFixed(1)} pts esp.</p>
                    )}
                  </div>
                </div>
              </DialogHeader>

              {!isCoach && (
                <>
                  {/* Metrics bars */}
                  {isPro ? (
                    <div className="space-y-3 bg-secondary/30 rounded-xl p-4 border border-border/40 mb-4">
                      <p className="text-xs font-semibold text-muted-foreground">Métricas</p>
                      {[
                        { label: "Forma", pct: formPct, sublabel: `${formScore.toFixed(1)} pts`, color: formPct >= 70 ? "bg-positive" : formPct >= 45 ? "bg-attention" : "bg-danger" },
                        { label: "Confronto", pct: matchupPct, sublabel: `×${matchupScore.toFixed(2)}`, color: matchupPct >= 65 ? "bg-positive" : matchupPct >= 42 ? "bg-attention" : "bg-danger" },
                        { label: "Risco", pct: riskPct, sublabel: riskPct < 30 ? "Baixo" : riskPct < 60 ? "Médio" : "Alto", color: riskPct < 30 ? "bg-positive" : riskPct < 60 ? "bg-attention" : "bg-danger" },
                        ...(exp.playProbability != null ? [{ label: "Prob. jogo", pct: playProb, sublabel: `${Math.round(playProb)}%`, color: playProb >= 70 ? "bg-positive" : playProb >= 40 ? "bg-attention" : "bg-danger" }] : []),
                      ].map(({ label, pct, sublabel, color }) => (
                        <div key={label} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground font-medium">{label}</span>
                            <span className="text-foreground font-semibold">{sublabel}</span>
                          </div>
                          <div className="h-2 rounded-full bg-secondary overflow-hidden">
                            <div className={`h-full rounded-full motion-safe:transition-all motion-safe:duration-500 ${color}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <button
                      onClick={() => { setFieldClickedPlayer(null); openPaywall(); }}
                      className="w-full flex items-center justify-center gap-2 py-3 mb-4 rounded-xl border border-dashed border-border text-muted-foreground hover:text-primary hover:border-primary/40 motion-safe:transition-colors text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Lock className="w-4 h-4" />
                      Ver métricas completas — Pro
                    </button>
                  )}

                  {/* Insights */}
                  {isPro && insights.length > 0 && (
                    <div className="space-y-1 mb-4">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Fatores</p>
                      {insights.slice(0, 4).map((ins, i) => {
                        const colors: Record<InsightKind, string> = {
                          positive: "text-positive",
                          attention: "text-attention",
                          danger: "text-danger",
                          differential: "text-differential",
                          neutral: "text-muted-foreground",
                        };
                        return (
                          <div key={i} className="flex items-start gap-2 py-1.5 border-b border-border/20 last:border-0">
                            <span className={`text-sm leading-snug ${colors[ins.kind]}`}>{ins.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {currentLineup && (
                    <div className="mb-4">
                      <ReplacementSuggestions
                        outPlayer={p}
                        lineup={currentLineup}
                        reserves={currentLineup.reserves ?? []}
                        onSelect={(candidate) => handleSuggestedSwapRequest(p, candidate)}
                        onBrowseAll={() => {
                          setFieldClickedPlayer(null);
                          handleSwapRequest(p);
                        }}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-2 mt-2">
                {!isCoach && !isCaptain && (
                  <Button
                    variant="outline"
                    className="w-full rounded-xl border-attention/40 text-attention hover:bg-attention/10"
                    onClick={() => handleSetCaptain(p.playerId!)}
                  >
                    <Crown className="w-4 h-4 mr-2" />
                    Definir como Capitão
                  </Button>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    className="flex-1 rounded-xl"
                    onClick={() => {
                      setFieldClickedPlayer(null);
                      handleSwapRequest(p);
                    }}
                  >
                    <ArrowLeftRight className="w-4 h-4 mr-2" />
                    Trocar jogador
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-xl px-4"
                    onClick={() => setFieldClickedPlayer(null)}
                  >
                    Fechar
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Swap simulator — main players */}
      {swapOutPlayer && currentLineup && (
        <SwapSimulator
          isOpen={!!swapOutPlayer}
          onClose={() => {
            setSwapOutPlayer(null);
            setSuggestedSwapCandidate(null);
          }}
          outPlayer={swapOutPlayer}
          lineup={currentLineup}
          budget={budget}
          initialCandidate={suggestedSwapCandidate ?? undefined}
          onApply={handleApplySwap}
        />
      )}

      {/* Reserve click dialog */}
      {reserveClickedPlayer && (() => {
        const r = reserveClickedPlayer;
        const isLuxury = r.isLuxuryReserve ?? false;
        return (
          <Dialog open onOpenChange={(open) => { if (!open) setReserveClickedPlayer(null); }}>
            <DialogContent className="max-w-xs w-full rounded-2xl">
              <DialogHeader className="mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col flex-1 min-w-0">
                    <DialogTitle className="text-base leading-tight truncate">
                      {r.nickname ?? r.name ?? "Reserva"}
                    </DialogTitle>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {r.position && (
                        <span className="text-xs font-mono font-bold text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                          {r.position}
                        </span>
                      )}
                      {r.clubAbbr && <span className="text-xs text-muted-foreground">{r.clubAbbr}</span>}
                      {isLuxury && (
                        <span className="text-xs font-bold text-purple-400 bg-purple-400/15 px-1.5 py-0.5 rounded">
                          ★ Reserva de Luxo
                        </span>
                      )}
                    </div>
                  </div>
                  {r.price != null && (
                    <p className="text-xl font-mono font-bold text-foreground shrink-0">
                      <span className="text-xs font-normal text-muted-foreground mr-0.5">C$</span>{r.price.toFixed(2)}
                    </p>
                  )}
                </div>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                {!isLuxury && (
                  <Button
                    variant="outline"
                    className="w-full rounded-xl border-purple-500/40 text-purple-400 hover:bg-purple-500/10"
                    onClick={() => handleSetLuxuryReserve(r.playerId!)}
                  >
                    <Star className="w-4 h-4 mr-2" />
                    Definir como Reserva de Luxo
                  </Button>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="default"
                    className="flex-1 rounded-xl"
                    onClick={() => { setReserveClickedPlayer(null); setSwapOutReserve(r); }}
                  >
                    <ArrowLeftRight className="w-4 h-4 mr-2" />
                    Trocar
                  </Button>
                  <Button variant="outline" className="rounded-xl px-4" onClick={() => setReserveClickedPlayer(null)}>
                    Fechar
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Swap simulator — reserves (skip simulation; direct pick) */}
      {swapOutReserve && currentLineup && (
        <SwapSimulator
          isOpen={!!swapOutReserve}
          onClose={() => setSwapOutReserve(null)}
          outPlayer={{
            playerId: swapOutReserve.playerId,
            name: swapOutReserve.name,
            nickname: swapOutReserve.nickname,
            position: swapOutReserve.position,
            price: swapOutReserve.price,
            clubAbbr: swapOutReserve.clubAbbr,
            clubName: swapOutReserve.clubName,
            clubId: swapOutReserve.clubId,
            expectedPoints: swapOutReserve.expectedPoints,
            averagePoints: swapOutReserve.averagePoints,
            floorPoints: null,
            ceilingPoints: null,
            riskScore: null,
            explanation: null,
          }}
          lineup={currentLineup}
          budget={budget}
          skipSimulation
          label={swapOutReserve.isLuxuryReserve ? "Trocar Reserva de Luxo" : "Trocar Reserva"}
          onApply={(outId, inPlayer) => handleApplyReserveSwap(outId, inPlayer)}
        />
      )}

      {/* Register round dialog */}
      {currentLineup?.id && (
        <RegisterRoundDialog
          open={registerDialogOpen}
          onOpenChange={setRegisterDialogOpen}
          lineupSuggestionId={currentLineup.id}
          round={currentLineup.round ?? 0}
        />
      )}

    </div>
  );
}
