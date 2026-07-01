import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Trophy, ArrowLeft, Calendar, TrendingUp, TrendingDown,
  Loader2, ChevronDown, ChevronUp, PenLine, Shield, Target,
  Crown, Wrench,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProGate } from "@/components/ProGate";
import { getPositionColor } from "@/hooks/use-custom-api";
import { useGetUserTeamRounds, type UserTeamRound, type UserTeamRoundPlayer } from "@workspace/api-client-react";

// ── Efficiency colour helper (same scale as historico.tsx) ────────────────────
function effColor(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 80) return "text-green-400";
  if (pct >= 60) return "text-yellow-400";
  return "text-red-400";
}

// ── Player row ────────────────────────────────────────────────────────────────
function PlayerRow({ player }: { player: UserTeamRoundPlayer }) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
        player.isCaptain
          ? "bg-yellow-500/5 border border-yellow-500/20"
          : "bg-secondary/40 border border-transparent"
      }`}
    >
      <Badge
        variant="outline"
        className={`font-mono text-[10px] w-8 justify-center shrink-0 ${getPositionColor(player.position)}`}
      >
        {player.position}
      </Badge>
      <div className="flex-1 min-w-0">
        <span className={`text-sm truncate block ${player.isCaptain ? "text-yellow-400 font-semibold" : "text-foreground"}`}>
          {player.nickname ?? player.name}
          {player.isCaptain && <Crown className="inline w-3 h-3 ml-1 text-yellow-400" />}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {player.price != null && (
          <span className="text-[10px] font-mono text-muted-foreground hidden sm:block">
            C$ {player.price.toFixed(1)}
          </span>
        )}
        {player.actualPoints !== null ? (
          <span className={`text-sm font-mono font-bold ${player.actualPoints >= 0 ? "text-green-400" : "text-red-400"}`}>
            {player.actualPoints > 0 ? "+" : ""}{player.actualPoints.toFixed(1)}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

// ── Round card ────────────────────────────────────────────────────────────────
function RoundCard({ round, defaultExpanded = false }: { round: UserTeamRound; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const hasPoints = round.actualTotal !== null;
  const isManual = round.source === "manual";

  // Sort players: field first (non-coach, non-reserve), then TEC
  const sorted = [...round.players].sort((a, b) => {
    if (a.isCoach && !b.isCoach) return 1;
    if (!a.isCoach && b.isCoach) return -1;
    if (a.isCaptain && !b.isCaptain) return -1;
    if (!a.isCaptain && b.isCaptain) return 1;
    return 0;
  });

  return (
    <Card className="overflow-hidden border-border/50 hover:border-primary/30 transition-colors">
      {/* Card header — always visible */}
      <CardHeader
        className="pb-3 pt-4 px-4 cursor-pointer select-none hover:bg-muted/10 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground text-sm">Rodada {round.round}</span>
                {isManual && (
                  <Badge variant="outline" className="text-[9px] font-medium text-muted-foreground border-border/50 py-0 px-1.5">
                    <PenLine className="w-2.5 h-2.5 mr-1" />
                    manual
                  </Badge>
                )}
              </div>
              {round.budgetUsed != null && (
                <span className="text-[11px] text-muted-foreground">
                  C$ {round.budgetUsed.toFixed(2)} usados
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {/* Real points — visible to everyone */}
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pontos</p>
              <p className={`text-lg font-bold font-mono ${hasPoints ? "text-foreground" : "text-muted-foreground"}`}>
                {hasPoints ? round.actualTotal!.toFixed(1) : "—"}
              </p>
            </div>

            {/* Efficiency — Pro only */}
            <ProGate compact>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Eficiência</p>
                <p className={`text-lg font-bold font-mono ${effColor(round.efficiencyPct)}`}>
                  {round.efficiencyPct !== null ? `${round.efficiencyPct}%` : "—"}
                </p>
              </div>
            </ProGate>

            <button className="text-muted-foreground hover:text-foreground transition-colors">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Efficiency vs optimal — quick inline bar (Pro) */}
        {round.optimalActualPoints !== null && round.actualTotal !== null && (
          <ProGate compact>
            <div className="mt-3 p-2 rounded-lg bg-secondary/50 border border-border/30">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1.5">
                <span>Seu time</span>
                <span>Ótimo retroativo</span>
              </div>
              <div className="relative h-1.5 rounded-full bg-border/50 overflow-hidden">
                <div
                  className={`absolute left-0 top-0 h-full rounded-full transition-all ${
                    round.efficiencyPct !== null && round.efficiencyPct >= 80
                      ? "bg-green-500"
                      : round.efficiencyPct !== null && round.efficiencyPct >= 60
                        ? "bg-yellow-500"
                        : "bg-red-500"
                  }`}
                  style={{ width: `${Math.min(round.efficiencyPct ?? 0, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] mt-1">
                <span className="font-mono font-bold text-foreground">{round.actualTotal.toFixed(1)} pts</span>
                <span className="font-mono font-bold text-yellow-400">{round.optimalActualPoints.toFixed(1)} pts</span>
              </div>
            </div>
          </ProGate>
        )}
      </CardHeader>

      {/* Expanded players list */}
      {expanded && (
        <CardContent className="px-4 pb-4 pt-0">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Sem jogadores registrados nesta rodada.</p>
          ) : (
            <div className="space-y-1.5">
              {sorted.map((p) => (
                <PlayerRow key={p.playerId} player={p} />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Hero stat box ─────────────────────────────────────────────────────────────
function StatBox({ label, value, sub, accent = false }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold font-mono mt-0.5 ${accent ? "text-primary" : "text-foreground"}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MeusTimesDetalhe() {
  const { id } = useParams<{ id: string }>();
  const teamId = id ? Number(id) : null;
  const { data, isLoading, isError } = useGetUserTeamRounds(teamId);

  const team = data?.team;
  const rounds = data?.rounds ?? [];

  // Most recent round (highest round number)
  const latestRound = rounds.length > 0
    ? [...rounds].sort((a, b) => b.round - a.round)[0]!
    : null;

  const totalPoints = rounds.reduce((s, r) => s + (r.actualTotal ?? 0), 0);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !team) {
    return (
      <div className="space-y-6">
        <Link to="/meus-times">
          <Button variant="ghost" size="sm" className="rounded-xl gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" /> Meus Times
          </Button>
        </Link>
        <Card className="border-destructive/30">
          <CardContent className="py-12 text-center text-muted-foreground">
            Time não encontrado.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Back nav */}
      <Link to="/meus-times">
        <Button variant="ghost" size="sm" className="rounded-xl gap-2 text-muted-foreground hover:text-foreground -ml-2">
          <ArrowLeft className="w-4 h-4" /> Meus Times
        </Button>
      </Link>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">{team.name}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {rounds.length} rodada{rounds.length !== 1 ? "s" : ""} registrada{rounds.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <Link to="/escalacao">
            <Button variant="outline" size="sm" className="rounded-xl border-primary/30 text-primary hover:bg-primary/10 gap-2">
              <Shield className="w-3.5 h-3.5" />
              Registrar nova rodada
            </Button>
          </Link>
        </div>

        {/* Stats row */}
        {rounds.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-border/30">
            <StatBox label="Pontos na temp." value={totalPoints.toFixed(1)} accent />
            <StatBox
              label="Última rodada"
              value={latestRound?.actualTotal !== null ? `${latestRound?.actualTotal?.toFixed(1) ?? "—"}` : "—"}
              sub={latestRound ? `Rodada ${latestRound.round}` : undefined}
            />
            <StatBox label="Rodadas" value={String(rounds.length)} />
            {/* Efficiency last round — Pro only */}
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Eficiência (últ.)</p>
              <ProGate compact>
                <p className={`text-2xl font-bold font-mono mt-0.5 ${effColor(latestRound?.efficiencyPct ?? null)}`}>
                  {latestRound?.efficiencyPct !== null && latestRound?.efficiencyPct !== undefined
                    ? `${latestRound.efficiencyPct}%`
                    : "—"}
                </p>
              </ProGate>
            </div>
          </div>
        ) : (
          /* Empty-state inside hero when no rounds yet */
          <div className="pt-4 border-t border-border/30 flex flex-col items-center gap-3 py-6 text-center">
            <Target className="w-10 h-10 text-primary/30" />
            <p className="text-sm font-medium text-foreground">Registre seu time desta rodada</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Gere uma escalação e clique em "Foi esse o meu time" para começar a acompanhar seu desempenho.
            </p>
            <Link to="/escalacao">
              <Button size="sm" className="rounded-xl bg-gradient-to-r from-primary to-accent font-semibold mt-1">
                <Shield className="w-3.5 h-3.5 mr-2" />
                Ir para Escalação
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* ── Rounds timeline ───────────────────────────────────────────────── */}
      {rounds.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Histórico por rodada</h2>
            <Badge variant="secondary" className="text-[10px]">{rounds.length}</Badge>
          </div>

          <div className="space-y-3">
            {[...rounds]
              .sort((a, b) => b.round - a.round)
              .map((round, idx) => (
                <RoundCard
                  key={round.id}
                  round={round}
                  defaultExpanded={idx === 0}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
