import { useState } from "react";
import { useTrack } from "@/hooks/useTrack";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  AlertTriangle,
  Home,
  Info,
  Lock,
  Sparkles,
  BarChart2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { usePaywall } from "@/context/PaywallContext";
import {
  type ExplanationJson,
  type InsightKind,
  explainPlayer,
  normalizeMatchup,
} from "@/lib/explainPlayer";

const kindIcon: Record<InsightKind, typeof CheckCircle2> = {
  positive: CheckCircle2,
  attention: AlertTriangle,
  danger: AlertTriangle,
  neutral: Home,
  differential: Info,
};

const kindColor: Record<InsightKind, string> = {
  positive: "text-positive",
  attention: "text-attention",
  danger: "text-danger",
  neutral: "text-muted-foreground",
  differential: "text-differential",
};

function BarRow({
  label,
  value,
  color = "bg-primary",
  sublabel,
}: {
  label: string;
  value: number;
  color?: string;
  sublabel?: string;
}) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground font-medium">{label}</span>
        {sublabel && <span className="text-foreground font-semibold">{sublabel}</span>}
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full rounded-full motion-safe:transition-all motion-safe:duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface Props {
  exp: ExplanationJson;
  playerName: string;
  position?: string;
  minimoParaValorizar?: number | null;
  baseAverage?: number | null;
}

export function PlayerExplanationSheet({ exp, playerName, position, minimoParaValorizar, baseAverage }: Props) {
  const { isPro, isLoading } = useAuth();
  const { openPaywall } = usePaywall();
  const [open, setOpen] = useState(false);
  const track = useTrack();

  function handleOpenChange(isOpen: boolean) {
    if (isOpen) track("explanation_opened", { playerName: playerName ?? "unknown", position: position ?? "unknown" });
    setOpen(isOpen);
  }

  if (isLoading) return null;

  if (!isPro) {
    return (
      <button
        onClick={openPaywall}
        title="Análise completa — disponível no Pro"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground/50 hover:text-primary/70 motion-safe:transition-colors rounded px-1.5 py-0.5 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Lock className="w-3 h-3" />
        <span className="hidden sm:inline">Análise</span>
      </button>
    );
  }

  const expWithPos = position ? { ...exp, position } : exp;
  const insights = explainPlayer(expWithPos);

  const formScore = exp.formScore ?? 0;
  const formPct = Math.min(100, (formScore / 10) * 100);

  const matchupScore = exp.matchupScore ?? 1;
  const matchupPct = normalizeMatchup(matchupScore);

  const volatility = exp.volatility ?? 0;
  const riskPct = Math.min(100, volatility * 100);

  const playProb = (exp.playProbability ?? 1) * 100;

  const formColor =
    formPct >= 70 ? "bg-positive" : formPct >= 45 ? "bg-attention" : "bg-danger";
  const matchupColor =
    matchupPct >= 65 ? "bg-positive" : matchupPct >= 42 ? "bg-attention" : "bg-danger";
  const riskColor =
    riskPct < 30 ? "bg-positive" : riskPct < 60 ? "bg-attention" : "bg-danger";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Ver análise completa"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary motion-safe:transition-colors rounded px-1.5 py-0.5 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BarChart2 className="w-3 h-3" />
        <span className="hidden sm:inline">Análise</span>
      </button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-sm overflow-y-auto"
        >
          <SheetHeader className="mb-5">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div>
                <SheetTitle className="text-base leading-tight">{playerName}</SheetTitle>
                {position && (
                  <p className="text-xs text-muted-foreground mt-0.5">{position}</p>
                )}
              </div>
            </div>
          </SheetHeader>

          {/* Barras métricas */}
          <div className="space-y-4 mb-6 bg-secondary/30 rounded-xl p-4 border border-border/40">
            <p className="text-xs font-semibold text-muted-foreground">
              Métricas principais
            </p>
            <BarRow
              label="Forma"
              value={formPct}
              color={formColor}
              sublabel={`${formScore.toFixed(1)} pts`}
            />
            <BarRow
              label="Confronto"
              value={matchupPct}
              color={matchupColor}
              sublabel={`×${matchupScore.toFixed(2)}`}
            />
            <BarRow
              label="Risco"
              value={riskPct}
              color={riskColor}
              sublabel={riskPct < 30 ? "Baixo" : riskPct < 60 ? "Médio" : "Alto"}
            />
            {exp.playProbability != null && (
              <BarRow
                label="Prob. de jogo"
                value={playProb}
                color={playProb >= 70 ? "bg-positive" : playProb >= 40 ? "bg-attention" : "bg-danger"}
                sublabel={`${Math.round(playProb)}%`}
              />
            )}
          </div>

          {/* Lista de fatores */}
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground mb-2">
              Fatores de decisão
            </p>
            {insights.length === 0 ? (
              <p className="text-sm text-muted-foreground">Dados insuficientes para análise detalhada.</p>
            ) : (
              insights.map((ins, i) => {
                const Icon = kindIcon[ins.kind];
                return (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 py-2 border-b border-border/20 last:border-0"
                  >
                    <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${kindColor[ins.kind]}`} />
                    <span className={`text-sm leading-snug ${kindColor[ins.kind]}`}>
                      {ins.text}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Dados brutos resumidos */}
          <div className="mt-5 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {exp.averagePoints != null && (
                <div className="bg-secondary/30 rounded-lg p-2.5 text-center">
                  <p className="text-xs text-muted-foreground">Média geral</p>
                  <p className="font-bold text-sm text-foreground tabular-nums">{exp.averagePoints.toFixed(1)} pts</p>
                </div>
              )}
              {exp.priceVariation != null && (
                <div className={`rounded-lg p-2.5 text-center ${
                  exp.priceVariation > 0 ? "bg-positive/10" : exp.priceVariation < 0 ? "bg-danger/10" : "bg-secondary/30"
                }`}>
                  <p className="text-xs text-muted-foreground">Variação</p>
                  <p className={`font-bold text-sm ${
                    exp.priceVariation > 0 ? "text-positive" : exp.priceVariation < 0 ? "text-danger" : "text-foreground"
                  } tabular-nums`}>
                    {exp.priceVariation > 0 ? "+" : ""}C$ {exp.priceVariation.toFixed(2)}
                  </p>
                </div>
              )}
            </div>
            {(minimoParaValorizar != null || baseAverage != null) && (
              <div className="grid grid-cols-2 gap-2">
                {minimoParaValorizar != null && (
                  <div className="bg-attention/10 rounded-lg p-2.5 text-center" title="Pontuação mínima para o jogador aumentar de preço na próxima rodada">
                    <p className="text-xs text-muted-foreground">Mín. para valorizar</p>
                    <p className="font-bold text-sm text-attention tabular-nums">↑{minimoParaValorizar.toFixed(1)} pts</p>
                  </div>
                )}
                {baseAverage != null && (
                  <div className="bg-differential/10 rounded-lg p-2.5 text-center" title="Média de pontos excluindo Gols (G×8), Assistências (A×5) e Saldo de Gols (SG×5) — representa o quanto o jogador pontua sem eventos de gol">
                    <p className="text-xs text-muted-foreground">Média base (sem G/A/SG)</p>
                    <p className="font-bold text-sm text-differential tabular-nums">{baseAverage.toFixed(1)} pts</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <Button
            variant="outline"
            className="w-full mt-5"
            onClick={() => setOpen(false)}
          >
            Fechar
          </Button>
        </SheetContent>
      </Sheet>
    </>
  );
}
