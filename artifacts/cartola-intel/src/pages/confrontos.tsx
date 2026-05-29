import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Swords, AlertCircle, TrendingUp, TrendingDown, Minus, Shield, Target, Zap } from "lucide-react";
import { getPositionColor } from "@/hooks/use-custom-api";

interface ClubStats {
  offensiveStrength: number;
  defensiveStrength: number;
  avgGoalsScored: number;
  avgGoalsConceded: number;
  bestPositions: string[];
}

interface ClubInfo {
  id: number;
  name: string;
  abbreviation: string | null;
  badgeUrl: string | null;
}

interface Confronto {
  matchId: number;
  round: number;
  matchDate: string | null;
  stadium: string | null;
  homeClub: ClubInfo | null;
  awayClub: ClubInfo | null;
  homeStats: ClubStats | null;
  awayStats: ClubStats | null;
  homeForm: string[] | null;
  awayForm: string[] | null;
  homeXg: number | null;
  awayXg: number | null;
  xgSource: "xg_article" | "form_estimate";
  homeGoalExpectation: number;
  awayGoalExpectation: number;
  homeDifficulty: "fácil" | "médio" | "difícil";
  awayDifficulty: "fácil" | "médio" | "difícil";
  recommendedPositionsHome: string[];
  recommendedPositionsAway: string[];
}

interface ConfrontosResponse {
  confrontos: Confronto[];
  round: number;
}

async function fetchConfrontos(): Promise<ConfrontosResponse> {
  const res = await fetch("/api/matches/confrontos");
  if (!res.ok) throw new Error("Failed to fetch confrontos");
  return res.json() as Promise<ConfrontosResponse>;
}

function StrengthBar({ value, label, color }: { value: number; label: string; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono font-bold">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function FormStrip({ form }: { form: string[] | null }) {
  if (!form || form.length === 0) return <span className="text-[10px] text-muted-foreground/50">—</span>;
  return (
    <div className="flex items-center gap-0.5">
      {form.slice(0, 5).map((result, i) => {
        const dotStyle =
          result === "v"
            ? "bg-green-500 border-green-600"
            : result === "e"
            ? "bg-yellow-500 border-yellow-600"
            : "bg-red-500 border-red-600";
        const title = result === "v" ? "Vitória" : result === "e" ? "Empate" : "Derrota";
        return (
          <span
            key={i}
            title={title}
            className={`w-2.5 h-2.5 rounded-full border ${dotStyle} shrink-0`}
          />
        );
      })}
    </div>
  );
}

function DifficultyBadge({ level }: { level: "fácil" | "médio" | "difícil" }) {
  const config = {
    fácil: { className: "bg-green-500/15 text-green-500 border-green-500/30", icon: TrendingUp },
    médio: { className: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30", icon: Minus },
    difícil: { className: "bg-red-500/15 text-red-500 border-red-500/30", icon: TrendingDown },
  };
  const { className, icon: Icon } = config[level];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${className}`}>
      <Icon className="w-3 h-3" />
      {level}
    </span>
  );
}

function ConfrontoCard({ c }: { c: Confronto }) {
  return (
    <Card className="bg-card border-border/50 overflow-hidden hover:border-border/80 transition-colors">
      <div className="h-1 w-full bg-gradient-to-r from-primary/60 via-accent/40 to-primary/20" />
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {c.homeClub?.badgeUrl && (
              <img src={c.homeClub.badgeUrl} alt="" className="w-8 h-8 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            )}
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">{c.homeClub?.name ?? "?"}</p>
              <p className="text-[10px] text-muted-foreground">Casa</p>
            </div>
          </div>

          <div className="flex flex-col items-center shrink-0">
            <span className="text-xs font-bold text-muted-foreground bg-secondary px-3 py-1 rounded-lg">vs</span>
            {c.matchDate && (
              <p className="text-[10px] text-muted-foreground mt-1">
                {new Date(c.matchDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              </p>
            )}
            {c.stadium && (
              <p className="text-[9px] text-muted-foreground/70 truncate max-w-24 text-center">{c.stadium}</p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
            <div className="min-w-0 text-right">
              <p className="font-bold text-sm truncate">{c.awayClub?.name ?? "?"}</p>
              <p className="text-[10px] text-muted-foreground">Visitante</p>
            </div>
            {c.awayClub?.badgeUrl && (
              <img src={c.awayClub.badgeUrl} alt="" className="w-8 h-8 object-contain shrink-0" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Home side */}
          <div className="space-y-3 p-3 rounded-xl bg-secondary/30 border border-border/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {c.homeClub?.abbreviation ?? c.homeClub?.name}
              </span>
              <DifficultyBadge level={c.homeDifficulty} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground shrink-0">Forma:</span>
              <FormStrip form={c.homeForm} />
            </div>
            {c.homeStats && (
              <div className="space-y-2">
                <StrengthBar value={c.homeStats.offensiveStrength} label="Ataque" color="bg-red-500" />
                <StrengthBar value={c.homeStats.defensiveStrength} label="Defesa" color="bg-blue-500" />
                <div className="flex justify-between text-[10px] text-muted-foreground pt-1">
                  <span>{c.homeStats.avgGoalsScored.toFixed(1)} gols/jogo</span>
                  <span>{c.homeStats.avgGoalsConceded.toFixed(1)} sofridos</span>
                </div>
              </div>
            )}
            <div className="flex items-center gap-1 flex-wrap">
              <Target className="w-3 h-3 text-primary shrink-0" />
              <span className="text-[10px] text-muted-foreground">Explorar:</span>
              {c.recommendedPositionsHome.length > 0
                ? c.recommendedPositionsHome.map((pos) => (
                    <Badge key={pos} variant="outline" className={`text-[9px] px-1 py-0 ${getPositionColor(pos)} border`}>
                      {pos}
                    </Badge>
                  ))
                : <span className="text-[10px] text-muted-foreground">—</span>
              }
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">
                {c.xgSource === "xg_article" ? (
                  <span className="inline-flex items-center gap-0.5">
                    <Zap className="w-2.5 h-2.5 text-yellow-400" />
                    xG esperado
                  </span>
                ) : "Expectativa de gols"}
              </p>
              <p className="text-xl font-bold font-mono text-foreground">
                {c.homeXg != null ? c.homeXg.toFixed(2) : c.homeGoalExpectation.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Away side */}
          <div className="space-y-3 p-3 rounded-xl bg-secondary/30 border border-border/30">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {c.awayClub?.abbreviation ?? c.awayClub?.name}
              </span>
              <DifficultyBadge level={c.awayDifficulty} />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground shrink-0">Forma:</span>
              <FormStrip form={c.awayForm} />
            </div>
            {c.awayStats && (
              <div className="space-y-2">
                <StrengthBar value={c.awayStats.offensiveStrength} label="Ataque" color="bg-red-500" />
                <StrengthBar value={c.awayStats.defensiveStrength} label="Defesa" color="bg-blue-500" />
                <div className="flex justify-between text-[10px] text-muted-foreground pt-1">
                  <span>{c.awayStats.avgGoalsScored.toFixed(1)} gols/jogo</span>
                  <span>{c.awayStats.avgGoalsConceded.toFixed(1)} sofridos</span>
                </div>
              </div>
            )}
            <div className="flex items-center gap-1 flex-wrap">
              <Target className="w-3 h-3 text-primary shrink-0" />
              <span className="text-[10px] text-muted-foreground">Explorar:</span>
              {c.recommendedPositionsAway.length > 0
                ? c.recommendedPositionsAway.map((pos) => (
                    <Badge key={pos} variant="outline" className={`text-[9px] px-1 py-0 ${getPositionColor(pos)} border`}>
                      {pos}
                    </Badge>
                  ))
                : <span className="text-[10px] text-muted-foreground">—</span>
              }
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground">
                {c.xgSource === "xg_article" ? (
                  <span className="inline-flex items-center gap-0.5">
                    <Zap className="w-2.5 h-2.5 text-yellow-400" />
                    xG esperado
                  </span>
                ) : "Expectativa de gols"}
              </p>
              <p className="text-xl font-bold font-mono text-foreground">
                {c.awayXg != null ? c.awayXg.toFixed(2) : c.awayGoalExpectation.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Confrontos() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["confrontos"],
    queryFn: fetchConfrontos,
    staleTime: 5 * 60 * 1000,
  });

  const confrontos = data?.confrontos ?? [];
  const round = data?.round;

  const easyMatches = confrontos.filter(
    (c) => c.homeDifficulty === "fácil" || c.awayDifficulty === "fácil"
  ).length;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
              <Swords className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-display font-bold">Confrontos</h1>
              <p className="text-muted-foreground text-sm">
                {round ? `Rodada ${round} — ` : ""}Análise de dificuldade e posições recomendadas por partida
              </p>
            </div>
          </div>
        </div>

        {!isLoading && !isError && confrontos.length > 0 && (
          <div className="flex gap-3">
            <Card className="bg-card border-border/50">
              <CardContent className="p-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <div>
                  <p className="text-[10px] text-muted-foreground">Favoráveis</p>
                  <p className="text-xl font-bold font-mono text-green-500">{easyMatches}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card border-border/50">
              <CardContent className="p-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-accent" />
                <div>
                  <p className="text-[10px] text-muted-foreground">Partidas</p>
                  <p className="text-xl font-bold font-mono">{confrontos.length}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="bg-card border-border/50 h-64 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-center gap-3 p-6 rounded-2xl bg-destructive/10 border border-destructive/30 text-destructive">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-semibold">Erro ao carregar confrontos</p>
            <p className="text-sm opacity-80">Certifique-se de que os dados foram sincronizados no painel Admin.</p>
          </div>
        </div>
      ) : confrontos.length === 0 ? (
        <Card className="bg-card border-border/50">
          <CardContent className="p-12 flex flex-col items-center gap-3 text-center">
            <Swords className="w-12 h-12 text-muted-foreground/30" />
            <p className="font-semibold text-muted-foreground">Nenhum confronto disponível</p>
            <p className="text-sm text-muted-foreground/70">Sincronize os dados na página Admin para carregar os confrontos da rodada.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground bg-card border border-border/50 rounded-2xl p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span><span className="font-semibold text-green-500">Fácil</span> — adversário fraco</span>
            </div>
            <div className="flex items-center gap-2">
              <Minus className="w-4 h-4 text-yellow-500" />
              <span><span className="font-semibold text-yellow-500">Médio</span> — confronto equilibrado</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <span><span className="font-semibold text-red-500">Difícil</span> — adversário forte</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 border border-green-600" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 border border-yellow-600" />
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 border border-red-600" />
              </div>
              <span>Forma: <span className="text-green-500">V</span> / <span className="text-yellow-500">E</span> / <span className="text-red-500">D</span> (últimos 5 jogos)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {confrontos.map((c) => (
              <ConfrontoCard key={c.matchId} c={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
