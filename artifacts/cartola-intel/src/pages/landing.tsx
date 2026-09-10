/**
 * / — Landing page pública (visitantes sem sessão).
 *
 * Renderizada sem AppLayout. Mesmo tema visual de desempenho.tsx.
 * Instrumentada com landing_viewed / signup_cta_clicked.
 */

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getBadgeUrl, getBadgeScale } from "@/lib/clubColors";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart2,
  CheckCircle2,
  Loader2,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTrack } from "@/hooks/useTrack";
import { getPositionColor } from "@/hooks/use-custom-api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TopPlayer {
  playerId: number;
  name: string;
  nickname: string | null;
  position: string | null;
  price: number | null;
  popularity: number | null;
  expectedPoints: number | null;
  playProbability: number | null;
  isDifferencial: boolean;
  club: {
    abbreviation: string | null;
    badgeUrl: string | null;
    name: string | null;
  };
}

interface TopProjectionsResponse {
  round: number | null;
  players: TopPlayer[];
  generatedAt: string;
}

interface PerformanceSummary {
  empty?: boolean;
  season?: {
    totalRounds: number;
    totalDataPoints: number;
    mae: number;
    overestimatedPct: number;
  };
  byRound?: Array<{ round: number; mae: number; count: number }>;
  differentials?: { total: number; hits: number; hitRate: number };
}

// ── TopPlayerCard ─────────────────────────────────────────────────────────────

function TopPlayerCard({ player, rank }: { player: TopPlayer; rank: number }) {
  const displayName = player.nickname ?? player.name;
  const posColor = getPositionColor(player.position ?? "");

  return (
    <div className="relative flex flex-col items-center gap-3 rounded-2xl border border-border/50 bg-card/60 p-4 text-center transition-colors hover:border-primary/30 hover:bg-card/80">
      {rank === 1 && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-attention/40 bg-attention/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-attention">
          # Maior projeção
        </span>
      )}

      <Avatar className={`h-12 w-12 border-2 border-border/40 [&_img]:object-contain ${getBadgeScale(player.club.abbreviation) !== 1 ? "overflow-visible" : ""}`}>
        <AvatarImage
          src={getBadgeUrl(player.club.abbreviation, player.club.badgeUrl)}
          style={getBadgeScale(player.club.abbreviation) !== 1 ? { transform: `scale(${getBadgeScale(player.club.abbreviation)})` } : undefined}
        />
        <AvatarFallback className="bg-secondary text-xs font-semibold">
          {player.club.abbreviation?.slice(0, 2) ?? "??"}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 w-full">
        <p className="truncate text-sm font-bold text-foreground leading-tight" title={displayName}>
          {displayName}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
          {player.club.abbreviation ?? player.club.name ?? "—"}
        </p>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-bold ${posColor}`}>
          {player.position}
        </Badge>
        {player.isDifferencial && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-semibold text-purple-400 border-purple-500/30 bg-purple-500/10">
            Diferencial
          </Badge>
        )}
        {player.playProbability != null && player.playProbability < 0.6 && (
          <AlertTriangle className="w-3 h-3 text-attention" />
        )}
      </div>

      <p className="text-2xl font-mono font-bold text-primary leading-none">
        {(player.expectedPoints ?? 0).toFixed(1)}
        <span className="text-xs text-muted-foreground font-normal ml-0.5">pts</span>
      </p>

      {player.price != null && (
        <p className="text-[11px] text-muted-foreground font-mono">
          C$ {player.price.toFixed(2)}
        </p>
      )}
    </div>
  );
}

// ── StatBubble ────────────────────────────────────────────────────────────────

function StatBubble({
  icon: Icon,
  label,
  value,
  variant = "default",
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  variant?: "default" | "good" | "warn" | "info";
}) {
  const colorMap = {
    default: "text-foreground border-border/50",
    good: "text-positive border-positive/30",
    warn: "text-attention border-attention/30",
    info: "text-differential border-differential/30",
  };
  const iconColor = {
    default: "text-muted-foreground",
    good: "text-positive",
    warn: "text-attention",
    info: "text-differential",
  };
  return (
    <Card className={`bg-card/60 border ${colorMap[variant]} rounded-2xl flex-1 min-w-0`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold leading-tight max-w-[140px]">
            {label}
          </p>
          <Icon className={`w-4 h-4 shrink-0 ${iconColor[variant]}`} />
        </div>
        <p className={`text-3xl font-mono font-bold ${colorMap[variant].split(" ")[0]}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Landing() {
  const track = useTrack();

  useEffect(() => {
    const referrer = (() => {
      try {
        const ref = document.referrer;
        if (!ref) return null;
        const url = new URL(ref);
        if (url.hostname === window.location.hostname) return null;
        return url.hostname;
      } catch {
        return null;
      }
    })();
    track("landing_viewed", { referrer });
  }, [track]);

  function handleCta(placement: string) {
    track("signup_cta_clicked", { placement });
    window.location.href = "/api/auth/google";
  }

  const { data: perfData } = useQuery<PerformanceSummary>({
    queryKey: ["stats-performance-landing"],
    queryFn: async () => {
      const r = await fetch("/api/stats/performance");
      if (!r.ok) throw new Error("fail");
      return r.json();
    },
    staleTime: 30 * 60 * 1000,
  });

  const { data: topData, isLoading: topLoading } = useQuery<TopProjectionsResponse>({
    queryKey: ["stats-top-projections"],
    queryFn: async () => {
      const r = await fetch("/api/stats/top-projections");
      if (!r.ok) throw new Error("fail");
      return r.json();
    },
    staleTime: 10 * 60 * 1000,
  });

  const lastRoundMae = (() => {
    if (!perfData?.byRound?.length) return null;
    const last = [...perfData.byRound].sort((a, b) => b.round - a.round)[0];
    return last?.mae ?? null;
  })();

  const season = perfData?.season;
  const differentials = perfData?.differentials;

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="bg-primary/20 p-1.5 rounded-lg border border-primary/30 group-hover:bg-primary/30 transition-colors">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <span className="font-display font-bold text-lg text-foreground leading-none">
              Mito<span className="text-primary">metro</span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground text-sm"
              onClick={() => { window.location.href = "/api/auth/google"; }}
            >
              Entrar
            </Button>
            <Button
              size="sm"
              className="bg-gradient-to-r from-primary to-accent font-semibold text-sm gap-1.5 shadow-md shadow-primary/20"
              onClick={() => handleCta("header")}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Criar conta grátis</span>
              <span className="sm:hidden">Entrar</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 space-y-20 py-14 sm:py-20">

        {/* ── Hero ───────────────────────────────────────────────────────────── */}
        <section className="text-center space-y-6 max-w-3xl mx-auto">
          <div className="flex items-center justify-center gap-2">
            <Badge
              variant="outline"
              className="border-primary/40 text-primary bg-primary/5 gap-1.5 text-xs font-semibold uppercase tracking-wide"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Projeções ao vivo — Cartola FC 2026
            </Badge>
          </div>

          <h1 className="text-4xl sm:text-6xl font-display font-bold tracking-tight text-foreground leading-tight">
            Escale melhor.{" "}
            <span className="text-primary">Baseado em dados reais.</span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            Algoritmo de projeção com{" "}
            {lastRoundMae != null ? (
              <>
                erro médio de{" "}
                <span className="font-mono font-bold text-foreground">
                  {lastRoundMae.toFixed(1)} pts
                </span>{" "}
                na última rodada —{" "}
              </>
            ) : (
              "dados históricos calculados — "
            )}
            sem achismos, sem influenciadores. Só matemática.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              size="lg"
              className="bg-gradient-to-r from-primary to-accent font-semibold gap-2 shadow-lg shadow-primary/25 w-full sm:w-auto text-base h-12 px-8"
              onClick={() => handleCta("hero")}
            >
              <Sparkles className="w-4 h-4" />
              Criar conta grátis
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="gap-2 w-full sm:w-auto text-base h-12 px-8 text-muted-foreground hover:text-foreground border-border/60"
              asChild
            >
              <Link to="/desempenho">
                <BarChart2 className="w-4 h-4" />
                Ver precisão do modelo
              </Link>
            </Button>
          </div>
        </section>

        {/* ── Top 5 Projeções ─────────────────────────────────────────────────── */}
        <section className="space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-2xl sm:text-3xl font-display font-bold text-foreground">
              Top 5 projeções{topData?.round ? ` — Rodada ${topData.round}` : ""}
            </h2>
            <p className="text-sm text-muted-foreground">
              Visível sem login. Acesse a lista completa com uma conta grátis.
            </p>
          </div>

          {topLoading ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground py-12">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm">Carregando projeções…</span>
            </div>
          ) : topData?.players?.length ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                {topData.players.map((player, i) => (
                  <TopPlayerCard key={player.playerId} player={player} rank={i + 1} />
                ))}
              </div>
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/50 bg-secondary/20 py-6 px-4 text-center">
                <Zap className="w-5 h-5 text-primary" />
                <p className="text-sm text-muted-foreground max-w-md">
                  Desbloqueie projeções completas de{" "}
                  <span className="text-foreground font-semibold">816 jogadores</span>,
                  Diferenciais da rodada, análise de risco e escudo automático com uma conta grátis.
                </p>
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-primary to-accent gap-1.5 font-semibold"
                  onClick={() => handleCta("top5_unlock")}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Criar conta grátis
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
              <BarChart2 className="w-8 h-8 opacity-20" />
              <p className="text-sm">Projeções disponíveis a partir da rodada 1.</p>
            </div>
          )}
        </section>

        {/* ── Prova: mini-resumo do desempenho ──────────────────────────────── */}
        {season && !perfData?.empty && (
          <section className="space-y-6">
            <div className="text-center space-y-1">
              <h2 className="text-2xl sm:text-3xl font-display font-bold text-foreground">
                Transparência total
              </h2>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                Todo modelo erra. Aqui você vê exatamente quanto — sem cherry-picking.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 sm:gap-4">
              <StatBubble
                icon={Target}
                label="Rodadas analisadas"
                value={String(season.totalRounds)}
                variant="info"
              />
              <StatBubble
                icon={TrendingUp}
                label="Erro médio (MAE)"
                value={`${season.mae.toFixed(1)} pts`}
                variant={season.mae < 4 ? "good" : "warn"}
              />
              {differentials && (
                <StatBubble
                  icon={CheckCircle2}
                  label="Acerto nos diferenciais"
                  value={`${differentials.hitRate.toFixed(0)}%`}
                  variant={differentials.hitRate >= 50 ? "good" : "warn"}
                />
              )}
            </div>

            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-muted-foreground hover:text-foreground"
                asChild
              >
                <Link to="/desempenho">
                  Ver desempenho completo
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </Button>
            </div>
          </section>
        )}

        {/* ── Features rápidas ──────────────────────────────────────────────── */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            {
              icon: Zap,
              title: "Escalação automática",
              desc: "ILP (programação linear) monta o melhor time dentro do seu orçamento.",
            },
            {
              icon: Target,
              title: "Diferenciais da rodada",
              desc: "Jogadores com alta projeção e baixa escala — vantagem real na pontuação.",
            },
            {
              icon: BarChart2,
              title: "Histórico e tendências",
              desc: "Pontuações reais, valorização e evolução do elenco rodada a rodada.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <Card key={title} className="bg-card/60 border-border/50 rounded-2xl">
              <CardContent className="p-5 space-y-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground text-sm">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* ── Footer CTA ────────────────────────────────────────────────────── */}
        <section className="text-center space-y-5 rounded-3xl border border-primary/20 bg-primary/5 py-12 px-6">
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-foreground">
            Pronto para escalar melhor?
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Conta grátis. Sem cartão de crédito. Projeções disponíveis a partir da próxima rodada.
          </p>
          <Button
            size="lg"
            className="bg-gradient-to-r from-primary to-accent font-semibold gap-2 shadow-lg shadow-primary/25 h-12 px-8 text-base"
            onClick={() => handleCta("footer")}
          >
            <Sparkles className="w-4 h-4" />
            Criar conta grátis
            <ArrowRight className="w-4 h-4" />
          </Button>
          <p className="text-[11px] text-muted-foreground/60">
            Dados do Cartola FC 2026 · Algoritmo atualizado a cada rodada
          </p>
        </section>
      </main>

      {/* ── Rodapé ────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/30 mt-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-primary" />
            Mitometro · Cartola FC Analytics
          </span>
          <div className="flex items-center gap-4">
            <Link to="/desempenho" className="hover:text-foreground transition-colors">
              Transparência
            </Link>
            <a href="/api/auth/google" className="hover:text-foreground transition-colors">
              Entrar
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
