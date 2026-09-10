import { useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Trophy, ArrowLeft, Calendar, TrendingUp,
  Loader2, ChevronDown, ChevronUp, PenLine, Shield, Target,
  Crown, Plus, Share2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProGate } from "@/components/ProGate";
import { useShareCard } from "@/hooks/useShareCard";
import { ShareCardFrame } from "@/components/share/ShareCardFrame";
import { getPositionColor } from "@/hooks/use-custom-api";
import { ManualRoundDialog } from "@/components/ManualRoundDialog";
import { useGetUserTeamRounds, type UserTeamRound, type UserTeamRoundPlayer } from "@workspace/api-client-react";

// ── Efficiency colour helper (same scale as historico.tsx) ────────────────────
function effColor(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 80) return "text-positive";
  if (pct >= 60) return "text-attention";
  return "text-danger";
}

// ── Player row ────────────────────────────────────────────────────────────────
function PlayerRow({ player }: { player: UserTeamRoundPlayer }) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg motion-safe:transition-colors ${
        player.isCaptain
          ? "bg-attention/5 border border-attention/20"
          : "bg-secondary/40 border border-transparent"
      }`}
    >
      <Badge
        variant="outline"
         className={`font-mono text-xs w-8 justify-center shrink-0 ${getPositionColor(player.position)}`}
      >
        {player.position}
      </Badge>
      <div className="flex-1 min-w-0">
        <span className={`text-sm truncate block ${player.isCaptain ? "text-attention font-semibold" : "text-foreground"}`}>
          {player.nickname ?? player.name}
          {player.isCaptain && <Crown className="inline w-3 h-3 ml-1 text-attention" />}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {player.price != null && (
           <span className="text-xs font-mono tabular-nums text-muted-foreground hidden sm:block">
            C$ {player.price.toFixed(1)}
          </span>
        )}
        {player.actualPoints !== null ? (
           <span className={`text-sm font-mono tabular-nums font-bold ${player.actualPoints >= 0 ? "text-positive" : "text-danger"}`}>
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
       <Card className="overflow-hidden border-border/50 hover:border-primary/30 motion-safe:transition-colors">
      {/* Card header — always visible */}
      <CardHeader
         className="pb-3 pt-4 px-4 cursor-pointer select-none hover:bg-muted/10 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setExpanded((v) => !v)}
         onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setExpanded((v) => !v); }}
         role="button"
         tabIndex={0}
         aria-expanded={expanded}
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
                   <Badge variant="outline" className="text-xs font-medium text-muted-foreground border-border/50 py-0 px-1.5">
                    <PenLine className="w-2.5 h-2.5 mr-1" />
                    manual
                  </Badge>
                )}
              </div>
              {round.budgetUsed != null && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  C$ {round.budgetUsed.toFixed(2)} usados
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {/* Real points — visible to everyone */}
            <div className="text-right">
               <p className="text-xs text-muted-foreground">Pontos</p>
               <p className={`text-lg font-bold font-mono tabular-nums ${hasPoints ? "text-foreground" : "text-muted-foreground"}`}>
                {hasPoints ? round.actualTotal!.toFixed(1) : "—"}
              </p>
            </div>

            {/* Efficiency — Pro only */}
            <ProGate compact>
              <div className="text-right">
               <p className="text-xs text-muted-foreground">Eficiência</p>
               <p className={`text-lg font-bold font-mono tabular-nums ${effColor(round.efficiencyPct)}`}>
                  {round.efficiencyPct !== null ? `${round.efficiencyPct}%` : "—"}
                </p>
              </div>
            </ProGate>

           <button aria-label={expanded ? "Recolher rodada" : "Expandir rodada"} className="text-muted-foreground hover:text-foreground motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Efficiency vs optimal — quick inline bar (Pro) */}
        {round.optimalActualPoints !== null && round.actualTotal !== null && (
          <ProGate compact>
            <div className="mt-3 p-2 rounded-lg bg-secondary/50 border border-border/30">
               <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span>Seu time</span>
                <span>Ótimo retroativo</span>
              </div>
              <div className="relative h-1.5 rounded-full bg-border/50 overflow-hidden">
                <div
                   className={`absolute left-0 top-0 h-full rounded-full motion-safe:transition-all ${
                    round.efficiencyPct !== null && round.efficiencyPct >= 80
                      ? "bg-positive"
                      : round.efficiencyPct !== null && round.efficiencyPct >= 60
                        ? "bg-attention"
                        : "bg-danger"
                  }`}
                  style={{ width: `${Math.min(round.efficiencyPct ?? 0, 100)}%` }}
                />
              </div>
               <div className="flex items-center justify-between text-xs mt-1">
                 <span className="font-mono tabular-nums font-bold text-foreground">{round.actualTotal.toFixed(1)} pts</span>
                 <span className="font-mono tabular-nums font-bold text-attention">{round.optimalActualPoints.toFixed(1)} pts</span>
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
       <p className="text-xs text-muted-foreground">{label}</p>
       <p className={`text-2xl font-bold font-mono tabular-nums mt-0.5 ${accent ? "text-primary" : "text-foreground"}`}>{value}</p>
       {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MeusTimesDetalhe() {
  const { id } = useParams<{ id: string }>();
  const teamId = id ? Number(id) : null;
  const { data, isLoading, isError } = useGetUserTeamRounds(teamId);
  const [manualOpen, setManualOpen] = useState(false);

  const team = data?.team;
  const rounds = data?.rounds ?? [];

  // Most recent round (highest round number)
  const latestRound = rounds.length > 0
    ? [...rounds].sort((a, b) => b.round - a.round)[0]!
    : null;

  const totalPoints = rounds.reduce((s, r) => s + (r.actualTotal ?? 0), 0);

  // Share card — hooks must be called before early returns
  const shareRef = useRef<HTMLDivElement>(null);
  const { share: handleShareCard, isSharing: isSharingCard, errorMsg: shareError } = useShareCard(
    shareRef,
    () => `mitometro-time-${(team?.name ?? "time").replace(/\s+/g, "_")}-r${latestRound?.round ?? 0}.png`,
    "meu_time"
  );

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
    <div className="space-y-8 motion-safe:animate-in fade-in motion-safe:duration-300">
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
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-border/50 text-muted-foreground hover:text-foreground gap-2"
              onClick={() => setManualOpen(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              Manual
            </Button>
            <Link to="/escalacao">
              <Button variant="outline" size="sm" className="rounded-xl border-primary/30 text-primary hover:bg-primary/10 gap-2">
                <Shield className="w-3.5 h-3.5" />
                Via Escalação
              </Button>
            </Link>
            {latestRound && latestRound.actualTotal !== null && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleShareCard}
                disabled={isSharingCard}
                className="rounded-xl border-border/50 text-muted-foreground hover:text-foreground gap-2"
              >
                {isSharingCard ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Share2 className="w-3.5 h-3.5" />
                )}
                {isSharingCard ? "Gerando…" : "Compartilhar rodada"}
              </Button>
            )}
            {shareError && (
             <p className="text-xs text-destructive w-full mt-1">{shareError}</p>
            )}
          </div>
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
               <p className="text-xs text-muted-foreground">Eficiência (últ.)</p>
              <ProGate compact>
                 <p className={`text-2xl font-bold font-mono tabular-nums mt-0.5 ${effColor(latestRound?.efficiencyPct ?? null)}`}>
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
             <Badge variant="secondary" className="text-xs tabular-nums">{rounds.length}</Badge>
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

      {/* ── Manual round dialog ────────────────────────────────────────────── */}
      {teamId && (
        <ManualRoundDialog
          teamId={teamId}
          open={manualOpen}
          onOpenChange={setManualOpen}
        />
      )}

      {/* ── Hidden share card (html-to-image target) ──────────────────────── */}
      <ShareCardFrame ref={shareRef} subtitle="Meu Time · Cartola FC">
        {latestRound && (
          <>
            {/* Team + round */}
            <div style={{ padding: "16px 20px 10px" }}>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#f1f5f9", marginBottom: "2px" }}>
                {team?.name ?? ""}
              </div>
               <div style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))" }}>Rodada {latestRound.round}</div>
            </div>

            {/* Points hero */}
            <div style={{ padding: "0 20px 12px", display: "grid", gridTemplateColumns: latestRound.optimalActualPoints != null ? "1fr 1fr" : "1fr", gap: "10px" }}>
              <div style={{ background: "hsl(var(--card))", borderRadius: "10px", padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))", marginBottom: "4px" }}>Minha pontuação</div>
                <div style={{ fontSize: "32px", fontWeight: 900, color: "hsl(var(--positive))", lineHeight: 1 }}>
                  {latestRound.actualTotal?.toFixed(1) ?? "—"}
                </div>
                 <div style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))", marginTop: "2px" }}>pts reais</div>
              </div>
              {latestRound.optimalActualPoints != null && (
                <div style={{ background: "hsl(var(--card))", borderRadius: "10px", padding: "12px", textAlign: "center" }}>
                  <div style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))", marginBottom: "4px" }}>Time ótimo</div>
                  <div style={{ fontSize: "32px", fontWeight: 900, color: "hsl(var(--attention))", lineHeight: 1 }}>
                    {latestRound.optimalActualPoints.toFixed(1)}
                  </div>
                   <div style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))", marginTop: "2px" }}>pts possíveis</div>
                </div>
              )}
            </div>

            {/* Efficiency bar */}
            {latestRound.efficiencyPct != null && (
              <div style={{ margin: "0 20px 12px", background: "hsl(var(--card))", borderRadius: "10px", padding: "10px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                 <span style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))" }}>Eficiência vs time ótimo</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: latestRound.efficiencyPct >= 80 ? "hsl(var(--positive))" : latestRound.efficiencyPct >= 60 ? "hsl(var(--attention))" : "hsl(var(--danger))" }}>
                    {latestRound.efficiencyPct}%
                  </span>
                </div>
                <div style={{ background: "hsl(var(--border))", borderRadius: "999px", height: "6px", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: "999px", width: `${Math.min(latestRound.efficiencyPct, 100)}%`, background: latestRound.efficiencyPct >= 80 ? "hsl(var(--positive))" : latestRound.efficiencyPct >= 60 ? "hsl(var(--attention))" : "hsl(var(--danger))" }} />
                </div>
              </div>
            )}

            {/* Top players */}
            {latestRound.players.filter((p) => p.actualPoints != null).length > 0 && (
              <div style={{ margin: "0 20px 14px" }}>
                <div style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))", fontWeight: 600, marginBottom: "6px" }}>
                  Escalação
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px" }}>
                  {[...latestRound.players]
                    .sort((a, b) => (b.actualPoints ?? 0) - (a.actualPoints ?? 0))
                    .slice(0, 8)
                    .map((p) => (
                      <div key={p.playerId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: "hsl(var(--card))", borderRadius: "6px" }}>
                        <span style={{ fontSize: "12px", color: p.isCaptain ? "hsl(var(--attention))" : "hsl(var(--muted-foreground))", fontWeight: p.isCaptain ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "90px" }}>
                          {p.nickname ?? p.name}
                        </span>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: (p.actualPoints ?? 0) >= 0 ? "hsl(var(--positive))" : "hsl(var(--danger))" }}>
                          {p.actualPoints != null ? ((p.actualPoints > 0 ? "+" : "") + p.actualPoints.toFixed(1)) : "—"}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </ShareCardFrame>
    </div>
  );
}
