/**
 * LineupProbabilities — seção Pro da página de escalação.
 *
 * Chama POST /api/lineup/probabilities (Monte Carlo, N=10 000) e exibe:
 *  • Histograma da distribuição de pontos (recharts ComposedChart, eixo X numérico)
 *    com linhas de referência para média e meta (75 pts).
 *  • Frases-resumo: chance de superar 75 pts, faixa p25–p75, pontuação esperada.
 *  • Tabela rápida de probabilidades para 60 / 75 / 90 / 100 pts.
 *  • Aviso claro de que são estimativas do modelo, não garantias.
 *
 * Auto-simula quando uma nova escalação é detectada (só para usuários Pro).
 * Usuários free veem o ProGate (blur + lock overlay).
 */

import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import {
  Loader2,
  Dices,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProGate } from "@/components/ProGate";
import { ProBadge } from "@/components/ProBadge";
import { useAuth } from "@/hooks/useAuth";
import type { LineupSuggestion } from "@workspace/api-client-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const THRESHOLDS = [60, 75, 90, 100];
const DEFAULT_TARGET = 75;
const NUM_SIMS = 10_000;

// ── Types ─────────────────────────────────────────────────────────────────────

interface SimPlayer {
  playerId: number;
  expectedPoints: number;
  floorPoints: number;
  ceilingPoints: number;
  volatility: number;
  playProbability: number;
  isCaptain: boolean;
}

interface SimResult {
  numSims: number;
  mean: number;
  stdDev: number;
  percentiles: { p10: number; p25: number; p50: number; p75: number; p90: number };
  exceedanceProbabilities: Record<string, number>;
  histogram: { min: number; max: number; count: number; frequency: number }[];
  disclaimer: string;
}

interface ProbResponse {
  simulation: SimResult;
  playerBreakdown: Array<{
    playerId: number;
    expectedContribution: number;
    captainBonus: number;
    isCaptain: boolean;
    playProbability: number;
  }>;
  meta: { elapsedMs: number; numSims: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSimPlayers(lineup: LineupSuggestion): SimPlayer[] | null {
  const players = lineup.players ?? [];
  if (players.length === 0) return null;

  let captainId = lineup.captainPlayerId;
  if (!captainId) {
    const best = [...players]
      .filter((p) => p.position !== "TEC")
      .sort((a, b) => (b.expectedPoints ?? 0) - (a.expectedPoints ?? 0))[0];
    captainId = best?.playerId ?? null;
  }
  if (!captainId) return null;

  return players.map((p): SimPlayer => {
    const exp = (p.explanation ?? {}) as Record<string, unknown>;
    const expected = Math.max(0, p.expectedPoints ?? 5);
    const floor = Math.max(0, p.floorPoints ?? expected * 0.15);
    const ceiling = Math.max(expected + 0.1, p.ceilingPoints ?? expected * 1.8);

    const volatility =
      typeof exp.volatility === "number" && (exp.volatility as number) > 0
        ? (exp.volatility as number)
        : Math.max(1.0, (ceiling - floor) / 3.5);

    const playProbability =
      typeof exp.playProbability === "number"
        ? Math.max(0, Math.min(1, exp.playProbability as number))
        : 0.88;

    return {
      playerId: p.playerId ?? 0,
      expectedPoints: expected,
      floorPoints: floor,
      ceilingPoints: ceiling,
      volatility,
      playProbability,
      isCaptain: p.playerId === captainId,
    };
  });
}

/** Fingerprint of the current lineup — changes when a new lineup is generated. */
function lineupKey(lineup: LineupSuggestion): string {
  return [
    (lineup.expectedPoints ?? 0).toFixed(2),
    lineup.players?.length ?? 0,
    lineup.captainPlayerId ?? 0,
    lineup.formation ?? "",
  ].join("|");
}

function pctStr(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function fmt1(v: number): string {
  return v.toFixed(1);
}

// ── Custom recharts tooltip ───────────────────────────────────────────────────

interface HistBucket {
  min: number;
  max: number;
  frequency: number;
  aboveTarget: boolean;
  midpoint: number;
}

function HistTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: HistBucket }>;
}) {
  if (!active || !payload?.length) return null;
  const b = payload[0]?.payload;
  if (!b) return null;
  return (
    <div className="bg-card border border-border/60 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-mono font-bold text-foreground">
        {fmt1(b.min)} – {fmt1(b.max)} pts
      </p>
      <p className="text-muted-foreground mt-0.5">{pctStr(b.frequency)} dos cenários</p>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 flex-1 min-w-0 ${
        highlight
          ? "border-primary/40 bg-primary/5"
          : "border-border/50 bg-card/40"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 leading-tight">
        {label}
      </p>
      <p
        className={`text-xl font-mono font-bold leading-tight ${
          highlight ? "text-primary" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{sub}</p>
      )}
    </div>
  );
}

// ── Inner component (only mounts for Pro users via ProGate) ───────────────────

function LineupProbabilitiesInner({ lineup }: { lineup: LineupSuggestion }) {
  const { isPro } = useAuth();
  const [result, setResult] = useState<ProbResponse | null>(null);
  const lastKeyRef = useRef("");
  const key = lineupKey(lineup);

  const mutation = useMutation<
    ProbResponse,
    Error & { status?: number },
    SimPlayer[]
  >({
    mutationFn: async (players) => {
      const res = await fetch("/api/lineup/probabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          players,
          thresholds: THRESHOLDS,
          numSims: NUM_SIMS,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw Object.assign(new Error(err.error ?? `HTTP ${res.status}`), {
          status: res.status,
        });
      }
      return res.json() as Promise<ProbResponse>;
    },
    onSuccess: (data) => setResult(data),
  });

  // Auto-trigger when lineup changes (Pro users only — avoids wasted 402 calls)
  useEffect(() => {
    if (!isPro) return;
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    const players = buildSimPlayers(lineup);
    if (players) mutation.mutate(players);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPro, key]);

  const sim = result?.simulation;

  // Re-run button handler
  const handleResimulate = () => {
    const players = buildSimPlayers(lineup);
    if (players) mutation.mutate(players);
  };

  // Build histogram with numeric midpoint for recharts numeric X axis
  const histData: HistBucket[] = (sim?.histogram ?? []).map((b) => ({
    ...b,
    midpoint: (b.min + b.max) / 2,
    aboveTarget: b.min >= DEFAULT_TARGET,
  }));

  const domainMin = histData[0]?.min ?? 0;
  const domainMax = histData[histData.length - 1]?.max ?? 200;

  const exceedTarget =
    sim?.exceedanceProbabilities[String(DEFAULT_TARGET)] ?? null;

  return (
    <div className="space-y-4">
      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Dices className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm text-foreground">
            Distribuição de Pontuação
          </span>
          {sim && (
            <Badge
              variant="outline"
              className="text-[9px] px-1.5 py-0 border-primary/30 text-primary/70"
            >
              {sim.numSims.toLocaleString("pt-BR")} simulações
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-foreground shrink-0"
          onClick={handleResimulate}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Re-simular
        </Button>
      </div>

      {/* ── Loading (first load) ────────────────────────────────────────────── */}
      {mutation.isPending && !sim && (
        <div className="flex flex-col items-center justify-center h-44 gap-2 text-muted-foreground text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span>Rodando simulação Monte Carlo…</span>
        </div>
      )}

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {mutation.isError && !sim && (
        <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-lg bg-destructive/10 border border-destructive/30">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {mutation.error?.message ?? "Falha na simulação"}
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {sim && (
        <>
          {/* Legend chips */}
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-2.5 rounded-sm inline-block bg-primary" />
              Acima de {DEFAULT_TARGET} pts
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-2.5 rounded-sm inline-block bg-primary/25" />
              Abaixo de {DEFAULT_TARGET} pts
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="w-5 inline-block border-t border-dashed border-primary"
                style={{ verticalAlign: "middle" }}
              />
              Média
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="w-5 inline-block border-t border-dashed border-attention"
                style={{ verticalAlign: "middle" }}
              />
              Meta
            </span>
          </div>

          {/* ── Histogram ────────────────────────────────────────────────────── */}
          <div>
            <ResponsiveContainer width="100%" height={190}>
              <ComposedChart
                data={histData}
                margin={{ top: 6, right: 10, left: -18, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(255,255,255,0.04)"
                  vertical={false}
                />
                <XAxis
                  dataKey="midpoint"
                  type="number"
                  domain={[domainMin, domainMax]}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v: number) => String(Math.round(v))}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                  tickLine={false}
                  axisLine={false}
                  width={38}
                />
                <Tooltip
                  content={<HistTooltip />}
                  cursor={{ fill: "hsl(var(--positive) / 0.07)" }}
                />

                {/* Reference line: team mean */}
                <ReferenceLine
                  x={sim.mean}
                  stroke="hsl(var(--positive))"
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                  label={{
                    value: `Méd. ${fmt1(sim.mean)}`,
                    position: "insideTopRight",
                    fontSize: 9,
                    fill: "hsl(var(--positive))",
                    dy: -4,
                  }}
                />

                {/* Reference line: target */}
                <ReferenceLine
                  x={DEFAULT_TARGET}
                  stroke="hsl(var(--attention))"
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                  label={{
                    value: `Meta ${DEFAULT_TARGET}`,
                    position: "insideTopLeft",
                    fontSize: 9,
                    fill: "hsl(var(--attention))",
                    dy: -4,
                  }}
                />

                <Bar dataKey="frequency" barSize={14} radius={[3, 3, 0, 0]}>
                  {histData.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={
                        entry.aboveTarget
                          ? "hsl(var(--positive))"
                          : "hsl(var(--positive) / 0.22)"
                      }
                    />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
            <p className="text-center text-[10px] text-muted-foreground -mt-0.5">
              Pontuação total estimada do time (pts)
            </p>
          </div>

          {/* ── Summary stat cards ──────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row gap-2">
            <StatCard
              label={`Chance de superar ${DEFAULT_TARGET} pts`}
              value={exceedTarget !== null ? pctStr(exceedTarget) : "—"}
              sub={`em ${sim.numSims.toLocaleString("pt-BR")} cenários simulados`}
              highlight={exceedTarget !== null && exceedTarget >= 0.35}
            />
            <StatCard
              label="Faixa provável (p25–p75)"
              value={`${fmt1(sim.percentiles.p25)}–${fmt1(sim.percentiles.p75)}`}
              sub="50% dos cenários nesta faixa"
            />
            <StatCard
              label="Pontuação esperada"
              value={`${fmt1(sim.mean)} pts`}
              sub={`±${fmt1(sim.stdDev)} pts (desvio padrão)`}
            />
          </div>

          {/* ── Threshold probability table ─────────────────────────────────── */}
          <div className="rounded-xl border border-border/40 bg-secondary/20 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2.5">
              Probabilidade de superar cada meta
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {THRESHOLDS.map((t) => {
                const prob = sim.exceedanceProbabilities[String(t)] ?? 0;
                const color =
                  prob >= 0.5
                    ? "text-primary"
                    : prob >= 0.25
                      ? "text-attention"
                      : "text-muted-foreground/50";
                return (
                  <div key={t} className="flex items-center gap-2 text-xs">
                    <Target className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                    <span className="text-muted-foreground tabular-nums w-16">
                      {t} pts
                    </span>
                    <span className={`font-mono font-bold tabular-nums ${color}`}>
                      {pctStr(prob)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Disclaimer ──────────────────────────────────────────────────── */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-secondary/30 border border-border/30 text-[10px] text-muted-foreground/70 leading-relaxed">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-attention/60" />
            <span>
              <strong className="text-muted-foreground">Estimativas do modelo, não garantias.</strong>{" "}
              {sim.disclaimer}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Public export — wrapped in Card + ProGate ─────────────────────────────────

export function LineupProbabilities({ lineup }: { lineup: LineupSuggestion }) {
  return (
    <Card className="bg-card shadow-xl border-border/50 rounded-2xl overflow-hidden">
      <CardHeader className="bg-secondary/30 border-b border-border/50 py-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          Probabilidades
          <ProBadge className="ml-0.5" />
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5">
        <ProGate message="Veja a distribuição estatística de pontuação do seu time com simulação Monte Carlo.">
          <LineupProbabilitiesInner lineup={lineup} />
        </ProGate>
      </CardContent>
    </Card>
  );
}
