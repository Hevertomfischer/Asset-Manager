import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { ProGate } from "@/components/ProGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Crown,
  GitFork,
  Zap,
} from "lucide-react";
import { PlayerCard } from "@/components/PlayerCard";
import { useToast } from "@/hooks/use-toast";
import { PageSkeleton } from "@/components/states/PageSkeleton";
import { ErrorState } from "@/components/states/ErrorState";
import { EmptyState } from "@/components/states/EmptyState";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FrontierPlayer {
  id: number;
  name: string;
  nickname: string | null;
  position: string;
  clubId: number | null;
  price: number;
  expectedPoints: number;
  riskScore: number;
  isCaptain: boolean;
}

interface FrontierTier {
  label: string;
  description: string;
  color: string;
  expectedPoints: number;
  totalRisk: number;
  totalCost: number;
  captainId: number | null;
  riskCap: number | null;
  players: FrontierPlayer[];
}

interface FrontierResponse {
  round: number;
  formation: string;
  budgetLimit: number;
  tiers: FrontierTier[];
}

const FORMATIONS = ["4-4-2", "4-3-3", "3-5-2", "3-4-3", "5-3-2", "5-4-1", "4-5-1"];

// ── Custom scatter dot ────────────────────────────────────────────────────────

interface DotPayload extends FrontierTier {
  x: number;
  y: number;
}

function CustomDot(props: { cx?: number; cy?: number; payload?: DotPayload }) {
  const { cx = 0, cy = 0, payload } = props;
  if (!payload) return null;
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={10}
        fill={payload.color}
        fillOpacity={0.85}
        stroke={payload.color}
        strokeWidth={2}
      />
      <text
        x={cx}
        y={cy - 17}
        textAnchor="middle"
        fill="#94a3b8"
        fontSize={9}
        fontWeight={700}
        letterSpacing={0.3}
      >
        {payload.label}
      </text>
    </g>
  );
}

// ── Tier card ─────────────────────────────────────────────────────────────────

function TierCard({
  tier,
  isExpanded,
  onToggle,
}: {
  tier: FrontierTier;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const captain = tier.players.find((p) => p.isCaptain);
  const fieldPlayers = tier.players
    .filter((p) => p.position !== "TEC")
    .sort((a, b) => b.expectedPoints - a.expectedPoints);
  const coach = tier.players.find((p) => p.position === "TEC");

  const riskLabel =
    tier.totalRisk < 3 ? "Baixo" : tier.totalRisk < 6 ? "Médio" : "Alto";
  const riskColor =
    tier.totalRisk < 3
      ? "text-positive"
      : tier.totalRisk < 6
        ? "text-attention"
        : "text-danger";

  const visiblePlayers = isExpanded ? fieldPlayers : fieldPlayers.slice(0, 3);

  return (
    <Card className="border-border/50 bg-card overflow-hidden flex flex-col">
      <div className="h-1 shrink-0" style={{ backgroundColor: tier.color }} />
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle
              className="text-sm font-bold truncate"
              style={{ color: tier.color }}
            >
              {tier.label}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {tier.description}
            </p>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <span className="text-2xl font-bold font-mono tabular-nums text-primary leading-none">
              {tier.expectedPoints.toFixed(1)}
            </span>
            <span className="text-xs text-muted-foreground mt-0.5">pts esperados</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 flex-1">
        {/* Metrics */}
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="bg-secondary rounded-lg py-2">
            <p className={`text-sm font-bold font-mono ${riskColor}`}>
              {tier.totalRisk.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">risco</p>
          </div>
          <div className="bg-secondary rounded-lg py-2">
            <p className="text-sm font-bold font-mono text-foreground">
              C$ {tier.totalCost.toFixed(0)}
            </p>
            <p className="text-xs text-muted-foreground">custo</p>
          </div>
          <div className="bg-secondary rounded-lg py-2">
            <p className="text-sm font-bold" style={{ color: tier.color }}>
              {riskLabel}
            </p>
            <p className="text-xs text-muted-foreground">nível</p>
          </div>
        </div>

        {/* Captain */}
        {captain && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-attention/10 border border-attention/20">
            <Crown className="w-3.5 h-3.5 text-attention shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-attention truncate">{captain.nickname ?? captain.name}</p>
              <p className="text-xs text-muted-foreground">
                {captain.position} · {captain.expectedPoints.toFixed(1)} pts
              </p>
            </div>
          </div>
        )}

        {/* Players list */}
        <div className="space-y-1.5">
          {visiblePlayers.map((p) => (
            <PlayerCard
              key={p.id}
              variant="compact"
              player={{
                name: p.name,
                nickname: p.nickname,
                position: p.position,
                expectedPoints: p.expectedPoints,
              }}
            />
          ))}

          {isExpanded && coach && (
            <div className="mt-1 pt-1 border-t border-border/30">
              <PlayerCard
                variant="compact"
                player={{
                  name: coach.name,
                  nickname: coach.nickname,
                  position: coach.position,
                  expectedPoints: coach.expectedPoints,
                }}
              />
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full h-7 text-xs text-muted-foreground hover:text-foreground gap-1 mt-auto"
          onClick={onToggle}
        >
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
          {isExpanded ? "Ver menos" : `Ver todos (${tier.players.length} jogadores)`}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Custom tooltip for scatter chart ─────────────────────────────────────────

function ScatterTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: DotPayload }>;
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-popover border border-border rounded-lg p-3 text-xs shadow-xl min-w-[170px]">
      <p className="font-bold mb-1 text-sm" style={{ color: d.color }}>
        {d.label}
      </p>
      <p className="text-muted-foreground mb-2 text-xs">{d.description}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Pts esperados</span>
          <span className="font-mono text-primary font-bold">{d.expectedPoints.toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Risco total</span>
          <span className="font-mono">{d.totalRisk.toFixed(3)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Custo</span>
          <span className="font-mono">C$ {d.totalCost.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Fronteira() {
  const { toast } = useToast();
  const [budget, setBudget] = useState(100);
  const [formation, setFormation] = useState("4-4-2");
  const [expandedTier, setExpandedTier] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/lineup/frontier", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ budget, formation }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? "Erro ao gerar fronteira");
      }
      return res.json() as Promise<FrontierResponse>;
    },
    onError: (err: Error) => {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    },
  });

  const tiers = mutation.data?.tiers ?? [];
  const chartData: DotPayload[] = tiers.map((t) => ({
    ...t,
    x: t.totalRisk,
    y: t.expectedPoints,
  }));

  const xMin = chartData.length ? Math.min(...chartData.map((d) => d.x)) : 0;
  const xMax = chartData.length ? Math.max(...chartData.map((d) => d.x)) : 10;
  const yMin = chartData.length ? Math.min(...chartData.map((d) => d.y)) : 0;
  const yMax = chartData.length ? Math.max(...chartData.map((d) => d.y)) : 100;
  const xPad = (xMax - xMin) * 0.15 || 1;
  const yPad = (yMax - yMin) * 0.08 || 5;
  const xDomain: [number, number] = [
    Math.max(0, xMin - xPad),
    xMax + xPad,
  ];
  const yDomain: [number, number] = [yMin - yPad, yMax + yPad];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground font-display flex items-center gap-2">
          <GitFork className="w-6 h-6 text-primary" />
          Fronteira Eficiente
        </h1>
        <p className="text-muted-foreground text-sm mt-1 max-w-xl">
          Escalações otimizadas por ILP para 5 perfis de risco — do conservador ao arrojado.
          Veja o custo real de cada ponto esperado vs. variância.
        </p>
      </div>

      <ProGate message="Compare escalações ótimas do conservador ao arrojado com gráfico risco × retorno">
        {/* Controls */}
        <Card className="border-border/50 bg-card">
          <CardContent className="pt-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Formação</Label>
                <Select value={formation} onValueChange={setFormation}>
                  <SelectTrigger className="bg-secondary border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMATIONS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-sm font-medium">Orçamento</Label>
                  <span className="text-sm font-mono text-primary font-bold">
                    C$ {budget}
                  </span>
                </div>
                <Slider
                  min={80}
                  max={160}
                  step={1}
                  value={[budget]}
                  onValueChange={([v]) => setBudget(v ?? budget)}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>C$ 80</span>
                  <span>C$ 160</span>
                </div>
              </div>
            </div>

            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="w-full bg-gradient-to-r from-primary to-accent font-semibold gap-2"
            >
              {mutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Calculando ILP…
                </>
              ) : (
                <>
                  <TrendingUp className="w-4 h-4" />
                  Gerar Fronteira
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {mutation.isError && (
          <ErrorState
            title="Não foi possível gerar a fronteira"
            description={(mutation.error as Error).message}
            onRetry={() => {
              mutation.reset();
              mutation.mutate();
            }}
          />
        )}

        {mutation.isPending && (
          <PageSkeleton variant="chart" aria-label="Calculando fronteira eficiente" />
        )}

        {/* Results */}
        {mutation.isSuccess && tiers.length === 0 && (
          <EmptyState
            icon={GitFork}
            title="Nenhuma escalação encontrada"
            description="Não encontramos combinações para esses parâmetros. Ajuste a formação ou o orçamento e tente novamente."
            actionLabel="Ajustar parâmetros"
            onAction={() => {
              mutation.reset();
              setExpandedTier(null);
            }}
          />
        )}

        {tiers.length > 0 && (
          <div className="space-y-6">
            {/* Scatter chart */}
            <Card className="border-border/50 bg-card">
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  Risco × Retorno
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Ideal: esquerda (baixo risco) + cima (alto retorno).
                </p>
              </CardHeader>
              <CardContent className="pt-2">
                <ResponsiveContainer width="100%" height={280}>
                  <ScatterChart margin={{ top: 30, right: 24, bottom: 28, left: 8 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255,255,255,0.04)"
                    />
                    <XAxis
                      dataKey="x"
                      type="number"
                      name="Risco total"
                      domain={xDomain}
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      label={{
                        value: "Risco Total →",
                        position: "insideBottom",
                        fill: "#64748b",
                        fontSize: 10,
                        dy: 18,
                      }}
                    />
                    <YAxis
                      dataKey="y"
                      type="number"
                      name="Pontos esperados"
                      domain={yDomain}
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      label={{
                        value: "Pts Esperados",
                        angle: -90,
                        position: "insideLeft",
                        fill: "#64748b",
                        fontSize: 10,
                        dx: -2,
                      }}
                    />
                    <Tooltip
                      cursor={{ stroke: "rgba(255,255,255,0.07)" }}
                      content={<ScatterTooltip />}
                    />
                    <Scatter
                      data={chartData}
                      shape={(props: unknown) =>
                        CustomDot(props as { cx?: number; cy?: number; payload?: DotPayload })
                      }
                    >
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Tier cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              {tiers.map((tier) => (
                <TierCard
                  key={tier.label}
                  tier={tier}
                  isExpanded={expandedTier === tier.label}
                  onToggle={() =>
                    setExpandedTier(expandedTier === tier.label ? null : tier.label)
                  }
                />
              ))}
            </div>

            <p className="text-xs text-muted-foreground text-center pb-2">
              Rodada {mutation.data?.round} · Formação {mutation.data?.formation} · C${" "}
              {mutation.data?.budgetLimit}
            </p>
          </div>
        )}
      </ProGate>
    </div>
  );
}
