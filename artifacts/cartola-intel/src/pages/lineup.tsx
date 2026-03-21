import { useState } from "react";
import { useGenerateLineup, useSaveLineup, type LineupSuggestion, type LineupPlayer } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Shield, Zap, Scale, Calculator, Loader2, Save, AlertCircle, Crown, Star, Shuffle, Home, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getPositionColor } from "@/hooks/use-custom-api";

interface ExplanationJson {
  averagePoints?: number;
  formScore?: number;
  shortAvg?: number;
  mediumAvg?: number;
  longAvg?: number;
  volatility?: number;
  formTrend?: number;
  matchupScore?: number;
  playProbability?: number;
  cleanSheetProbability?: number;
  attackParticipationProbability?: number;
  isHome?: boolean;
  recentRoundsAnalyzed?: number;
  position?: string;
  price?: number;
  popularity?: number;
  valueScore?: number;
  differentialScore?: number;
  isTrap?: boolean;
  isHighVolatility?: boolean;
  isLowVolatility?: boolean;
  priceVariation?: number;
  gamesPlayed?: number;
  lowConfidence?: boolean;
  missingGames?: number;
}

type InsightKind = "positive" | "warning" | "neutral" | "info";
interface Insight { text: string; kind: InsightKind }

function buildInsights(exp: ExplanationJson, isCaptain: boolean, isCoach: boolean): Insight[] {
  if (isCoach) return [];
  const insights: Insight[] = [];

  if (isCaptain) {
    insights.push({ text: "Maior piso entre os titulares — capitão recomendado", kind: "positive" });
  }

  if (exp.isTrap) {
    insights.push({ text: "Popular mas com queda de forma — risco de trap", kind: "warning" });
  }

  if (exp.lowConfidence) {
    const games = exp.gamesPlayed ?? 0;
    insights.push({ text: `Poucos jogos registrados (${games}) — projeção incerta`, kind: "warning" });
  }

  const shortAvg = exp.shortAvg ?? 0;
  const mediumAvg = exp.mediumAvg ?? 0;
  if (shortAvg > 0 && mediumAvg > 0 && !exp.isTrap) {
    if (shortAvg >= mediumAvg * 1.2 && shortAvg > 2) {
      insights.push({ text: `Em alta: ${shortAvg.toFixed(1)} pts nas últimas rodadas`, kind: "positive" });
    } else if (shortAvg < mediumAvg * 0.7 && mediumAvg > 2) {
      insights.push({ text: `Queda de forma (${shortAvg.toFixed(1)} vs ${mediumAvg.toFixed(1)} na média)`, kind: "warning" });
    }
  }

  if (exp.matchupScore != null) {
    const loc = exp.isHome ? "em casa" : "fora";
    if (exp.matchupScore >= 1.10) {
      insights.push({ text: `Confronto favorável (${loc}, índice ${exp.matchupScore.toFixed(2)})`, kind: "positive" });
    } else if (exp.matchupScore <= 0.93) {
      insights.push({ text: `Confronto difícil (${loc}, índice ${exp.matchupScore.toFixed(2)})`, kind: "warning" });
    } else if (exp.isHome && insights.length < 2) {
      insights.push({ text: "Joga em casa", kind: "neutral" });
    }
  }

  const position = exp.position ?? "";
  if (["GOL", "ZAG", "LAT"].includes(position) && (exp.cleanSheetProbability ?? 0) > 0.5) {
    insights.push({
      text: `Alta prob. de saldo de gol (${Math.round((exp.cleanSheetProbability ?? 0) * 100)}%)`,
      kind: "positive",
    });
  }

  if ((exp.valueScore ?? 0) > 0.7 && !isCaptain) {
    insights.push({ text: `Bom custo-benefício (${(exp.valueScore ?? 0).toFixed(2)} pts/C$)`, kind: "positive" });
  }

  if ((exp.popularity ?? 1) < 0.15 && !exp.isTrap) {
    insights.push({
      text: `Diferencial: ${Math.round((exp.popularity ?? 0) * 100)}% de escalação`,
      kind: "info",
    });
  }

  if ((exp.priceVariation ?? 0) > 1.5) {
    insights.push({ text: `Valorizando: +C$ ${(exp.priceVariation ?? 0).toFixed(2)} na última rodada`, kind: "positive" });
  }

  if (insights.length === 0 && (exp.formScore ?? 0) > 3) {
    insights.push({ text: `Forma estável: ${(exp.formScore ?? 0).toFixed(1)} pts na média`, kind: "neutral" });
  }

  return insights.slice(0, 3);
}

const insightIcon: Record<InsightKind, typeof TrendingUp> = {
  positive: CheckCircle2,
  warning: AlertTriangle,
  neutral: Home,
  info: Info,
};

const insightColor: Record<InsightKind, string> = {
  positive: "text-green-500",
  warning: "text-yellow-500",
  neutral: "text-muted-foreground",
  info: "text-blue-400",
};

function PlayerCard({ player, captainId, coachId }: { player: LineupPlayer; captainId?: number | null; coachId?: number | null }) {
  const isCaptain = player.playerId === captainId;
  const isCoach = player.position === "TEC" || player.playerId === coachId;
  const exp = (player.explanation ?? {}) as ExplanationJson;
  const insights = buildInsights(exp, isCaptain, isCoach);

  return (
    <div
      className={`p-4 rounded-xl border transition-all ${
        isCaptain
          ? "border-yellow-500/50 bg-yellow-500/5 shadow-[0_0_15px_rgba(234,179,8,0.1)]"
          : isCoach
            ? "border-primary/40 bg-primary/5"
            : "border-border/50 bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {isCaptain && <Crown className="w-4 h-4 text-yellow-500 shrink-0" />}
          {isCoach && !isCaptain && <Star className="w-4 h-4 text-primary shrink-0" />}
          <div className="min-w-0">
            <p className="font-bold text-sm text-foreground truncate">{player.name}</p>
            <p className="text-[10px] text-muted-foreground">
              {player.clubAbbr ?? player.clubName ?? player.nickname ?? ""}
            </p>
          </div>
        </div>
        <Badge variant="outline" className={`font-mono text-[10px] shrink-0 ${getPositionColor(player.position ?? "")}`}>
          {player.position}
        </Badge>
      </div>

      <div className="flex items-center justify-between text-xs mb-2">
        <span className="text-muted-foreground">C$ {player.price?.toFixed(2) ?? "-"}</span>
        <span className="font-bold text-primary font-mono">
          {player.expectedPoints?.toFixed(1) ?? "-"} pts
        </span>
      </div>

      {isCaptain && (
        <div className="mt-1 mb-2 px-2 py-1 rounded-md bg-yellow-500/20 text-yellow-500 text-[10px] font-bold uppercase tracking-wider text-center">
          Capitão
        </div>
      )}
      {isCoach && !isCaptain && (
        <div className="mt-1 mb-2 px-2 py-1 rounded-md bg-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider text-center">
          Técnico
        </div>
      )}

      {insights.length > 0 && (
        <div className="mt-2 pt-2 border-t border-border/30 space-y-1">
          {insights.map((ins, i) => {
            const Icon = insightIcon[ins.kind];
            return (
              <div key={i} className="flex items-start gap-1.5">
                <Icon className={`w-3 h-3 mt-0.5 shrink-0 ${insightColor[ins.kind]}`} />
                <span className={`text-[10px] leading-tight ${insightColor[ins.kind]}`}>{ins.text}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Lineup() {
  const [formation, setFormation] = useState("4-3-3");
  const [strategy, setStrategy] = useState<"safe" | "aggressive" | "cost-benefit" | "antimassa">("cost-benefit");
  const [budget, setBudget] = useState(100);

  const { toast } = useToast();
  const generateLineupMutation = useGenerateLineup();
  const saveLineupMutation = useSaveLineup();

  const [currentLineup, setCurrentLineup] = useState<LineupSuggestion | null>(null);

  const handleGenerate = () => {
    generateLineupMutation.mutate(
      { data: { budget, formation, strategy } },
      {
        onSuccess: (data) => {
          if (data.lineup) {
            setCurrentLineup(data.lineup);
            toast({
              title: "Escalação Gerada",
              description: `Pontuação esperada: ${(data.lineup.expectedPoints ?? 0).toFixed(1)} pts`,
            });
          }
        },
        onError: (error) => {
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

  const strategies: { value: "safe" | "aggressive" | "cost-benefit" | "antimassa"; label: string; icon: typeof Shield; desc: string }[] = [
    { value: "safe", label: "Seguro (Alto Piso)", icon: Shield, desc: "Minimiza risco, seleciona jogadores consistentes." },
    { value: "aggressive", label: "Agressivo (Alto Teto)", icon: Zap, desc: "Maximiza pontos potenciais, aceita volatilidade." },
    { value: "cost-benefit", label: "Custo-Benefício", icon: Scale, desc: "Melhor relação pontos por cruzeiro." },
    { value: "antimassa", label: "Antimassa (Diferencial)", icon: Shuffle, desc: "Prioriza diferenciais: alta projeção e baixa escalação." },
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
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Controls Sidebar */}
      <div className="lg:col-span-4 space-y-6">
        <div className="mb-2">
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            <Calculator className="w-8 h-8 text-primary" />
            Escalação
          </h1>
          <p className="text-muted-foreground mt-1">Gere escalações otimizadas com IA baseadas nas suas restrições.</p>
        </div>

        <Card className="bg-card shadow-xl border-border/50 rounded-2xl overflow-hidden">
          <CardHeader className="bg-secondary/30 border-b border-border/50 py-4">
            <CardTitle className="text-lg">Parâmetros</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-6">
            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Formação</Label>
              <Select value={formation} onValueChange={setFormation}>
                <SelectTrigger className="h-12 bg-background border-border rounded-xl">
                  <SelectValue placeholder="Selecionar formação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="4-4-2">4-4-2 (Equilibrado)</SelectItem>
                  <SelectItem value="4-3-3">4-3-3 (Ofensivo)</SelectItem>
                  <SelectItem value="3-5-2">3-5-2 (Controle)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Estratégia</Label>
              <div className="space-y-2">
                {strategies.map((s) => {
                  const isActive = strategy === s.value;
                  return (
                    <button
                      key={s.value}
                      onClick={() => setStrategy(s.value)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all duration-200 ${
                        isActive
                          ? "border-primary bg-primary/10 shadow-[0_0_10px_rgba(16,185,129,0.1)]"
                          : "border-border bg-background hover:border-muted-foreground/50"
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${isActive ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}>
                        <s.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className={`font-semibold ${isActive ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{s.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Orçamento Máx.</Label>
                <span className="text-lg font-mono font-bold text-primary">C$ {budget}</span>
              </div>
              <Slider value={[budget]} onValueChange={(v) => setBudget(v[0])} max={200} min={80} step={1} className="py-1" />
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>C$ 80</span>
                <span>C$ 200</span>
              </div>
            </div>

            <Button
              className="w-full h-14 rounded-xl text-lg font-bold shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/40 hover:-translate-y-0.5 transition-all bg-gradient-to-r from-primary to-accent"
              onClick={handleGenerate}
              disabled={generateLineupMutation.isPending}
            >
              {generateLineupMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Gerando...
                </>
              ) : (
                <>
                  <Calculator className="w-5 h-5 mr-2" /> Gerar Escalação
                </>
              )}
            </Button>

            {generateLineupMutation.isError && (
              <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {generateLineupMutation.error?.message || "Falha ao gerar escalação"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lineup Display */}
      <div className="lg:col-span-8 flex flex-col">
        {currentLineup ? (
          <div className="w-full animate-in zoom-in-95 duration-500 space-y-6">
            {/* Summary bar */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-card border border-border/50 p-4 rounded-2xl shadow-lg">
              <div className="flex gap-6">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Pts Esperados</p>
                  <p className="text-2xl font-mono font-bold text-primary">{(currentLineup.expectedPoints ?? 0).toFixed(1)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Custo Total</p>
                  <p className="text-2xl font-mono font-bold text-foreground">C$ {(currentLineup.totalCost ?? 0).toFixed(2)}</p>
                </div>
                <div className="hidden md:block">
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Formação</p>
                  <p className="text-2xl font-mono font-bold text-foreground">{currentLineup.formation}</p>
                </div>
                <div className="hidden md:block">
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Risco</p>
                  <p className="text-2xl font-mono font-bold text-yellow-500">{(currentLineup.riskScore ?? 0).toFixed(2)}</p>
                </div>
              </div>
              <Button
                variant="outline"
                className="rounded-xl border-border bg-secondary hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all shadow-md"
                onClick={handleSave}
                disabled={saveLineupMutation.isPending}
              >
                {saveLineupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar Escalação
              </Button>
            </div>

            {/* Players grouped by position */}
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
                        <PlayerCard
                          key={p.playerId}
                          player={p}
                          captainId={currentLineup.captainPlayerId}
                          coachId={currentLineup.coachPlayerId}
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
                    <PlayerCard
                      player={coachPlayer}
                      captainId={currentLineup.captainPlayerId}
                      coachId={currentLineup.coachPlayerId}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="w-full h-[600px] border-2 border-dashed border-border/50 rounded-3xl flex flex-col items-center justify-center text-muted-foreground bg-card/30">
            <Shield className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">Nenhuma escalação gerada</p>
            <p className="text-sm opacity-70 mt-1">Configure os parâmetros e clique em gerar</p>
          </div>
        )}
      </div>
    </div>
  );
}
