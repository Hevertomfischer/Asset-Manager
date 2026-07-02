/**
 * /desempenho — Página pública de transparência do modelo.
 *
 * Acessível sem login. Mostra métricas reais de erro e calibração do modelo
 * de projeção, com texto honesto explicando que erros são esperados e que
 * mostrar isso é intencional.
 *
 * Pensada para compartilhamento em redes sociais — tem título próprio e
 * layout sem sidebar (standalone).
 */

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  BarChart2,
  CheckCircle2,
  Eye,
  Loader2,
  LogIn,
  Share2,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CalibrationBucket {
  label: string;
  bucket: string;
  avgProjected: number;
  avgActual: number;
  count: number;
}

interface ByRound {
  round: number;
  mae: number;
  count: number;
}

interface PerformanceData {
  empty?: boolean;
  message?: string;
  season: {
    totalRounds: number;
    totalDataPoints: number;
    mae: number;
    overestimatedPct: number;
  };
  byRound: ByRound[];
  calibration: CalibrationBucket[];
  differentials: { total: number; hits: number; hitRate: number };
  traps: { total: number; count: number; rate: number };
  meta: { generatedAt: string; disclaimer: string };
}

// ── Custom tooltips ───────────────────────────────────────────────────────────

function MaeTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border/60 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground mb-1">Rodada {label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-muted-foreground">
          {p.name}: <span className="text-foreground font-mono font-bold">{p.value?.toFixed(2)} pts</span>
        </p>
      ))}
    </div>
  );
}

function CalibrationTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; name: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border/60 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <span className="font-mono font-bold">{p.value?.toFixed(2)} pts</span>
        </p>
      ))}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  variant = "default",
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  sub?: string;
  variant?: "default" | "good" | "warn" | "info";
}) {
  const colorMap = {
    default: "text-foreground border-border/50",
    good: "text-emerald-400 border-emerald-500/30",
    warn: "text-yellow-400 border-yellow-500/30",
    info: "text-blue-400 border-blue-500/30",
  };
  const iconMap = {
    default: "text-muted-foreground",
    good: "text-emerald-400",
    warn: "text-yellow-400",
    info: "text-blue-400",
  };

  return (
    <Card className={`bg-card/60 border ${colorMap[variant]} rounded-2xl flex-1 min-w-0`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold leading-tight max-w-[140px]">
            {label}
          </p>
          <Icon className={`w-4 h-4 shrink-0 ${iconMap[variant]}`} />
        </div>
        <p className={`text-3xl font-mono font-bold ${colorMap[variant].split(" ")[0]}`}>
          {value}
        </p>
        {sub && (
          <p className="text-[11px] text-muted-foreground mt-1.5 leading-tight">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Empty / error state ───────────────────────────────────────────────────────

function EmptyState({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
      <BarChart2 className="w-10 h-10 opacity-30" />
      <p className="text-sm font-medium">Dados históricos insuficientes</p>
      <p className="text-xs opacity-60 text-center max-w-sm">
        {message ?? "Após a primeira rodada completa, as métricas aparecerão aqui."}
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Desempenho() {
  const navigate = useNavigate();
  const shareRef = useRef<HTMLDivElement>(null);
  const [isSharing, setIsSharing] = useState(false);

  async function handleShare() {
    if (!shareRef.current) return;
    setIsSharing(true);
    try {
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(shareRef.current, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a");
      a.download = "mitometro-desempenho.png";
      a.href = dataUrl;
      a.click();
    } catch (err) {
      console.error("[share]", err);
    } finally {
      setIsSharing(false);
    }
  }

  // SEO + OG meta tags — set while mounted, restore on unmount
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "Desempenho do Modelo — Mitometro";

    const updates: Array<{ el: HTMLMetaElement; prev: string }> = [];
    const patches: Array<{ selector: string; prop: string; value: string }> = [
      { selector: 'meta[property="og:title"]',       prop: "content", value: "Desempenho do Modelo — Mitometro" },
      { selector: 'meta[property="og:description"]', prop: "content", value: "Todo modelo erra. Aqui você vê exatamente quanto — erro médio por rodada, calibração e taxa de armadilhas. Transparência total." },
      { selector: 'meta[property="og:url"]',         prop: "content", value: window.location.href },
      { selector: 'meta[name="twitter:title"]',      prop: "content", value: "Desempenho do Modelo — Mitometro" },
      { selector: 'meta[name="twitter:card"]',       prop: "content", value: "summary_large_image" },
    ];
    for (const { selector, prop, value } of patches) {
      const el = document.querySelector<HTMLMetaElement>(selector);
      if (el) {
        updates.push({ el, prev: el.getAttribute(prop) ?? "" });
        el.setAttribute(prop, value);
      }
    }

    return () => {
      document.title = prevTitle;
      updates.forEach(({ el, prev }) => el.setAttribute("content", prev));
    };
  }, []);

  const { data, isLoading, isError } = useQuery<PerformanceData>({
    queryKey: ["stats-performance"],
    queryFn: async () => {
      const res = await fetch("/api/stats/performance");
      if (!res.ok) throw new Error("Falha ao carregar dados");
      return res.json();
    },
    staleTime: 30 * 60 * 1000, // 30 min (matches server cache)
  });

  const seasonMae = data?.season?.mae ?? null;

  // Calibration chart: reverse order so Q1 (top projected) is on the right
  const calibrationData = data?.calibration
    ? [...data.calibration].reverse().map((b) => ({
        ...b,
        // Shorten labels for chart axis
        shortLabel:
          b.bucket === "q4" ? "Baixa proj." :
          b.bucket === "q3" ? "Média proj." :
          b.bucket === "q2" ? "Boa proj." : "Top proj.",
      }))
    : [];

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 selection:text-primary-foreground">
      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="bg-primary/20 p-1.5 rounded-lg border border-primary/30 group-hover:bg-primary/30 transition-colors">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <span className="font-display font-bold text-lg text-foreground leading-none">
              Mito<span className="text-primary">metro</span>
            </span>
          </Link>

          {/* CTA */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground text-sm gap-1.5"
              onClick={() => navigate("/")}
            >
              <LogIn className="w-4 h-4" />
              <span className="hidden sm:inline">Entrar</span>
            </Button>
            <Button
              size="sm"
              className="bg-gradient-to-r from-primary to-accent font-semibold text-sm gap-1.5 shadow-md shadow-primary/20"
              onClick={() => navigate("/")}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Criar conta grátis
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16 space-y-12">

        {/* ── Hero ───────────────────────────────────────────────────────────── */}
        <section className="text-center space-y-4 max-w-2xl mx-auto">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Badge
              variant="outline"
              className="border-primary/40 text-primary bg-primary/5 gap-1.5 text-xs font-semibold uppercase tracking-wide"
            >
              <Eye className="w-3 h-3" />
              Transparência
            </Badge>
          </div>
          <h1 className="text-4xl sm:text-5xl font-display font-bold tracking-tight text-foreground leading-tight">
            Desempenho{" "}
            <span className="text-primary">do Modelo</span>
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Todo modelo erra. Aqui você vê exatamente quanto e quando o nosso erra —
            sem filtros, sem cherry-picking.
          </p>
        </section>

        {/* ── Loading / error states ──────────────────────────────────────────── */}
        {isLoading && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-16">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm">Carregando dados históricos…</span>
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-2 text-destructive text-sm p-4 rounded-xl bg-destructive/10 border border-destructive/30 max-w-xl mx-auto">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Falha ao carregar os dados. Tente novamente mais tarde.
          </div>
        )}

        {data?.empty && <EmptyState message={data.message} />}

        {data && !data.empty && (
          <>
            {/* ── Share button ──────────────────────────────────────────────── */}
            <div className="flex justify-end -mt-6">
              <Button
                size="sm"
                variant="outline"
                onClick={handleShare}
                disabled={isSharing}
                className="gap-2 text-xs border-border/60 text-muted-foreground hover:text-foreground"
              >
                {isSharing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Share2 className="w-3.5 h-3.5" />
                )}
                {isSharing ? "Gerando imagem…" : "Compartilhar desempenho"}
              </Button>
            </div>

            {/* ── Stat cards ─────────────────────────────────────────────────── */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                icon={BarChart2}
                label="Rodadas analisadas"
                value={String(data.season.totalRounds)}
                sub={`${data.season.totalDataPoints.toLocaleString("pt-BR")} pares jogador-rodada`}
                variant="info"
              />
              <StatCard
                icon={Target}
                label="Erro médio (MAE)"
                value={`${data.season.mae} pts`}
                sub="Diferença média entre projeção e pontuação real"
                variant={data.season.mae <= 3 ? "good" : data.season.mae <= 5 ? "warn" : "default"}
              />
              <StatCard
                icon={CheckCircle2}
                label="Acerto de diferenciais"
                value={`${data.differentials.hitRate}%`}
                sub="Top projetados que bateram a mediana da rodada"
                variant={data.differentials.hitRate >= 60 ? "good" : "warn"}
              />
              <StatCard
                icon={XCircle}
                label="Taxa de armadilha"
                value={`${data.traps.rate}%`}
                sub="Top projetados que decepcionaram (<50% do esperado)"
                variant={data.traps.rate <= 15 ? "good" : "warn"}
              />
            </section>

            {/* ── MAE por rodada ──────────────────────────────────────────────── */}
            <section>
              <Card className="bg-card border-border/50 rounded-2xl shadow-lg">
                <CardHeader className="border-b border-border/40 pb-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <TrendingDown className="w-5 h-5 text-primary" />
                        Erro Médio por Rodada
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        MAE = média das diferenças absolutas entre projeção e pontuação real.
                        Valores menores são melhores.
                      </p>
                    </div>
                    {seasonMae !== null && (
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Média da temporada</p>
                        <p className="text-2xl font-mono font-bold text-primary mt-0.5">
                          {seasonMae} pts
                        </p>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {data.byRound.length < 2 ? (
                    <EmptyState message="Necessário ao menos 2 rodadas completas para exibir o gráfico." />
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={240}>
                        <ComposedChart
                          data={data.byRound}
                          margin={{ top: 8, right: 10, left: -16, bottom: 0 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(255,255,255,0.04)"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="round"
                            tick={{ fontSize: 11, fill: "#64748b" }}
                            tickLine={false}
                            axisLine={false}
                            label={{ value: "Rodada", position: "insideBottom", dy: 12, fontSize: 10, fill: "#64748b" }}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: "#64748b" }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v: number) => `${v}`}
                            width={36}
                          />
                          <Tooltip content={<MaeTooltip />} cursor={{ fill: "rgba(16,185,129,0.06)" }} />
                          {seasonMae !== null && (
                            <ReferenceLine
                              y={seasonMae}
                              stroke="#10b981"
                              strokeDasharray="5 3"
                              strokeWidth={1.5}
                              label={{
                                value: `Média ${seasonMae}`,
                                position: "insideTopRight",
                                fontSize: 10,
                                fill: "#10b981",
                                dy: -4,
                              }}
                            />
                          )}
                          <Line
                            type="monotone"
                            dataKey="mae"
                            name="MAE"
                            stroke="#10b981"
                            strokeWidth={2}
                            dot={{ r: 4, fill: "#10b981", strokeWidth: 0 }}
                            activeDot={{ r: 6, fill: "#10b981" }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                      <p className="text-center text-[11px] text-muted-foreground -mt-1">
                        Erro médio absoluto (pts) por rodada
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* ── Calibração ─────────────────────────────────────────────────── */}
            <section>
              <Card className="bg-card border-border/50 rounded-2xl shadow-lg">
                <CardHeader className="border-b border-border/40 pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    Calibração do Modelo
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Jogadores divididos em 4 faixas por projeção. Um modelo calibrado tem
                    barras de{" "}
                    <span className="text-emerald-400 font-semibold">pontuação real</span>{" "}
                    mais altas onde a{" "}
                    <span className="text-blue-400 font-semibold">projeção</span> também é maior.
                  </p>
                </CardHeader>
                <CardContent className="p-6">
                  {calibrationData.length === 0 ? (
                    <EmptyState />
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart
                          data={calibrationData}
                          margin={{ top: 8, right: 10, left: -16, bottom: 0 }}
                          barCategoryGap="28%"
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(255,255,255,0.04)"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="shortLabel"
                            tick={{ fontSize: 11, fill: "#64748b" }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 11, fill: "#64748b" }}
                            tickLine={false}
                            axisLine={false}
                            width={36}
                          />
                          <Tooltip content={<CalibrationTooltip />} />
                          <Legend
                            iconType="circle"
                            iconSize={8}
                            wrapperStyle={{ fontSize: 11, color: "#94a3b8", paddingTop: 12 }}
                          />
                          <Bar
                            dataKey="avgProjected"
                            name="Projeção média"
                            fill="rgba(96,165,250,0.5)"
                            stroke="rgba(96,165,250,0.8)"
                            strokeWidth={1}
                            radius={[4, 4, 0, 0]}
                          />
                          <Bar
                            dataKey="avgActual"
                            name="Pontuação real média"
                            fill="rgba(16,185,129,0.6)"
                            stroke="rgba(16,185,129,0.9)"
                            strokeWidth={1}
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                      <p className="text-center text-[11px] text-muted-foreground mt-1">
                        Pontuação média (pts) por faixa de projeção
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* ── Manifesto de transparência ──────────────────────────────────── */}
            <section className="grid md:grid-cols-2 gap-6">
              <Card className="bg-card/60 border-border/40 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                  <h2 className="font-display font-bold text-lg text-foreground">
                    Por que mostramos os erros?
                  </h2>
                </div>
                <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                  <p>
                    Todo modelo de previsão erra. O nosso também erra — e errará sempre.
                    Futebol é imprevisível por natureza: lesões de última hora, escalações
                    surpresa, dias ruins.
                  </p>
                  <p>
                    A diferença é que{" "}
                    <strong className="text-foreground">mostramos isso de propósito</strong>.
                    Ferramentas que só exibem os acertos criam uma ilusão perigosa de
                    certeza que pode custar dinheiro real para você.
                  </p>
                  <p>
                    Transparência não é fraqueza —{" "}
                    <strong className="text-foreground">é como você sabe que pode confiar</strong>{" "}
                    nos dados que usa para decidir sua escalação.
                  </p>
                </div>
              </Card>

              <Card className="bg-card/60 border-border/40 rounded-2xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-primary" />
                  <h2 className="font-display font-bold text-lg text-foreground">
                    O que esses números significam?
                  </h2>
                </div>
                <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded text-foreground shrink-0 mt-0.5">MAE</span>
                    <span>
                      <strong className="text-foreground">Erro Médio Absoluto</strong> — em média,
                      nossa projeção difere X pontos da pontuação real. Um MAE de 3 pts significa
                      que erramos 3 pontos para cima ou para baixo na média.
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-foreground">Acerto de diferencial</strong> — dos
                      jogadores que mais recomendamos (top quartil), quantos efetivamente pontuaram
                      acima da mediana da rodada.
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-foreground">Taxa de armadilha</strong> — dos mais
                      recomendados, quantos decepcionaram com menos de 50% da pontuação projetada.
                    </span>
                  </div>
                </div>
              </Card>
            </section>

            {/* ── Disclaimer técnico ──────────────────────────────────────────── */}
            <div className="flex items-start gap-2 text-[11px] text-muted-foreground/60 leading-relaxed max-w-3xl mx-auto">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-yellow-600/50" />
              <span>{data.meta.disclaimer}</span>
            </div>

            {/* ── Hidden share card (html-to-image target) ─────────────────── */}
            <div
              ref={shareRef}
              aria-hidden="true"
              style={{
                position: "absolute",
                left: "-9999px",
                top: 0,
                width: "560px",
                backgroundColor: "#0f172a",
                color: "#f1f5f9",
                fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
                borderRadius: "16px",
                overflow: "hidden",
              }}
            >
              {/* Header */}
              <div style={{ background: "linear-gradient(135deg, #064e3b 0%, #065f46 100%)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{ background: "#10b981", borderRadius: "8px", width: "26px", height: "26px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ color: "#0f172a", fontWeight: 900, fontSize: "13px" }}>M</span>
                  </div>
                  <span style={{ fontSize: "17px", fontWeight: 700 }}>
                    Mito<span style={{ color: "#10b981" }}>metro</span>
                  </span>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "10px", color: "#34d399", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Desempenho do Modelo
                  </div>
                  <div style={{ fontSize: "9px", color: "#6ee7b7", marginTop: "2px" }}>Transparência total · Cartola FC</div>
                </div>
              </div>

              {/* MAE hero */}
              <div style={{ padding: "20px 20px 12px", textAlign: "center" }}>
                <div style={{ fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: "8px" }}>
                  Erro Médio da Temporada (MAE)
                </div>
                <div style={{ fontSize: "52px", fontWeight: 900, lineHeight: 1, color: data.season.mae <= 3 ? "#10b981" : data.season.mae <= 5 ? "#eab308" : "#f87171" }}>
                  {data.season.mae}
                  <span style={{ fontSize: "18px", marginLeft: "4px", color: "#64748b", fontWeight: 500 }}>pts</span>
                </div>
                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "6px" }}>
                  diferença média entre projeção e pontuação real
                </div>
              </div>

              {/* Stat grid */}
              <div style={{ padding: "0 20px 16px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
                {[
                  { label: "Rodadas analisadas",   value: String(data.season.totalRounds),       color: "#60a5fa" },
                  { label: "Acerto diferencial",    value: `${data.differentials.hitRate}%`,       color: "#10b981" },
                  { label: "Taxa de armadilha",     value: `${data.traps.rate}%`,                  color: "#f87171" },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ background: "#1e293b", borderRadius: "10px", padding: "12px", textAlign: "center" }}>
                    <div style={{ fontSize: "22px", fontWeight: 800, color }}>{value}</div>
                    <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px", lineHeight: 1.3 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Quote */}
              <div style={{ margin: "0 20px 14px", padding: "11px 14px", background: "#1e293b", borderRadius: "10px", borderLeft: "3px solid #10b981" }}>
                <p style={{ fontSize: "11px", color: "#94a3b8", fontStyle: "italic", lineHeight: 1.5, margin: 0 }}>
                  "Todo modelo erra. Aqui você vê exatamente quanto e quando o nosso erra — sem filtros, sem cherry-picking."
                </p>
              </div>

              {/* Footer */}
              <div style={{ padding: "9px 20px", background: "#080e1a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "11px", color: "#34d399", fontWeight: 600 }}>mitometro.app/desempenho</span>
                <span style={{ fontSize: "9px", color: "#334155" }}>Cartola FC · Temporada 2025</span>
              </div>
            </div>
          </>
        )}

        {/* ── CTA ──────────────────────────────────────────────────────────────── */}
        <section className="py-6">
          <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/5 p-8 sm:p-12 text-center space-y-5">
            <Badge
              variant="outline"
              className="border-primary/30 text-primary bg-primary/5 uppercase text-xs tracking-wide font-bold"
            >
              <Sparkles className="w-3 h-3 mr-1.5" />
              Comece agora
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-foreground">
              Use essas projeções na{" "}
              <span className="text-primary">sua escalação</span>
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed">
              Acesso gratuito às projeções do modelo. Plano Pro desbloqueia
              otimizador ILP, simulação Monte Carlo e análise de fronteira
              eficiente de risco.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Button
                size="lg"
                className="h-12 px-8 text-base font-bold bg-gradient-to-r from-primary to-accent shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all"
                onClick={() => navigate("/")}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Criar conta grátis
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-8 text-base border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                onClick={() => navigate("/")}
              >
                <LogIn className="w-4 h-4 mr-2" />
                Já tenho conta
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground/50">
              Sem cartão de crédito para o plano gratuito.
            </p>
          </div>
        </section>

      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/30 bg-background/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <span>
              <strong className="text-foreground">Mitometro</strong> · Analytics para Cartola FC
            </span>
          </div>
          <span className="opacity-50">
            Dados atualizados a cada 30 minutos. Não afiliado ao Globo / Cartola FC.
          </span>
        </div>
      </footer>
    </div>
  );
}
