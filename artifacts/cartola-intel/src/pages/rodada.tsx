import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Zap, AlertTriangle, Trophy, TrendingUp, TrendingDown, Users, Target, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { PublicNav } from "@/components/PublicNav";
import { Badge } from "@/components/ui/badge";
import { getBadgeUrl, getBadgeScale } from "@/lib/clubColors";
import { Button } from "@/components/ui/button";
import { getPositionColor } from "@/lib/positionColors";

// ── Types ─────────────────────────────────────────────────────────────────────

interface RoundPlayer {
  playerId: number;
  slug: string;
  name: string;
  nickname: string | null;
  position: string;
  price: number | null;
  popularity: number;
  expectedPoints: number;
  floorPoints: number | null;
  ceilingPoints: number | null;
  riskScore: number;
  isDifferencial: boolean;
  isTrap: boolean;
  actualPoints?: number | null;
  beatProjection?: boolean | null;
  club: { abbreviation: string | null; badgeUrl: string | null; name: string | null };
}

interface RoundData {
  round: number;
  isClosed: boolean;
  empty?: boolean;
  players: RoundPlayer[];
  topDiferencial: RoundPlayer | null;
  topArmadilha: RoundPlayer | null;
  summary?: { mae: number | null; trapCount: number; differentialHits: number; pairedCount: number } | null;
  generatedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function PosBadge({ pos }: { pos: string }) {
  const cls = getPositionColor(pos);
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold border ${cls}`}>
      {pos}
    </span>
  );
}

function statNum(n: number | null | undefined, decimals = 1) {
  if (n == null) return "—";
  return n.toFixed(decimals);
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RodadaPage() {
  const { numero } = useParams<{ numero: string }>();
  const roundNum = parseInt(numero ?? "", 10);
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading, isError } = useQuery<RoundData>({
    queryKey: ["stats-rodada", roundNum],
    queryFn: async () => {
      const res = await fetch(`/api/stats/rodada/${roundNum}`);
      if (!res.ok) throw new Error("Erro ao carregar dados da rodada");
      return res.json();
    },
    enabled: !isNaN(roundNum),
    staleTime: 10 * 60 * 1000,
  });

  // JSON-LD
  useEffect(() => {
    if (isNaN(roundNum)) return;
    const id = "jsonld-rodada";
    document.getElementById(id)?.remove();
    const script = document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": `Rodada ${roundNum} Cartola FC: Projeções e Análise`,
      "description": `Projeções do modelo, diferencial e armadilha da rodada ${roundNum} do Cartola FC. Análise Mitometro.`,
      "author": { "@type": "Organization", "name": "Mitometro", "url": "https://mitometro.com.br" },
      "publisher": { "@type": "Organization", "name": "Mitometro", "logo": { "@type": "ImageObject", "url": "https://mitometro.com.br/opengraph.jpg" } },
      "datePublished": data?.generatedAt ?? new Date().toISOString(),
    });
    document.head.appendChild(script);
    return () => document.getElementById(id)?.remove();
  }, [roundNum, data]);

  const visiblePlayers = useMemo(() => {
    if (!data) return [];
    return showAll ? data.players : data.players.slice(0, 30);
  }, [data, showAll]);

  if (isNaN(roundNum)) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <PublicNav />
        <div className="flex-1 flex items-center justify-center text-muted-foreground">Rodada inválida.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <div className="border-b border-border/40 bg-card/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Cartola FC</span>
            {data && (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                data.isClosed
                   ? "bg-positive/10 text-positive border-positive/20"
                   : "bg-attention/10 text-attention border-attention/20"
              }`}>
                {data.isClosed ? <Trophy className="w-3 h-3" /> : <Target className="w-3 h-3" />}
                {data.isClosed ? "Encerrada" : "Projeções"}
              </span>
            )}
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight mb-1">
            Rodada {roundNum}
          </h1>
          <p className="text-muted-foreground text-sm">
            {data?.isClosed
              ? "Rodada encerrada — resultado confirmado com análise de projeção vs pontuação real."
              : "Projeções do modelo para esta rodada do Cartola FC."}
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── Loading ───────────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-card/60 animate-pulse" />
            ))}
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {isError && (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center text-muted-foreground">
            Não foi possível carregar os dados desta rodada. Tente novamente mais tarde.
          </div>
        )}

        {/* ── Empty ────────────────────────────────────────────────────────── */}
        {data?.empty && (
          <div className="rounded-2xl border border-border/40 bg-card/60 p-12 text-center space-y-2">
            <Target className="w-10 h-10 text-muted-foreground/40 mx-auto" />
            <p className="font-medium text-foreground">Nenhuma projeção para a rodada {roundNum}</p>
            <p className="text-sm text-muted-foreground">As projeções são geradas próximo ao início de cada rodada.</p>
          </div>
        )}

        {data && !data.empty && (
          <>
            {/* ── Summary metrics (if closed) ────────────────────────────────── */}
            {data.isClosed && data.summary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Erro médio (MAE)", value: data.summary.mae != null ? `${data.summary.mae.toFixed(1)} pts` : "—", Icon: Target, color: "text-primary" },
                  { label: "Jogadores avaliados", value: data.summary.pairedCount.toString(), Icon: Users, color: "text-differential" },
                  { label: "Diferenciais entregues", value: data.summary.differentialHits.toString(), Icon: Zap, color: "text-positive" },
                  { label: "Armadilhas detectadas", value: data.summary.trapCount.toString(), Icon: AlertTriangle, color: "text-danger" },
                ].map(({ label, value, Icon, color }) => (
                  <div key={label} className="bg-card border border-border/50 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className={`w-3.5 h-3.5 ${color}`} />
                      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{label}</span>
                    </div>
                    <span className={`text-xl font-bold font-mono ${color}`}>{value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Highlight cards ─────────────────────────────────────────────── */}
            {(data.topDiferencial || data.topArmadilha) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {data.topDiferencial && (
                  <div className="bg-card border border-positive/20 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Zap className="w-3.5 h-3.5 text-positive" />
                      <span className="text-xs font-bold uppercase tracking-wider text-positive">Diferencial da rodada</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {getBadgeUrl(data.topDiferencial.club.abbreviation, data.topDiferencial.club.badgeUrl) && (
                        <img src={getBadgeUrl(data.topDiferencial.club.abbreviation, data.topDiferencial.club.badgeUrl)} alt="" className="w-10 h-10 object-contain shrink-0" style={getBadgeScale(data.topDiferencial.club.abbreviation) !== 1 ? { transform: `scale(${getBadgeScale(data.topDiferencial.club.abbreviation)})` } : undefined} />
                      )}
                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/jogador/${data.topDiferencial.slug}`}
                          className="font-bold text-foreground hover:text-primary transition-colors truncate block"
                        >
                          {data.topDiferencial.nickname ?? data.topDiferencial.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {data.topDiferencial.position} · {data.topDiferencial.club.abbreviation} · C$ {(data.topDiferencial.price ?? 0).toFixed(1)}
                        </p>
                        <p className="text-xs text-positive/70 mt-1">
                          {(data.topDiferencial.popularity * 100).toFixed(0)}% escalação · baixa exposição
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-bold text-primary font-mono">{data.topDiferencial.expectedPoints.toFixed(1)}</p>
                        <p className="text-[10px] text-muted-foreground">pts proj.</p>
                        {data.isClosed && data.topDiferencial.actualPoints != null && (
                          <p className={`text-sm font-bold font-mono ${data.topDiferencial.actualPoints >= data.topDiferencial.expectedPoints * 0.9 ? "text-positive" : "text-danger"}`}>
                            {data.topDiferencial.actualPoints.toFixed(1)} real
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {data.topArmadilha && (
                  <div className="bg-card border border-danger/20 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <AlertTriangle className="w-3.5 h-3.5 text-danger" />
                      <span className="text-xs font-bold uppercase tracking-wider text-danger">Armadilha da rodada</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {getBadgeUrl(data.topArmadilha.club.abbreviation, data.topArmadilha.club.badgeUrl) && (
                        <img src={getBadgeUrl(data.topArmadilha.club.abbreviation, data.topArmadilha.club.badgeUrl)} alt="" className="w-10 h-10 object-contain shrink-0" style={getBadgeScale(data.topArmadilha.club.abbreviation) !== 1 ? { transform: `scale(${getBadgeScale(data.topArmadilha.club.abbreviation)})` } : undefined} />
                      )}
                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/jogador/${data.topArmadilha.slug}`}
                          className="font-bold text-foreground hover:text-danger transition-colors truncate block"
                        >
                          {data.topArmadilha.nickname ?? data.topArmadilha.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {data.topArmadilha.position} · {data.topArmadilha.club.abbreviation} · C$ {(data.topArmadilha.price ?? 0).toFixed(1)}
                        </p>
                        <p className="text-xs text-danger/70 mt-1">
                          {(data.topArmadilha.popularity * 100).toFixed(0)}% escalação · risco elevado
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-bold text-danger font-mono">{(data.topArmadilha.popularity * 100).toFixed(0)}%</p>
                        <p className="text-[10px] text-muted-foreground">escalação</p>
                        {data.isClosed && data.topArmadilha.actualPoints != null && (
                          <p className={`text-sm font-bold font-mono ${data.topArmadilha.actualPoints >= data.topArmadilha.expectedPoints * 0.9 ? "text-positive" : "text-danger"}`}>
                            {data.topArmadilha.actualPoints.toFixed(1)} real
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Players table ──────────────────────────────────────────────── */}
            <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
                <h2 className="font-semibold text-foreground text-sm">
                  Projeções — {data.players.length} jogadores
                </h2>
                {data.isClosed && (
                  <span className="text-xs text-muted-foreground">Projeção vs Real</span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/40">
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Pos</th>
                      <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Jogador</th>
                      <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Preço</th>
                      <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Escalação</th>
                      <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Projeção</th>
                      {data.isClosed && (
                        <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Real</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {visiblePlayers.map((player) => {
                      const hasActual = data.isClosed && "actualPoints" in player;
                      const beat = hasActual && player.actualPoints != null && player.actualPoints >= player.expectedPoints * 0.9;
                      const flopped = hasActual && player.actualPoints != null && player.actualPoints < player.expectedPoints * 0.5;
                      return (
                        <tr
                          key={player.playerId}
                          className={`hover:bg-muted/30 transition-colors ${
                            player.isDifferencial ? "bg-positive/3" : player.isTrap ? "bg-danger/3" : ""
                          }`}
                        >
                          <td className="px-4 py-3">
                            <PosBadge pos={player.position} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              {getBadgeUrl(player.club.abbreviation, player.club.badgeUrl) && (
                                <img src={getBadgeUrl(player.club.abbreviation, player.club.badgeUrl)} alt="" className="w-5 h-5 object-contain shrink-0" style={getBadgeScale(player.club.abbreviation) !== 1 ? { transform: `scale(${getBadgeScale(player.club.abbreviation)})` } : undefined} />
                              )}
                              <div className="min-w-0">
                                <Link
                                  to={`/jogador/${player.slug}`}
                                  className="font-medium text-foreground hover:text-primary transition-colors truncate block max-w-[130px] sm:max-w-[200px]"
                                >
                                  {player.nickname ?? player.name}
                                </Link>
                                <span className="text-[10px] text-muted-foreground">{player.club.abbreviation}</span>
                              </div>
                              {player.isDifferencial && <Zap className="w-3 h-3 text-positive shrink-0" />}
                              {player.isTrap && <AlertTriangle className="w-3 h-3 text-danger shrink-0" />}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground font-mono text-xs hidden sm:table-cell">
                            C$ {(player.price ?? 0).toFixed(1)}
                          </td>
                          <td className="px-4 py-3 text-right hidden md:table-cell">
                            <span className={`text-xs font-mono ${
                              player.popularity < 0.15 ? "text-positive" : player.popularity >= 0.4 ? "text-attention" : "text-muted-foreground"
                            }`}>
                              {(player.popularity * 100).toFixed(0)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-bold font-mono text-primary">{player.expectedPoints.toFixed(1)}</span>
                          </td>
                          {data.isClosed && (
                            <td className="px-4 py-3 text-right">
                              {hasActual && player.actualPoints != null ? (
                                <div className="flex items-center justify-end gap-1">
                                  {beat ? (
                                    <TrendingUp className="w-3 h-3 text-positive" />
                                  ) : flopped ? (
                                    <TrendingDown className="w-3 h-3 text-danger" />
                                  ) : null}
                                  <span className={`font-bold font-mono ${beat ? "text-positive" : flopped ? "text-danger" : "text-foreground"}`}>
                                    {player.actualPoints.toFixed(1)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {data.players.length > 30 && (
                <div className="px-5 py-3 border-t border-border/40 flex justify-center">
                  <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)} className="text-xs gap-1.5">
                    {showAll ? <><ChevronUp className="w-3.5 h-3.5" /> Mostrar menos</> : <><ChevronDown className="w-3.5 h-3.5" /> Ver todos os {data.players.length} jogadores</>}
                  </Button>
                </div>
              )}
            </div>

            {/* ── CTA ────────────────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8 text-center space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-medium text-primary">
                <Zap className="w-3 h-3" /> Mitometro Pro
              </div>
              <h3 className="text-lg font-bold text-foreground">Quer escalar com o modelo completo?</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Acesse escalação otimizada por ILP, análise detalhada de cada jogador, histórico e muito mais.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button asChild className="bg-positive hover:bg-positive/90 text-positive-foreground shadow-lg shadow-positive/20 gap-1.5">
                  <Link to="/">Criar conta grátis <ArrowRight className="w-3.5 h-3.5" /></Link>
                </Button>
                <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
                  <Link to="/desempenho">Ver desempenho do modelo</Link>
                </Button>
              </div>
            </div>

            {/* ── Footer ─────────────────────────────────────────────────────── */}
            <div className="text-center text-xs text-muted-foreground py-4">
              <Link to="/" className="hover:text-foreground transition-colors">mitometro.com.br</Link>
              {" · "}Dados Cartola FC · Temporada 2025
            </div>
          </>
        )}
      </div>
    </div>
  );
}
