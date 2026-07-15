import { useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from "recharts";
import { Zap, AlertTriangle, TrendingUp, TrendingDown, ArrowRight, BarChart2, Target } from "lucide-react";
import { PublicNav } from "@/components/PublicNav";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

interface HistoryRound {
  round: number;
  expectedPoints: number;
  floorPoints: number | null;
  ceilingPoints: number | null;
  riskScore: number;
  playProbability: number | null;
  formScore: number | null;
  isDifferencial: boolean;
  isTrap: boolean;
  actual: number | null;
  actualGoals: number | null;
  actualAssists: number | null;
  error: number | null;
  absError: number | null;
}

interface PlayerData {
  player: {
    id: number;
    name: string;
    nickname: string | null;
    position: string;
    price: number | null;
    popularity: number | null;
    averagePoints: number | null;
    gamesPlayed: number | null;
    slug: string;
    club: { abbreviation: string | null; badgeUrl: string | null; name: string | null };
  };
  history: HistoryRound[];
  generatedAt: string;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: number }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border/60 rounded-xl shadow-xl p-3 text-xs space-y-1.5 min-w-[120px]">
      <p className="font-semibold text-foreground">Rodada {label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-muted-foreground">{entry.name}</span>
          </div>
          <span className="font-mono font-semibold" style={{ color: entry.color }}>
            {typeof entry.value === "number" ? entry.value.toFixed(1) : "—"} pts
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function JogadorPage() {
  const { slug } = useParams<{ slug: string }>();

  const { data, isLoading, isError } = useQuery<PlayerData>({
    queryKey: ["stats-jogador", slug],
    queryFn: async () => {
      const res = await fetch(`/api/stats/jogador/${slug}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Jogador não encontrado");
      }
      return res.json();
    },
    enabled: !!slug,
    staleTime: 15 * 60 * 1000,
  });

  // JSON-LD
  useEffect(() => {
    if (!data) return;
    const { player } = data;
    const id = "jsonld-jogador";
    document.getElementById(id)?.remove();
    const script = document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      "mainEntity": {
        "@type": "Person",
        "name": player.nickname ?? player.name,
        "description": `${player.position} do ${player.club.name ?? "time"} no Cartola FC. Análise de projeção e histórico Mitometro.`,
        "url": `https://mitometro.com.br/jogador/${player.slug}`,
      },
      "publisher": { "@type": "Organization", "name": "Mitometro", "url": "https://mitometro.com.br" },
    });
    document.head.appendChild(script);
    return () => document.getElementById(id)?.remove();
  }, [data]);

  // ── Derived stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!data) return null;
    const closed = data.history.filter((h) => h.actual != null);
    const avgProj = data.history.length > 0
      ? data.history.reduce((s, h) => s + h.expectedPoints, 0) / data.history.length
      : null;
    const avgActual = closed.length > 0
      ? closed.reduce((s, h) => s + (h.actual ?? 0), 0) / closed.length
      : null;
    const mae = closed.length > 0
      ? closed.reduce((s, h) => s + (h.absError ?? 0), 0) / closed.length
      : null;
    const difCount = data.history.filter((h) => h.isDifferencial).length;
    const trapCount = data.history.filter((h) => h.isTrap).length;
    return { closed: closed.length, avgProj, avgActual, mae, difCount, trapCount };
  }, [data]);

  // Chart data — oldest rounds first
  const chartData = useMemo(() => {
    if (!data) return [];
    return [...data.history]
      .filter((h) => h.actual != null || h.expectedPoints > 0)
      .reverse()
      .map((h) => ({
        round: h.round,
        Projeção: Number(h.expectedPoints.toFixed(1)),
        Real: h.actual != null ? Number(h.actual.toFixed(1)) : undefined,
      }));
  }, [data]);

  const displayName = data?.player.nickname ?? data?.player.name ?? "Jogador";

  return (
    <div className="min-h-screen bg-background">
      <PublicNav />

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      {data && (
        <div className="border-b border-border/40 bg-card/30">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
            <div className="flex items-center gap-5">
              {data.player.club.badgeUrl && (
                <img
                  src={data.player.club.badgeUrl}
                  alt={data.player.club.abbreviation ?? ""}
                  className="w-14 h-14 sm:w-16 sm:h-16 object-contain shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {data.player.position} · {data.player.club.abbreviation ?? "—"}
                  </span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight truncate">
                  {displayName}
                </h1>
                {data.player.name !== displayName && (
                  <p className="text-sm text-muted-foreground">{data.player.name}</p>
                )}
              </div>
              <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
                <span className="text-2xl font-bold text-primary font-mono">
                  C$ {(data.player.price ?? 0).toFixed(1)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {(data.player.averagePoints ?? 0).toFixed(1)} pts médio
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── Loading ───────────────────────────────────────────────────────── */}
        {isLoading && (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-card/60 animate-pulse" />
            ))}
          </div>
        )}

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {isError && (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center space-y-2">
            <Target className="w-10 h-10 text-muted-foreground/40 mx-auto" />
            <p className="font-medium text-foreground">Jogador não encontrado</p>
            <p className="text-sm text-muted-foreground">Verifique o link ou busque o jogador na plataforma.</p>
            <Button variant="ghost" size="sm" asChild><Link to="/">Ir para Mitometro</Link></Button>
          </div>
        )}

        {data && (
          <>
            {/* ── Summary stats ────────────────────────────────────────────── */}
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Rodadas com dados", value: `${data.history.length}`, color: "text-blue-400" },
                  { label: "Média projetada", value: stats.avgProj != null ? `${stats.avgProj.toFixed(1)} pts` : "—", color: "text-primary" },
                  { label: "Média real", value: stats.avgActual != null ? `${stats.avgActual.toFixed(1)} pts` : "—", color: "text-amber-400" },
                  { label: "Erro médio (MAE)", value: stats.mae != null ? `${stats.mae.toFixed(1)} pts` : "—", color: "text-muted-foreground" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-card border border-border/50 rounded-xl p-4">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">{label}</p>
                    <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ── Chart ────────────────────────────────────────────────────── */}
            {chartData.length > 1 && (
              <div className="bg-card border border-border/50 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-5">
                  <BarChart2 className="w-4 h-4 text-muted-foreground" />
                  <h2 className="font-semibold text-sm text-foreground">Projeção vs Real por rodada</h2>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis
                      dataKey="round"
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `R${v}`}
                    />
                    <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: "11px", color: "#64748b", paddingTop: "8px" }}
                    />
                    <ReferenceLine y={data.player.averagePoints ?? 0} stroke="#475569" strokeDasharray="4 4" />
                    <Bar dataKey="Real" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={32} opacity={0.85} />
                    <Line
                      dataKey="Projeção"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "#10b981", strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-muted-foreground text-center mt-2">
                  Linha tracejada = média histórica do jogador
                </p>
              </div>
            )}

            {/* ── Empty history ──────────────────────────────────────────────── */}
            {data.history.length === 0 && (
              <div className="rounded-2xl border border-border/40 bg-card/60 p-10 text-center space-y-2">
                <BarChart2 className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm text-muted-foreground">Ainda sem histórico de projeções para {displayName}.</p>
              </div>
            )}

            {/* ── History table ─────────────────────────────────────────────── */}
            {data.history.length > 0 && (
              <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border/40">
                  <h2 className="font-semibold text-sm text-foreground">Histórico por rodada</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/40">
                        <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Rodada</th>
                        <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Projeção</th>
                        <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Real</th>
                        <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Erro</th>
                        <th className="text-right px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Risco</th>
                        <th className="px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Tags</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {data.history.map((h) => {
                        const beat = h.actual != null && h.actual >= h.expectedPoints * 0.9;
                        const flopped = h.actual != null && h.actual < h.expectedPoints * 0.5;
                        return (
                          <tr key={h.round} className={`hover:bg-muted/30 transition-colors ${h.isDifferencial ? "bg-emerald-500/3" : h.isTrap ? "bg-yellow-500/3" : ""}`}>
                            <td className="px-4 py-3">
                              <Link
                                to={`/rodada/${h.round}`}
                                className="font-semibold text-foreground hover:text-primary transition-colors"
                              >
                                Rodada {h.round}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-primary">
                              {h.expectedPoints.toFixed(1)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {h.actual != null ? (
                                <div className="flex items-center justify-end gap-1">
                                  {beat ? (
                                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                                  ) : flopped ? (
                                    <TrendingDown className="w-3 h-3 text-red-400" />
                                  ) : null}
                                  <span className={`font-mono font-bold ${beat ? "text-emerald-400" : flopped ? "text-red-400" : "text-foreground"}`}>
                                    {h.actual.toFixed(1)}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground hidden sm:table-cell">
                              {h.error != null ? (
                                <span className={h.error > 0 ? "text-orange-400" : "text-emerald-400"}>
                                  {h.error > 0 ? "+" : ""}{h.error.toFixed(1)}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right hidden sm:table-cell">
                              <span className={`text-xs font-mono ${h.riskScore >= 0.6 ? "text-red-400" : h.riskScore >= 0.4 ? "text-yellow-400" : "text-muted-foreground"}`}>
                                {(h.riskScore * 100).toFixed(0)}%
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                {h.isDifferencial && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5">
                                    <Zap className="w-2.5 h-2.5" /> Dif
                                  </span>
                                )}
                                {h.isTrap && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded px-1.5 py-0.5">
                                    <AlertTriangle className="w-2.5 h-2.5" /> Trap
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── CTA ────────────────────────────────────────────────────────── */}
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8 text-center space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-medium text-primary">
                <Zap className="w-3 h-3" /> Mitometro Pro
              </div>
              <h3 className="text-lg font-bold text-foreground">
                Escale {displayName} com o modelo completo
              </h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Análise detalhada de matchup, forma, teto e probabilidade de escalar. Escalação otimizada por ILP incluída.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button asChild className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 gap-1.5">
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
