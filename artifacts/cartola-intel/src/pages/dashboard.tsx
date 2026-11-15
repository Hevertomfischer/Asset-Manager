import {
  useGetCurrentRound,
  useGetCurrentProjections,
  getGetCurrentProjectionsQueryKey,
  useGetCurrentMatches,
  useGetCurrentAvailability,
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
import { isDifferentialHighlight, label as popularityLabel, POPULARITY_RULES } from "@/lib/popularityRules";
import { PlayerBadges } from "@/components/PlayerCard";
import { PopularityCalibrationCard } from "@/components/PopularityCalibrationCard";
import { usePopularityFeatures } from "@/hooks/usePopularityFeatures";
import { getBadgeUrl, getBadgeScale } from "@/lib/clubColors";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { PageSkeleton } from "@/components/states/PageSkeleton";
import { ErrorState } from "@/components/states/ErrorState";
import { EmptyState } from "@/components/states/EmptyState";
import { SyncStatusCard } from "@/components/SyncStatusCard";
import { ProGate } from "@/components/ProGate";

function isAccessError(error: unknown): boolean {
  return !!error && typeof error === "object" && "status" in error &&
    [401, 402, 403].includes(Number(error.status));
}

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
    <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
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
  const { enabled: popularityFeaturesEnabled } = usePopularityFeatures();
  const { user, isPro, isLoading: authLoading } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: roundData, isLoading: roundLoading, isError: roundError, error: roundFailure, refetch: refetchRound } = useGetCurrentRound();
  const { data: projectionsData, isLoading: projLoading, isError: projError, error: projFailure, refetch: refetchProjections } = useGetCurrentProjections({
    round: roundData?.round ?? undefined,
  }, { query: {
    queryKey: [...getGetCurrentProjectionsQueryKey({ round: roundData?.round }), user?.id ?? "anonymous", isPro],
    enabled: !authLoading,
    retry: (count, error) => !isAccessError(error) && count < 2,
  } });
  const { data: matchesData, isLoading: matchesLoading, isError: matchesError, error: matchesFailure, refetch: refetchMatches } = useGetCurrentMatches();
  const { data: availabilityData, isLoading: availabilityLoading, isError: availabilityError, refetch: refetchAvailability } = useGetCurrentAvailability({});
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
    .filter((p) => isDifferentialHighlight({ ...getExplanation(p), expectedPoints: p.expectedPoints }))
    .sort((a, b) => {
      const popA = getExplanation(a).popularity ?? 1;
      const popB = getExplanation(b).popularity ?? 1;
      return popA - popB; // menor escalação = mais diferencial
    })
    .slice(0, POPULARITY_RULES.highlightLimit);

  const armadilhas = projections
    .filter((p) => isTrapPlayer(getExplanation(p)))
    .sort((a, b) => {
      const popA = getExplanation(a).popularity ?? -1;
      const popB = getExplanation(b).popularity ?? -1;
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

  const primaryLoading = authLoading || roundLoading || projLoading || matchesLoading;
  const primaryError = (roundError && !isAccessError(roundFailure)) ||
    (projError && !isAccessError(projFailure)) || (matchesError && !isAccessError(matchesFailure));
  const syncStatusCard = <SyncStatusCard isAdmin={isAdmin} />;
  if (primaryLoading) return <PageSkeleton variant="cards" aria-label="Carregando painel" />;
  if (primaryError) {
    return (
      <div className="space-y-6">{syncStatusCard}<ErrorState
        title="Não foi possível carregar o painel"
        description="Os dados principais do painel não puderam ser carregados."
        onRetry={() => Promise.all([refetchRound(), refetchProjections(), refetchMatches()])}
      /></div>
    );
  }
  if (projections.length === 0 && !isAccessError(projFailure)) {
    return (
      <div className="space-y-6">{syncStatusCard}<EmptyState
        icon={Activity}
        title="Ainda não há projeções para esta rodada"
        description="Consulte o histórico enquanto os dados da rodada são preparados."
        actionLabel="Ver histórico"
        actionHref="/historico"
      /></div>
    );
  }

  return (
    <div className="space-y-8 motion-safe:animate-in fade-in slide-in-from-bottom-4 motion-safe:duration-500">
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
                <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
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
              <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center justify-between">
                Status do Mercado
                {roundData?.marketOpen ? (
                  <ShieldCheck className="w-5 h-5 text-primary" />
                ) : (
                  <ShieldAlert className="w-5 h-5 text-destructive" />
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
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
                  <Button className="w-full shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 motion-safe:transition-all font-bold group" asChild>
                    <Link to={roundData?.marketOpen ? "/escalacao" : "/historico"}>
                      {roundData?.marketOpen ? "Otimizar Escalação" : "Ver parciais e resultados"}
                      <ArrowRight className="w-4 h-4 ml-2 motion-safe:group-hover:translate-x-1 motion-safe:transition-transform" />
                    </Link>
                  </Button>
              </div>
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
              <p className="text-xs text-muted-foreground font-semibold">Jogadores disponíveis</p>
              <p className="text-2xl font-mono tabular-nums font-bold text-foreground">{availableCount > 0 ? availableCount : projections.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-accent/10 border border-accent/20">
              <Trophy className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold">Com projeção</p>
              <p className="text-2xl font-mono tabular-nums font-bold text-foreground">{projections.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-attention/10 border border-attention/20">
              <AlertTriangle className="w-5 h-5 text-attention" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold">Alertas de risco</p>
              <p className="text-2xl font-mono tabular-nums font-bold text-foreground">{riskAlerts.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-differential/10 border border-differential/20">
              <Calendar className="w-5 h-5 text-differential" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold">Partidas</p>
              <p className="text-2xl font-mono tabular-nums font-bold text-foreground">{matches.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Top Players by Position */}
        <div className="col-span-1 lg:col-span-2 space-y-6">
          <div className="flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-display font-bold">Melhores projeções</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {isAccessError(projFailure) && (
                <Card className="md:col-span-2">
                  <CardContent className="p-4 space-y-3">
                    <p className="text-sm">Não foi possível acessar as projeções agora. As projeções básicas estão disponíveis para todos.</p>
                    <Button variant="outline" onClick={() => refetchProjections()}>Tentar novamente</Button>
                  </CardContent>
                </Card>
              )}
              {positions.map((pos) => {
                const tops = getTopByPos(pos, 5);
                if (!tops.length) return null;

                return (
                  <Card key={pos} className="bg-card hover:border-border motion-safe:transition-colors group overflow-hidden">
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
                      <span className="text-xs text-muted-foreground font-medium">Top 5</span>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="divide-y divide-border/50">
                        {tops.map((p, idx) => (
                          <div key={p.id} className="p-3 px-4 flex items-center justify-between hover:bg-secondary/40 motion-safe:transition-colors">
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
                                <span className="text-xs text-muted-foreground">pts</span>
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

          {/* Risk Alerts */}
          {availabilityLoading ? (
            <PageSkeleton variant="list" aria-label="Carregando alertas de risco" />
          ) : availabilityError ? (
            <ErrorState
              title="Disponibilidade indisponível"
              description="Não foi possível carregar os alertas de disponibilidade."
              onRetry={refetchAvailability}
            />
          ) : riskAlerts.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-attention" />
                <h3 className="text-lg font-display font-bold">Alertas de risco</h3>
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
                          <p className="text-xs text-muted-foreground tabular-nums">risco: {riskScore.toFixed(2)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Diferenciais da Rodada */}
          {!popularityFeaturesEnabled && <PopularityCalibrationCard />}
          {popularityFeaturesEnabled && !isPro && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ProGate message={`${projectionsData?.proTeaser.differentials ?? 0} diferenciais nesta rodada`}>
                <Card className="min-h-56"><CardHeader><CardTitle>Diferenciais da rodada</CardTitle></CardHeader></Card>
              </ProGate>
              <ProGate message={`${projectionsData?.proTeaser.traps ?? 0} armadilhas nesta rodada`}>
                <Card className="min-h-56"><CardHeader><CardTitle>Armadilhas da rodada</CardTitle></CardHeader></Card>
              </ProGate>
            </div>
          )}
          {popularityFeaturesEnabled && isPro && diferenciais.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent" />
                <h3 className="text-lg font-display font-bold">Diferenciais da rodada</h3>
                <span className="text-xs text-muted-foreground">(alta projeção, baixa escalação)</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {diferenciais.map((p) => {
                  const exp = getExplanation(p);
                  const popLabel = popularityLabel(exp);
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
                            {clubName ?? "—"} · {position ? <Badge variant="outline" className={`font-mono text-xs px-1 py-0 ${getPositionColor(position)} border`}>{position}</Badge> : null}
                          </p>
                          <PlayerBadges badges={badges} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono font-bold text-accent">{p.expectedPoints?.toFixed(1)} pts</p>
                        <p className="text-xs text-muted-foreground tabular-nums">{popLabel}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Armadilhas da Rodada */}
          {popularityFeaturesEnabled && isPro && armadilhas.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Bomb className="w-5 h-5 text-destructive" />
                <h3 className="text-lg font-display font-bold">Armadilhas da rodada</h3>
                <span className="text-xs text-muted-foreground">(muito escalados, forma em queda)</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {armadilhas.map((p) => {
                  const exp = getExplanation(p);
                  const popLabel = popularityLabel(exp);
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
                        <p className="text-sm font-mono font-bold text-destructive">{popLabel}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">{p.expectedPoints?.toFixed(1)} pts proj.</p>
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
          {syncStatusCard}

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

            {matches.length === 0 ? (
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
