import {
  useGetCurrentRound,
  useGetProvidersStatus,
  useGetCurrentProjections,
  useGetCurrentMatches,
  useGetCurrentAvailability,
  useGetAdminConfig,
  type ProjectionItem,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  Clock,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Zap,
  Trophy,
  AlertTriangle,
  Calendar,
  Users,
  AlertCircle,
  Sparkles,
  Bomb,
} from "lucide-react";
import { getPositionColor } from "@/hooks/use-custom-api";
import { isDifferentialPlayer, isTrapPlayer, getTopBadges, type ExplanationJson } from "@/lib/explainPlayer";
import { PlayerBadges } from "@/components/PlayerCard";
import { getBadgeUrl, getBadgeScale } from "@/lib/clubColors";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

type PlayerField = string | number | boolean | null | undefined;

function getPlayerField(proj: ProjectionItem, field: string): PlayerField {
  const p = proj.player as Record<string, unknown> | null | undefined;
  return p ? (p[field] as PlayerField) : null;
}

function getPlayerName(proj: ProjectionItem): string {
  const p = proj.player as Record<string, unknown> | null | undefined;
  if (!p) return "—";
  return ((p["nickname"] as string | null | undefined) ?? (p["name"] as string | null | undefined)) ?? "—";
}

function getNestedField(proj: ProjectionItem, parent: string, field: string): PlayerField {
  const p = proj.player as Record<string, unknown> | null | undefined;
  if (!p) return null;
  const nested = p[parent] as Record<string, unknown> | null | undefined;
  return nested ? (nested[field] as PlayerField) : null;
}

function formatMatchDateTime(value: string | Date | null | undefined): string {
  if (!value) return "Data a definir";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data a definir";
  return date.toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

type MatchClub = { name?: string | null; shortName?: string | null; abbreviation?: string | null; badgeUrl?: string | null } | null | undefined;

function ClubBadge({ club }: { club: MatchClub }) {
  if (club?.badgeUrl || (club?.abbreviation && getBadgeUrl(club.abbreviation, null))) {
    return (
      <img
        src={getBadgeUrl(club?.abbreviation, club?.badgeUrl)}
        alt={club.name ?? ""}
        className="w-6 h-6 object-contain shrink-0"
        style={getBadgeScale(club?.abbreviation) !== 1 ? { transform: `scale(${getBadgeScale(club?.abbreviation)})` } : undefined}
        loading="lazy"
      />
    );
  }
  return (
    <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
      {(club?.abbreviation ?? club?.name ?? "?").slice(0, 3).toUpperCase()}
    </div>
  );
}

/**
 * ProjectionItem augmented with explanationJson.
 * The generated type omits this field, but the /players/projections/current
 * endpoint spreads the full DB row, so the field IS present at runtime.
 */
type RichProjectionItem = ProjectionItem & { explanationJson?: ExplanationJson };

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: roundData, isLoading: roundLoading, isError: roundError } = useGetCurrentRound();
  const { data: providersData, isError: providersError } = useGetProvidersStatus();
  const { data: projectionsData, isLoading: projLoading, isError: projError } = useGetCurrentProjections({
    round: roundData?.round ?? undefined,
  });
  const { data: matchesData, isLoading: matchesLoading, isError: matchesError } = useGetCurrentMatches();
  const { data: availabilityData, isLoading: availabilityLoading, isError: availabilityError } = useGetCurrentAvailability({});
  const { data: configData } = useGetAdminConfig();

  const providers = providersData?.providers ?? [];
  const projections = (projectionsData?.projections ?? []) as RichProjectionItem[];
  const matches = matchesData?.matches ?? [];
  const availabilityList = availabilityData?.availability ?? [];
  const availableCount = availabilityList.filter(
    (a) => (a.playProbability ?? 0) >= 0.5
  ).length;

  const projByPlayerId = new Map(
    projections.map((p) => [p.playerId, p])
  );

  const getExplanation = (p: RichProjectionItem): ExplanationJson =>
    p.explanationJson ?? {};

  const diferenciais = projections
    .filter((p) => isDifferentialPlayer(getExplanation(p)))
    .sort((a, b) => {
      const popA = getExplanation(a).popularity ?? 1;
      const popB = getExplanation(b).popularity ?? 1;
      return popA - popB; // menor escalação = mais diferencial
    })
    .slice(0, 5);

  const armadilhas = projections
    .filter((p) => isTrapPlayer(getExplanation(p)))
    .sort((a, b) => {
      const popA = getExplanation(a).popularity ?? 0;
      const popB = getExplanation(b).popularity ?? 0;
      return popB - popA;
    })
    .slice(0, 5);

  const getTopByPos = (pos: string, limit = 3) => {
    return projections
      .filter((p) => getPlayerField(p, "position") === pos)
      .sort((a, b) => (b.expectedPoints ?? 0) - (a.expectedPoints ?? 0))
      .slice(0, limit);
  };

  type AvailabilityPlayer = Record<string, unknown> | null | undefined;

  const riskAlerts = availabilityList
    .filter((a) => typeof a.playProbability === "number" && a.playProbability < 0.5)
    .sort((a, b) => (a.playProbability ?? 1) - (b.playProbability ?? 1))
    .slice(0, 6)
    .map((a) => {
      const proj = a.playerId != null ? projByPlayerId.get(a.playerId) : undefined;
      const playerFromProj = proj?.player as AvailabilityPlayer;
      const playerFromAvail = a.player as AvailabilityPlayer;
      const player = playerFromProj ?? playerFromAvail;
      return { ...a, _player: player, _proj: proj };
    });

  const positions = ["ATA", "MEI", "LAT", "ZAG", "GOL", "TEC"];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Hero Section */}
      <div className="relative rounded-3xl overflow-hidden border border-border/50 shadow-2xl bg-card">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
        </div>

        <div className="relative z-10 p-8 md:p-12 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="space-y-4 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-primary text-sm font-semibold shadow-[0_0_15px_hsl(var(--positive) / 0.2)]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Motor de Inteligência Ativo
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-extrabold text-white tracking-tight leading-tight">
              Domine o <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">Mercado</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
              Projeções avançadas e otimização estatística para montar o time perfeito no Cartola FC.
            </p>
          </div>

          <Card className="w-full md:w-80 bg-background/60 backdrop-blur-xl border-border/50 shadow-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                Status do Mercado
                {roundData?.marketOpen ? (
                  <ShieldCheck className="w-5 h-5 text-primary" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-destructive" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {roundError ? (
                <div className="flex items-center gap-2 text-destructive text-sm p-2 rounded bg-destructive/10">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Erro ao carregar rodada
                </div>
              ) : roundLoading ? (
                <div className="h-16 flex items-center justify-center text-muted-foreground">Carregando...</div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-4xl font-display font-bold text-foreground">Rodada {roundData?.round ?? "?"}</span>
                    <Badge variant={roundData?.marketOpen ? "default" : "destructive"} className="shadow-lg font-bold px-3">
                      {roundData?.marketOpen ? "ABERTO" : "FECHADO"}
                    </Badge>
                  </div>
                  {roundData?.closingDate && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary/50 p-2 rounded-lg border border-border">
                      <Clock className="w-4 h-4" />
                      Fecha: {new Date(roundData.closingDate).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </div>
                  )}
                  <Button className="w-full shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all font-bold group" asChild>
                    <Link to="/escalacao">
                      Otimizar Escalação
                      <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>


      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Jogadores Disponíveis</p>
              {availabilityError ? (
                <p className="text-sm text-destructive font-medium">Erro</p>
              ) : (
                <p className="text-2xl font-mono font-bold text-foreground">{availableCount > 0 ? availableCount : projections.length}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-accent/10 border border-accent/20">
              <Trophy className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Com Projeção</p>
              <p className="text-2xl font-mono font-bold text-foreground">{projections.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-attention/10 border border-attention/20">
              <AlertTriangle className="w-5 h-5 text-attention" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Alertas de Risco</p>
              <p className="text-2xl font-mono font-bold text-foreground">{riskAlerts.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-differential/10 border border-differential/20">
              <Calendar className="w-5 h-5 text-differential" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Partidas</p>
              <p className="text-2xl font-mono font-bold text-foreground">{matches.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Top Players by Position */}
        <div className="col-span-1 lg:col-span-2 space-y-6">
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-display font-bold">Melhores Projeções</h2>
          </div>

          {projError ? (
            user ? (
              <div className="flex items-center gap-2 text-destructive text-sm p-4 rounded-2xl bg-destructive/10 border border-destructive/30">
                <AlertCircle className="w-5 h-5 shrink-0" />
                Erro ao carregar projeções. Verifique se o sistema de dados está funcionando.
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-card border border-border/50 text-center">
                <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                  <Trophy className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-foreground">Projeções disponíveis para membros</p>
                  <p className="text-sm text-muted-foreground mt-1">Faça login para ver as melhores projeções e otimizar seu time no Cartola FC.</p>
                </div>
                <a
                  href="/api/auth/google"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/40 text-primary hover:bg-primary/10 text-sm font-bold transition-colors"
                >
                  Entrar com Google
                </a>
              </div>
            )
          ) : projLoading ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground bg-card rounded-2xl border border-border">
              <div className="flex flex-col items-center gap-2">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Calculando projeções...
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {positions.map((pos) => {
                const tops = getTopByPos(pos, 5);
                if (!tops.length) return null;

                return (
                  <Card key={pos} className="bg-card hover:border-border transition-colors group overflow-hidden">
                    <div
                      className={`h-1 w-full bg-gradient-to-r ${
                        pos === "ATA"
                          ? "from-danger"
                          : pos === "MEI"
                            ? "from-purple-500"
                            : pos === "LAT"
                              ? "from-cyan-500"
                              : pos === "ZAG"
                                ? "from-differential"
                                : pos === "GOL"
                                  ? "from-attention"
                                  : "from-positive"
                      } to-transparent`}
                    />
                    <CardHeader className="py-3 px-4 flex flex-row items-center justify-between bg-secondary/20">
                      <Badge variant="outline" className={`font-mono text-xs ${getPositionColor(pos)} border`}>
                        {pos}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Top 5</span>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y divide-border/50">
                        {tops.map((p, idx) => (
                          <div key={p.id} className="p-3 px-4 flex items-center justify-between hover:bg-secondary/40 transition-colors">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <span className="text-xs font-bold text-muted-foreground w-3">{idx + 1}</span>
                              <div className="truncate">
                                <p className="font-semibold text-sm truncate text-foreground">
                                  {getPlayerName(p)}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {getNestedField(p, "club", "name") as string}
                                </p>
                              </div>
                            </div>
                            <div className="text-right pl-2 shrink-0">
                              <p className="font-bold text-primary font-mono">
                                {p.expectedPoints?.toFixed(1)}{" "}
                                <span className="text-[10px] text-muted-foreground">pts</span>
                              </p>
                              <p className="text-xs text-muted-foreground">
                                C$ {(getPlayerField(p, "price") as number | null)?.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Risk Alerts */}
          {availabilityLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm p-3">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
              Carregando alertas de risco...
            </div>
          ) : availabilityError ? (
            <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-xl bg-destructive/10 border border-destructive/30">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Erro ao carregar dados de disponibilidade
            </div>
          ) : riskAlerts.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-attention" />
                <h3 className="text-lg font-display font-bold">Alertas de Risco</h3>
                <span className="text-xs text-muted-foreground">(jogadores com baixa probabilidade de jogar)</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {riskAlerts.map((alert) => {
                  const numProb = alert.playProbability ?? 0;
                  const riskScore = alert._proj?.riskScore ?? null;
                  const playerName = (alert._player?.["nickname"] as string | undefined) ?? (alert._player?.["name"] as string | undefined) ?? "Desconhecido";
                  const clubName = (alert._player?.["club"] as Record<string, unknown> | undefined)?.["name"] as string | undefined;
                  const position = (alert._player?.["position"] as string | undefined) ?? "";
                  return (
                    <div
                      key={alert.id ?? alert.playerId}
                      className="flex items-center justify-between p-3 rounded-xl border border-attention/20 bg-attention/5"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-attention/20">
                          <AlertTriangle className="w-3.5 h-3.5 text-attention" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{playerName}</p>
                          <p className="text-xs text-muted-foreground">
                            {clubName ?? "—"} · {position}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono font-bold text-attention">{(numProb * 100).toFixed(0)}%</p>
                        {riskScore !== null && (
                          <p className="text-[10px] text-muted-foreground">risco: {riskScore.toFixed(2)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Diferenciais da Rodada */}
          {!projLoading && !projError && diferenciais.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent" />
                <h3 className="text-lg font-display font-bold">Diferenciais da Rodada</h3>
                <span className="text-xs text-muted-foreground">(alta projeção, baixa escalação)</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {diferenciais.map((p) => {
                  const exp = getExplanation(p);
                  const pop = exp.popularity ?? 0;
                  const name = getPlayerName(p);
                  const clubName = getNestedField(p, "club", "name") as string | undefined;
                  const position = getPlayerField(p, "position") as string | undefined;
                  const badges = getTopBadges(exp);
                  return (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-accent/20 bg-accent/5">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-accent/20">
                          <Sparkles className="w-3.5 h-3.5 text-accent" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            {clubName ?? "—"} · {position ? <Badge variant="outline" className={`font-mono text-[9px] px-1 py-0 ${getPositionColor(position)} border`}>{position}</Badge> : null}
                          </p>
                          <PlayerBadges badges={badges} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono font-bold text-accent">{p.expectedPoints?.toFixed(1)} pts</p>
                        <p className="text-[10px] text-muted-foreground">escal.: {(pop * 100).toFixed(0)}%</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Armadilhas da Rodada */}
          {!projLoading && !projError && armadilhas.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Bomb className="w-5 h-5 text-destructive" />
                <h3 className="text-lg font-display font-bold">Armadilhas da Rodada</h3>
                <span className="text-xs text-muted-foreground">(muito escalados, forma em queda)</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {armadilhas.map((p) => {
                  const exp = getExplanation(p);
                  const pop = exp.popularity ?? 0;
                  const name = getPlayerName(p);
                  const clubName = getNestedField(p, "club", "name") as string | undefined;
                  const position = getPlayerField(p, "position") as string | undefined;
                  const badges = getTopBadges(exp);
                  return (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-xl border border-destructive/20 bg-destructive/5">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-destructive/20">
                          <Bomb className="w-3.5 h-3.5 text-destructive" />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">
                            {clubName ?? "—"} · {position}
                          </p>
                          <PlayerBadges badges={badges} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono font-bold text-destructive">{(pop * 100).toFixed(0)}% escalado</p>
                        <p className="text-[10px] text-muted-foreground">{p.expectedPoints?.toFixed(1)} pts proj.</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          {/* Data Pipeline Status — admin only */}
          {isAdmin && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Activity className="w-6 h-6 text-accent" />
                <h2 className="text-2xl font-display font-bold">Pipeline</h2>
              </div>

              {providersError ? (
                <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-xl bg-destructive/10 border border-destructive/30">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  Erro ao carregar status dos provedores
                </div>
              ) : (
                <div className="space-y-3">
                  {providers.map((provider) => (
                    <Card key={provider.source} className="bg-card border-border/50 overflow-hidden">
                      <div className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-2.5 h-2.5 rounded-full ${
                              provider.status === "ok"
                                ? "bg-primary shadow-[0_0_8px_hsl(var(--positive) / 0.5)]"
                                : provider.status === "error"
                                  ? "bg-destructive shadow-[0_0_8px_hsl(var(--danger) / 0.5)]"
                                  : "bg-attention"
                            }`}
                          />
                          <div>
                            <h4 className="font-semibold text-sm capitalize">{provider.source.replace(/_/g, " ")}</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {provider.lastCollectedAt
                                ? new Date(provider.lastCollectedAt).toLocaleTimeString("pt-BR")
                                : "Nunca sincronizado"}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={
                            provider.status === "ok" ? "default" : provider.status === "error" ? "destructive" : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {provider.status === "ok" ? "ok" : provider.status === "error" ? "erro" : "degradado"}
                        </Badge>
                      </div>
                    </Card>
                  ))}

                  <Button variant="outline" className="w-full bg-secondary/30 hover:bg-secondary font-semibold" asChild>
                    <Link to="/admin">
                      <Zap className="w-4 h-4 ml-2 text-accent mr-2" />
                      Gerenciar Pipeline
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Matches/Fixtures */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />
              <h3 className="text-xl font-display font-bold">Partidas</h3>
            </div>

            {/* Lineup deadline / round status */}
            {roundData?.closingDate && (
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-sm ${
                  roundData.marketOpen
                    ? "border-primary/40 bg-primary/10"
                    : "border-destructive/40 bg-destructive/10"
                }`}
              >
                <Clock
                  className={`w-4 h-4 shrink-0 ${
                    roundData.marketOpen ? "text-primary" : "text-destructive"
                  }`}
                />
                <div className="min-w-0">
                  <p className="font-semibold leading-tight">
                    {roundData.marketOpen
                      ? "Escalações encerram em"
                      : "Rodada fechada — mercado encerrado"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {formatMatchDateTime(roundData.closingDate)}
                  </p>
                </div>
              </div>
            )}

            {matchesLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm p-3">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                Carregando partidas...
              </div>
            ) : matchesError ? (
              <div className="flex items-center gap-2 text-destructive text-sm p-3 rounded-xl bg-destructive/10 border border-destructive/30">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Erro ao carregar partidas
              </div>
            ) : matches.length === 0 ? (
              <p className="text-sm text-muted-foreground p-3">Nenhuma partida disponível para esta rodada.</p>
            ) : (
              <div className="space-y-2">
                {matches.map((match) => (
                  <Card key={match.id} className="bg-card border-border/50">
                    <div className="p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-1 items-center justify-end gap-2 min-w-0">
                          <p className="font-semibold text-sm truncate">{match.homeClub?.name ?? "?"}</p>
                          <ClubBadge club={match.homeClub} />
                        </div>
                        <div className="px-2 py-1 rounded-lg bg-secondary text-xs font-bold font-mono text-muted-foreground whitespace-nowrap">
                          vs
                        </div>
                        <div className="flex flex-1 items-center justify-start gap-2 min-w-0">
                          <ClubBadge club={match.awayClub} />
                          <p className="font-semibold text-sm truncate">{match.awayClub?.name ?? "?"}</p>
                        </div>
                      </div>
                      {(match.matchDate || match.stadium) && (
                        <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground border-t border-border/40 pt-2">
                          {match.matchDate && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 shrink-0" />
                              {formatMatchDateTime(match.matchDate)}
                            </span>
                          )}
                          {match.stadium && (
                            <span className="truncate max-w-[45%]">{match.stadium}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
