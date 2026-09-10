/**
 * /comparar — Comparador de jogadores lado a lado.
 *
 * Free: até 2 jogadores, sem indicadores avançados.
 * Pro:  até 5 jogadores + differentialScore + matchupScore.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { useGetPlayers, useGetPlayerById, type Player } from "@workspace/api-client-react";
import { useAuth } from "@/hooks";
import { usePaywall } from "@/context/PaywallContext";
import { ProGate } from "@/components/ProGate";
import { getPositionColor } from "@/hooks/use-custom-api";
import { PlayerCard, ClubBadge } from "@/components/PlayerCard";
import { getBadgeUrl, getBadgeScale } from "@/lib/clubColors";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useShareCard } from "@/hooks/useShareCard";
import { ShareCardFrame } from "@/components/share/ShareCardFrame";
import { Input } from "@/components/ui/input";
import {
  ChevronDown,
  ChevronUp,
  GitCompare,
  Loader2,
  Lock,
  Search,
  Share2,
  Shield,
  Sparkles,
  Trophy,
  X,
  Zap,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FREE = 2;
const MAX_PRO = 5;

const POSITION_LABEL: Record<string, string> = {
  GOL: "Goleiro", LAT: "Lateral", ZAG: "Zagueiro",
  MEI: "Meia", ATA: "Atacante", TEC: "Técnico",
};

interface ScoutDef {
  label: string;
  lowerIsBetter?: boolean;
  /** Positions where this scout is shown prominently (undefined = all) */
  positions?: string[];
}

const SCOUT_DISPLAY: Array<{ key: string } & ScoutDef> = [
  { key: "G",  label: "Gols",                  positions: ["ATA","MEI","LAT","ZAG"] },
  { key: "A",  label: "Assistências",           positions: ["ATA","MEI","LAT","ZAG"] },
  { key: "SG", label: "Sem sofrer gol",         positions: ["GOL","ZAG","LAT"] },
  { key: "FT", label: "Fin. na trave",          positions: ["ATA","MEI"] },
  { key: "FD", label: "Fin. defendida",         positions: ["ATA","MEI"] },
  { key: "FF", label: "Fin. para fora",         positions: ["ATA","MEI"] },
  { key: "DS", label: "Desarmes",               positions: ["ZAG","LAT","MEI"] },
  { key: "DE", label: "Defesas",                positions: ["GOL"] },
  { key: "PS", label: "Pên. sofrido",           positions: ["GOL"] },
  { key: "DP", label: "Defesa de pênalti",      positions: ["GOL"] },
  { key: "FS", label: "Faltas sofridas",        positions: ["ATA","MEI","LAT"] },
  { key: "FC", label: "Faltas cometidas",       lowerIsBetter: true, positions: ["ZAG","LAT","MEI","ATA"] },
  { key: "GS", label: "Gols sofridos",          lowerIsBetter: true, positions: ["GOL","ZAG","LAT"] },
  { key: "GC", label: "Gol contra",             lowerIsBetter: true },
  { key: "CA", label: "Cartão amarelo",         lowerIsBetter: true },
  { key: "CV", label: "Cartão vermelho",        lowerIsBetter: true },
  { key: "PP", label: "Pênalti perdido",        lowerIsBetter: true, positions: ["ATA","MEI"] },
  { key: "I",  label: "Impedimentos",           lowerIsBetter: true, positions: ["ATA"] },
];

type CumulativeScouts = Record<string, number | undefined>;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExpJson {
  formScore?: number | null;
  matchupScore?: number | null;
  differentialScore?: number | null;
  isTrap?: boolean;
  volatility?: number | null;
}

interface RoundProjection {
  round: number;
  expectedPoints: number;
}

// ── Helper: find best-value index in an array of numbers ─────────────────────

function findBest(
  values: (number | null | undefined)[],
  lowerIsBetter = false
): number {
  let bestIdx = -1;
  let bestVal = lowerIsBetter ? Infinity : -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (lowerIsBetter ? v < bestVal : v > bestVal) {
      bestVal = v;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ playerId }: { playerId: number }) {
  const { data } = useGetPlayerById(playerId);

  const points: RoundProjection[] = useMemo(() => {
    const raw = (data as { projections?: Record<string, unknown>[] })?.projections ?? [];
    return [...raw]
      .reverse()
      .map((p) => ({
        round: p["round"] as number,
        expectedPoints: (p["expectedPoints"] as number) ?? 0,
      }));
  }, [data]);

  if (points.length === 0) {
    return (
      <div className="h-12 flex items-center justify-center text-[10px] text-muted-foreground/40">
        sem dados
      </div>
    );
  }

  return (
    <div className="h-12">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 4, left: 4, bottom: 2 }}>
          <defs>
            <linearGradient id={`sg-${playerId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(var(--positive))" stopOpacity={0.4} />
              <stop offset="95%" stopColor="hsl(var(--positive))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="expectedPoints"
            stroke="hsl(var(--positive))"
            strokeWidth={1.5}
            fill={`url(#sg-${playerId})`}
            dot={false}
            isAnimationActive={false}
          />
          <RechartsTooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="text-[10px] bg-popover border border-border rounded px-2 py-1 shadow-lg">
                  <span className="text-muted-foreground">Rod. {payload[0]?.payload?.round}: </span>
                  <span className="font-mono font-bold text-primary">
                    {(payload[0]?.value as number)?.toFixed(1)} pts
                  </span>
                </div>
              ) : null
            }
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Seal badges ───────────────────────────────────────────────────────────────

type SealKind = "teto" | "seguro" | "custo" | "diferencial";

const SEAL_CONFIG: Record<SealKind, { label: string; color: string; Icon: typeof Trophy }> = {
  teto:       { label: "Maior teto",         color: "text-attention border-attention/30 bg-attention/10", Icon: Trophy },
  seguro:     { label: "Mais seguro",         color: "text-differential border-differential/30 bg-differential/10",       Icon: Shield },
  custo:      { label: "Melhor custo-benef.", color: "text-positive border-positive/30 bg-positive/10", Icon: Sparkles },
  diferencial:{ label: "Diferencial",         color: "text-purple-400 border-purple-500/30 bg-purple-500/10",  Icon: Zap },
};

function Seal({ kind }: { kind: SealKind }) {
  const { label, color, Icon } = SEAL_CONFIG[kind];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${color}`}>
      <Icon className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

// ── Single metric row ─────────────────────────────────────────────────────────

function MetricRow({
  label,
  values,
  fmt,
  lowerIsBetter = false,
  suffix = "",
}: {
  label: string;
  values: (number | null | undefined)[];
  fmt?: (v: number) => string;
  lowerIsBetter?: boolean;
  suffix?: string;
}) {
  const bestIdx = findBest(values, lowerIsBetter);
  const format = fmt ?? ((v: number) => v.toFixed(1));

  return (
    <tr className="border-b border-border/20 last:border-0 hover:bg-white/[0.015] transition-colors">
      <td className="py-2.5 px-4 text-xs text-muted-foreground whitespace-nowrap font-medium w-36 shrink-0">
        {label}
      </td>
      {values.map((v, i) => (
        <td key={i} className="py-2.5 px-4 text-center">
          {v == null ? (
            <span className="text-muted-foreground/30 text-xs">—</span>
          ) : (
            <span
              className={`font-mono text-sm font-semibold ${
                i === bestIdx
                  ? "text-positive"
                  : "text-foreground/80"
              }`}
            >
              {format(v)}{suffix}
              {i === bestIdx && (
                <span className="ml-1 text-positive/70 text-[9px]">▲</span>
              )}
            </span>
          )}
        </td>
      ))}
    </tr>
  );
}

// ── Player column header ──────────────────────────────────────────────────────

function PlayerHeader({
  player,
  seals,
  onRemove,
  minWidth = false,
}: {
  player: Player;
  seals: SealKind[];
  onRemove: () => void;
  minWidth?: boolean;
}) {
  return (
    <th className={`px-4 py-3 text-center relative${minWidth ? " min-w-[200px]" : ""}`}>
      {/* Remove button */}
      <button
        onClick={onRemove}
        className="absolute top-2 right-2 w-5 h-5 rounded-full bg-secondary hover:bg-destructive/20 hover:text-destructive flex items-center justify-center transition-colors"
        title="Remover"
      >
        <X className="w-3 h-3" />
      </button>

      <PlayerCard variant="compare" player={player}>
        {seals.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1 mt-2">
            {seals.map((s) => <Seal key={s} kind={s} />)}
          </div>
        )}
      </PlayerCard>
    </th>
  );
}

// ── Mobile metric row (label → value, list format) ────────────────────────────

function MobileMetric({
  label,
  rawValue,
  isBest,
}: {
  label: string;
  rawValue: string | null;
  isBest: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/15 last:border-0">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      {rawValue == null ? (
        <span className="text-muted-foreground/30 text-xs">—</span>
      ) : (
        <span
          className={`font-mono text-sm font-semibold ${
            isBest ? "text-positive" : "text-foreground/80"
          }`}
        >
          {rawValue}
          {isBest && <span className="ml-1 text-positive/70 text-[9px]">▲</span>}
        </span>
      )}
    </div>
  );
}

// ── Mobile player card ─────────────────────────────────────────────────────────

interface MobileVals {
  expectedPoints: (number | null)[];
  ceilingPoints: (number | null)[];
  floorPoints: (number | null)[];
  riskScore: (number | null)[];
  valueScore: (number | null)[];
  prices: (number | null)[];
  formScore: (number | null)[];
  matchupScore: (number | null)[];
  differentialScore: (number | null)[];
  recommendationScore: (number | null)[];
  scouts: Record<string, number[]>;
}

function MobilePlayerCard({
  player,
  idx,
  seals,
  onRemove,
  showScouts,
  onToggleScouts,
  vals,
  visibleScouts,
}: {
  player: Player;
  idx: number;
  seals: SealKind[];
  onRemove: () => void;
  showScouts: boolean;
  onToggleScouts: () => void;
  vals: MobileVals;
  visibleScouts: typeof SCOUT_DISPLAY;
}) {
  function isBest(arr: (number | null | undefined)[], lowerIsBetter = false) {
    return findBest(arr, lowerIsBetter) === idx;
  }

  function fmtVal(v: number | null | undefined, fmt: (n: number) => string): string | null {
    return v == null ? null : fmt(v);
  }

  const recVal = vals.recommendationScore[idx] ?? null;
  const recBest = isBest(vals.recommendationScore);

  return (
    <div>
      {/* Header — usa PlayerCard variant="compare" como identidade centralizada */}
      <div className="relative p-4 border-b border-border/30">
        <button
          onClick={onRemove}
          className="absolute top-3 right-3 z-10 w-6 h-6 rounded-full bg-secondary hover:bg-destructive/20 hover:text-destructive flex items-center justify-center transition-colors"
          title="Remover"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <PlayerCard variant="compare" player={player}>
          {seals.length > 0 && (
            <div className="flex flex-wrap justify-center gap-1 mt-2">
              {seals.map((s) => <Seal key={s} kind={s} />)}
            </div>
          )}
        </PlayerCard>
      </div>

      {/* Sparkline */}
      <div className="px-4 py-3 border-b border-border/20">
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">
          Forma recente · últimas 5 projeções
        </p>
        <Sparkline playerId={player.id} />
      </div>

      {/* Core metrics */}
      <div className="px-4 py-1">
        <MobileMetric
          label="Projeção"
          rawValue={fmtVal(vals.expectedPoints[idx], (v) => v.toFixed(1) + " pts")}
          isBest={isBest(vals.expectedPoints)}
        />
        <MobileMetric
          label="Teto"
          rawValue={fmtVal(vals.ceilingPoints[idx], (v) => v.toFixed(1) + " pts")}
          isBest={isBest(vals.ceilingPoints)}
        />
        <MobileMetric
          label="Piso"
          rawValue={fmtVal(vals.floorPoints[idx], (v) => v.toFixed(1) + " pts")}
          isBest={isBest(vals.floorPoints)}
        />
        <MobileMetric
          label="Risco"
          rawValue={fmtVal(vals.riskScore[idx], (v) => (v * 100).toFixed(0) + "%")}
          isBest={isBest(vals.riskScore, true)}
        />
        <MobileMetric
          label="Custo-benef."
          rawValue={fmtVal(vals.valueScore[idx], (v) => v.toFixed(2))}
          isBest={isBest(vals.valueScore)}
        />
        <MobileMetric
          label="Preço"
          rawValue={fmtVal(vals.prices[idx], (v) => `C$ ${v.toFixed(1)}`)}
          isBest={isBest(vals.prices, true)}
        />
        <MobileMetric
          label="Forma (score)"
          rawValue={fmtVal(vals.formScore[idx], (v) => v.toFixed(1) + " pts")}
          isBest={isBest(vals.formScore)}
        />
      </div>

      {/* Advanced metrics (Pro-gated) */}
      <div className="px-4">
        <ProGate message="Indicadores avançados de confronto e potencial diferencial">
          <div className="border-t border-border/20 pt-1">
            <MobileMetric
              label="Confronto"
              rawValue={fmtVal(vals.matchupScore[idx], (v) => `×${v.toFixed(2)}`)}
              isBest={isBest(vals.matchupScore)}
            />
            <MobileMetric
              label="Diferencial"
              rawValue={fmtVal(vals.differentialScore[idx], (v) => v.toFixed(1))}
              isBest={isBest(vals.differentialScore)}
            />
          </div>
        </ProGate>
      </div>

      {/* Score geral */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border/40 bg-primary/[0.03] mt-1">
        <span className="text-xs font-semibold text-foreground">Score geral</span>
        {recVal != null ? (
          <span
            className={`font-mono text-base font-bold ${
              recBest ? "text-positive" : "text-foreground/70"
            }`}
          >
            {recVal.toFixed(1)}
            {recBest && <span className="ml-1 text-[10px] text-positive/70">▲</span>}
          </span>
        ) : (
          <span className="text-muted-foreground/30 text-xs">—</span>
        )}
      </div>

      {/* Scouts toggle */}
      <div className="px-4 pt-3 pb-4 border-t border-border/30">
        <button
          onClick={onToggleScouts}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
        >
          {showScouts ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
          {showScouts ? "Ver menos" : "Ver mais informações"}
          <span className="text-muted-foreground/60 font-normal">— scouts da temporada</span>
        </button>

        {showScouts && (
          <div className="mt-3 pt-2 border-t border-border/20">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground/60 pb-2 border-b border-border/20 mb-1">
              Scouts acumulados na temporada
            </p>
            {visibleScouts.map((s) => (
              <MobileMetric
                key={s.key}
                label={s.label}
                rawValue={(vals.scouts[s.key]?.[idx] ?? 0).toFixed(0)}
                isBest={isBest(vals.scouts[s.key] ?? [], s.lowerIsBetter)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Empty comparison prompt ───────────────────────────────────────────────────

function EmptyPrompt() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
      <GitCompare className="w-12 h-12 opacity-20" />
      <p className="text-sm font-medium">Adicione pelo menos 2 jogadores para comparar</p>
      <p className="text-xs opacity-60">Use a busca acima para encontrar jogadores</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Comparar() {
  const { isPro } = useAuth();
  const { openPaywall } = usePaywall();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [showScouts, setShowScouts] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const shareRef = useRef<HTMLDivElement>(null);
  const { share: handleShare, isSharing, errorMsg: shareError } = useShareCard(
    shareRef,
    () => {
      const names = selectedPlayers.map((p) => (p.nickname ?? p.name).replace(/\s+/g, "_")).join("-vs-");
      return `mitometro-${names || "comparacao"}.png`;
    },
    "comparacao"
  );

  const maxPlayers = isPro ? MAX_PRO : MAX_FREE;

  // ── Load all players for search ────────────────────────────────────────────
  const { data: playersData } = useGetPlayers({ probableOnly: "false" });
  const allPlayers = playersData?.players ?? [];

  // ── Filtered search results ────────────────────────────────────────────────
  const searchResults = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (q.length < 2) return [];
    return allPlayers
      .filter((p) => {
        if (selectedIds.includes(p.id)) return false;
        const name = p.name.toLowerCase();
        const nick = p.nickname?.toLowerCase() ?? "";
        return name.includes(q) || nick.includes(q);
      })
      .slice(0, 8);
  }, [allPlayers, search, selectedIds]);

  // ── Selected player objects ────────────────────────────────────────────────
  const selectedPlayers = useMemo(
    () =>
      selectedIds
        .map((id) => allPlayers.find((p) => p.id === id))
        .filter(Boolean) as typeof allPlayers,
    [selectedIds, allPlayers]
  );

  // ── Selos: compute once for all selected players ───────────────────────────
  const sealMap = useMemo((): Map<number, SealKind[]> => {
    const map = new Map<number, SealKind[]>();
    if (selectedPlayers.length < 2) return map;

    selectedPlayers.forEach((p) => map.set(p.id, []));

    const get = (p: (typeof allPlayers)[number]) => p.projection;
    const getExp = (p: (typeof allPlayers)[number]): ExpJson =>
      (p.projection?.explanationJson as ExpJson) ?? {};

    // Maior teto
    const tetoIdx = findBest(selectedPlayers.map((p) => get(p)?.ceilingPoints));
    if (tetoIdx >= 0) map.get(selectedPlayers[tetoIdx].id)!.push("teto");

    // Mais seguro
    const segIdx = findBest(selectedPlayers.map((p) => get(p)?.riskScore), true);
    if (segIdx >= 0) map.get(selectedPlayers[segIdx].id)!.push("seguro");

    // Melhor custo-benefício
    const custoIdx = findBest(selectedPlayers.map((p) => get(p)?.valueScore));
    if (custoIdx >= 0) map.get(selectedPlayers[custoIdx].id)!.push("custo");

    // Diferencial (Pro)
    if (isPro) {
      const difIdx = findBest(selectedPlayers.map((p) => getExp(p)?.differentialScore));
      if (difIdx >= 0) map.get(selectedPlayers[difIdx].id)!.push("diferencial");
    }

    return map;
  }, [selectedPlayers, isPro, allPlayers]);

  // ── Close dropdown on outside click ───────────────────────────────────────
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function addPlayer(id: number) {
    if (selectedIds.includes(id)) return;
    if (selectedIds.length >= maxPlayers) {
      if (!isPro) { openPaywall(); return; }
      return;
    }
    setSelectedIds((prev) => [...prev, id]);
    setSearch("");
    setDropdownOpen(false);
  }

  function removePlayer(id: number) {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }

  // ── Projection values per row ──────────────────────────────────────────────
  const projValues = (key: keyof NonNullable<(typeof allPlayers)[number]["projection"]>) =>
    selectedPlayers.map((p) => {
      const v = p.projection?.[key];
      return typeof v === "number" ? v : null;
    });

  const expValues = (key: keyof ExpJson) =>
    selectedPlayers.map((p) => {
      const v = (p.projection?.explanationJson as ExpJson)?.[key];
      return typeof v === "number" ? v : null;
    });

  const scoutValues = (key: string) =>
    selectedPlayers.map((p) => {
      const scouts = (p as unknown as { cumulativeScouts?: CumulativeScouts }).cumulativeScouts;
      const v = scouts?.[key];
      return typeof v === "number" ? v : 0;
    });

  // Decide which scouts to show: union of all relevant positions among selected players
  const selectedPositions = useMemo(
    () => new Set(selectedPlayers.map((p) => p.position ?? "")),
    [selectedPlayers]
  );
  const visibleScouts = useMemo(
    () =>
      SCOUT_DISPLAY.filter((s) => {
        if (!s.positions) return true;
        return s.positions.some((pos) => selectedPositions.has(pos));
      }),
    [selectedPositions]
  );

  // ── Pre-computed value arrays for mobile carousel ──────────────────────────
  const mobileVals = useMemo(() => ({
    expectedPoints: selectedPlayers.map((p) => p.projection?.expectedPoints ?? null),
    ceilingPoints:  selectedPlayers.map((p) => p.projection?.ceilingPoints  ?? null),
    floorPoints:    selectedPlayers.map((p) => p.projection?.floorPoints    ?? null),
    riskScore:      selectedPlayers.map((p) => p.projection?.riskScore      ?? null),
    valueScore:     selectedPlayers.map((p) => p.projection?.valueScore     ?? null),
    prices:         selectedPlayers.map((p) => p.price                       ?? null),
    formScore:      selectedPlayers.map((p) => (p.projection?.explanationJson as ExpJson)?.formScore ?? null),
    matchupScore:   selectedPlayers.map((p) => (p.projection?.explanationJson as ExpJson)?.matchupScore ?? null),
    differentialScore: selectedPlayers.map((p) => (p.projection?.explanationJson as ExpJson)?.differentialScore ?? null),
    recommendationScore: selectedPlayers.map((p) => p.projection?.recommendationScore ?? null),
    scouts: Object.fromEntries(
      SCOUT_DISPLAY.map((s) => [
        s.key,
        selectedPlayers.map((p) => {
          const sc = (p as unknown as { cumulativeScouts?: CumulativeScouts }).cumulativeScouts;
          const v = sc?.[s.key];
          return typeof v === "number" ? v : 0;
        }),
      ])
    ) as Record<string, number[]>,
  }), [selectedPlayers]);

  // ── Dummy blurred rows for ProGate overlay ─────────────────────────────────
  const dummyRows = (
    <>
      <tr className="border-b border-border/20">
        <td className="py-2.5 px-4 text-xs text-muted-foreground w-36">Confronto</td>
        {selectedPlayers.map((_, i) => (
          <td key={i} className="py-2.5 px-4 text-center font-mono text-sm font-semibold text-foreground/80">
            1.08
          </td>
        ))}
      </tr>
      <tr>
        <td className="py-2.5 px-4 text-xs text-muted-foreground w-36">Diferencial</td>
        {selectedPlayers.map((_, i) => (
          <td key={i} className="py-2.5 px-4 text-center font-mono text-sm font-semibold text-foreground/80">
            11.4
          </td>
        ))}
      </tr>
    </>
  );

  const canAddMore = selectedIds.length < maxPlayers;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
          <GitCompare className="w-7 h-7 text-primary" />
          Comparar Jogadores
        </h1>
        <p className="text-muted-foreground mt-1">
          Compare indicadores lado a lado.{" "}
          {isPro ? (
            <span className="text-primary font-medium">Até {MAX_PRO} jogadores com todos os indicadores.</span>
          ) : (
            <span>
              Plano gratuito: até {MAX_FREE} jogadores.{" "}
              <button className="text-primary hover:underline font-medium" onClick={openPaywall}>
                Upgrade Pro
              </button>{" "}
              para 3+ e indicadores avançados.
            </span>
          )}
        </p>
      </div>

      {/* ── Search ──────────────────────────────────────────────────────────── */}
      <Card className="bg-card border-border/50 rounded-2xl p-5 shadow-lg shadow-black/5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Selected chips */}
          {selectedPlayers.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-primary/10 border border-primary/25 text-primary text-sm font-medium"
            >
              <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${getPositionColor(p.position ?? "")}`}>
                {p.position}
              </span>
              {p.nickname ?? p.name}
              <button
                onClick={() => removePlayer(p.id)}
                className="w-4 h-4 rounded-full hover:bg-primary/20 flex items-center justify-center transition-colors ml-0.5"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}

          {/* Search input or locked slot */}
          {canAddMore ? (
            <div ref={searchRef} className="relative flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar jogador pelo nome…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setDropdownOpen(true);
                  }}
                  onFocus={() => setDropdownOpen(true)}
                  className="pl-9 h-9 bg-secondary/50 border-border/50 text-sm"
                />
              </div>

              {/* Dropdown */}
              {dropdownOpen && searchResults.length > 0 && (
                <div className="absolute top-full mt-1 w-full bg-popover border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-secondary/50 transition-colors text-sm"
                      onMouseDown={() => addPlayer(p.id)}
                    >
                      {getBadgeUrl(p.club?.abbreviation, p.club?.badgeUrl) && (
                        <img src={getBadgeUrl(p.club?.abbreviation, p.club?.badgeUrl)} alt="" className="w-5 h-5 object-contain shrink-0" style={getBadgeScale(p.club?.abbreviation) !== 1 ? { transform: `scale(${getBadgeScale(p.club?.abbreviation)})` } : undefined} />
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-foreground">
                          {p.nickname ?? p.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getPositionColor(p.position ?? "")}`}>
                          {p.position}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">
                          C$ {(p.price ?? 0).toFixed(1)}
                        </span>
                        {p.projection?.expectedPoints != null && (
                          <span className="text-xs font-mono text-primary font-semibold">
                            {p.projection.expectedPoints.toFixed(1)} pts
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {dropdownOpen && search.length >= 2 && searchResults.length === 0 && (
                <div className="absolute top-full mt-1 w-full bg-popover border border-border rounded-xl shadow-xl z-50 px-4 py-3 text-sm text-muted-foreground">
                  Nenhum jogador encontrado para "{search}"
                </div>
              )}
            </div>
          ) : !isPro ? (
            /* Locked slot for free user */
            <button
              onClick={openPaywall}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-dashed border-border/60 text-muted-foreground/60 hover:border-primary/40 hover:text-primary/70 transition-colors text-sm"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>+1 jogador (Pro)</span>
            </button>
          ) : null}
        </div>
      </Card>

      {/* ── Comparison ───────────────────────────────────────────────────────── */}
      {selectedPlayers.length < 2 ? (
        <EmptyPrompt />
      ) : (
        <>
          {/* ── Share button ──────────────────────────────────────────────────── */}
          <div className="flex flex-col items-end gap-1">
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
              {isSharing ? "Gerando imagem…" : "Compartilhar comparação"}
            </Button>
            {shareError && (
              <p className="text-[11px] text-destructive">{shareError}</p>
            )}
          </div>

          {/* ── Mobile: cards empilhados (< md) ─────────────────────────────── */}
          <div className="md:hidden space-y-4">
            {selectedPlayers.map((player, idx) => (
              <Card
                key={player.id}
                className="bg-card border-border/50 rounded-2xl shadow-lg shadow-black/5 overflow-hidden w-full"
              >
                <MobilePlayerCard
                  player={player}
                  idx={idx}
                  seals={sealMap.get(player.id) ?? []}
                  onRemove={() => removePlayer(player.id)}
                  showScouts={showScouts}
                  onToggleScouts={() => setShowScouts((v) => !v)}
                  vals={mobileVals}
                  visibleScouts={visibleScouts}
                />
              </Card>
            ))}

            {/* Legend */}
            <p className="text-center text-[11px] text-muted-foreground/50">
              <span className="text-positive font-bold">▲</span>{" "}
              = melhor valor · Risco e Preço: menor é melhor.
            </p>
          </div>

          {/* ── Desktop: full table (≥ md) ───────────────────────────────────── */}
          <Card className="hidden md:block bg-card border-border/50 rounded-2xl shadow-lg shadow-black/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse table-fixed">

              {/* ── Player headers ─────────────────────────────────────────── */}
              <thead>
                <tr className="border-b border-border/50 bg-card">
                  {/* Label column header */}
                  <th className="px-4 py-3 text-left w-36 shrink-0">
                    <span className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">
                      Indicador
                    </span>
                  </th>
                  {selectedPlayers.map((p) => (
                    <PlayerHeader
                      key={p.id}
                      player={p}
                      seals={sealMap.get(p.id) ?? []}
                      onRemove={() => removePlayer(p.id)}
                      minWidth
                    />
                  ))}
                </tr>
              </thead>

              <tbody>
                {/* ── Sparklines ──────────────────────────────────────────── */}
                <tr className="border-b border-border/40 bg-secondary/10">
                  <td className="px-4 py-2 text-xs text-muted-foreground font-medium">
                    Forma recente
                    <span className="block text-[10px] opacity-60">últimas 5 projeções</span>
                  </td>
                  {selectedPlayers.map((p) => (
                    <td key={p.id} className="px-4 py-2">
                      <Sparkline playerId={p.id} />
                    </td>
                  ))}
                </tr>

                {/* ── Core metrics ────────────────────────────────────────── */}
                <MetricRow
                  label="Projeção"
                  values={projValues("expectedPoints")}
                  suffix=" pts"
                />
                <MetricRow
                  label="Teto"
                  values={projValues("ceilingPoints")}
                  suffix=" pts"
                />
                <MetricRow
                  label="Piso"
                  values={projValues("floorPoints")}
                  suffix=" pts"
                />
                <MetricRow
                  label="Risco"
                  values={projValues("riskScore")}
                  lowerIsBetter
                  fmt={(v) => (v * 100).toFixed(0) + "%"}
                />
                <MetricRow
                  label="Custo-benef."
                  values={projValues("valueScore")}
                  fmt={(v) => v.toFixed(2)}
                />
                <MetricRow
                  label="Preço"
                  values={selectedPlayers.map((p) => p.price ?? null)}
                  lowerIsBetter
                  fmt={(v) => `C$ ${v.toFixed(1)}`}
                />
                <MetricRow
                  label="Forma (score)"
                  values={expValues("formScore")}
                  suffix=" pts"
                />

                {/* ── Advanced metrics (Pro-gated) ─────────────────────────── */}
                <tr>
                  <td colSpan={selectedPlayers.length + 1} className="p-0">
                    <ProGate
                      message="Indicadores avançados de confronto e potencial diferencial"
                    >
                      <table className="w-full border-collapse">
                        <tbody>
                          <MetricRow
                            label="Confronto"
                            values={expValues("matchupScore")}
                            fmt={(v) => `×${v.toFixed(2)}`}
                          />
                          <MetricRow
                            label="Diferencial"
                            values={expValues("differentialScore")}
                            fmt={(v) => v.toFixed(1)}
                          />
                        </tbody>
                      </table>
                    </ProGate>
                  </td>
                </tr>

                {/* ── Recommendation score ─────────────────────────────────── */}
                <tr className="border-t border-border/40 bg-primary/3">
                  <td className="px-4 py-3 text-xs font-semibold text-foreground">
                    Score geral
                  </td>
                  {selectedPlayers.map((p, i) => {
                    const vals = selectedPlayers.map((x) => x.projection?.recommendationScore ?? null);
                    const bestIdx = findBest(vals);
                    const v = p.projection?.recommendationScore;
                    return (
                      <td key={p.id} className="px-4 py-3 text-center">
                        {v != null ? (
                          <span
                            className={`font-mono text-base font-bold ${
                              i === bestIdx ? "text-positive" : "text-foreground/70"
                            }`}
                          >
                            {v.toFixed(1)}
                            {i === bestIdx && (
                              <span className="ml-1 text-[10px] text-positive/70">▲</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/30 text-xs">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>

                {/* ── Toggle: scouts detalhados ─────────────────────────────── */}
                <tr className="border-t border-border/30">
                  <td colSpan={selectedPlayers.length + 1} className="px-4 py-2">
                    <button
                      onClick={() => setShowScouts((v) => !v)}
                      className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                    >
                      {showScouts ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                      {showScouts ? "Ver menos" : "Ver mais informações"}
                      <span className="text-muted-foreground/60 font-normal">
                        — scouts da temporada
                      </span>
                    </button>
                  </td>
                </tr>

                {/* ── Scout rows (expanded) ─────────────────────────────────── */}
                {showScouts && (
                  <>
                    <tr className="border-b border-border/20 bg-secondary/10">
                      <td
                        colSpan={selectedPlayers.length + 1}
                        className="px-4 pt-3 pb-1.5 text-[11px] uppercase tracking-wider font-semibold text-muted-foreground/60"
                      >
                        Scouts acumulados na temporada
                      </td>
                    </tr>
                    {visibleScouts.map((s) => (
                      <MetricRow
                        key={s.key}
                        label={s.label}
                        values={scoutValues(s.key)}
                        lowerIsBetter={s.lowerIsBetter}
                        fmt={(v) => v.toFixed(0)}
                      />
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Position legend */}
          <div className="border-t border-border/30 px-5 py-3 text-[11px] text-muted-foreground/50 flex items-center gap-4 flex-wrap">
            <span>
              <span className="text-positive font-bold">▲</span> = melhor valor na linha
            </span>
            <span>Risco e Preço: menor é melhor.</span>
            <span>Score geral: 0–100, gerado pelo modelo.</span>
          </div>
        </Card>

          {/* ── Hidden share card (html-to-image target) ─────────────────────── */}
          {(() => {
            const projVals = selectedPlayers.map((x) => x.projection?.expectedPoints ?? null);
            const ceilVals = selectedPlayers.map((x) => x.projection?.ceilingPoints ?? null);
            const scoreVals = selectedPlayers.map((x) => x.projection?.recommendationScore ?? null);
            const bestProj = findBest(projVals);
            const bestCeil = findBest(ceilVals);
            const bestScore = findBest(scoreVals);
            const sealColors: Record<string, string> = {
              teto: "hsl(var(--attention))", seguro: "hsl(var(--differential))", custo: "hsl(var(--positive))", diferencial: "#a855f7",
            };
            return (
              <ShareCardFrame ref={shareRef} subtitle="Comparação de Jogadores">

                {/* Players grid */}
                <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: `repeat(${selectedPlayers.length}, 1fr)`, gap: "10px" }}>
                  {selectedPlayers.map((p, idx) => {
                    const seals = sealMap.get(p.id) ?? [];
                    const isWinner = idx === bestScore;
                    return (
                      <div key={p.id} style={{ background: "hsl(var(--card))", borderRadius: "12px", padding: "12px", border: isWinner ? "1.5px solid hsl(var(--positive))" : "1px solid hsl(var(--border))" }}>
                        <div style={{ fontWeight: 700, fontSize: "14px", color: "#f1f5f9", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {p.nickname ?? p.name}
                        </div>
                        <div style={{ fontSize: "10px", color: "hsl(var(--muted-foreground))", marginBottom: "10px" }}>
                          {p.position} · {p.club?.abbreviation ?? "—"} · C${(p.price ?? 0).toFixed(1)}
                        </div>
                        {seals.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "3px", marginBottom: "9px" }}>
                            {seals.map((s) => (
                              <span key={s} style={{ fontSize: "8px", padding: "2px 5px", borderRadius: "999px", backgroundColor: sealColors[s] ? `${sealColors[s]}25` : "hsl(var(--muted-foreground) / 0.15)", color: sealColors[s] ?? "hsl(var(--muted-foreground))", fontWeight: 700 }}>
                                {SEAL_CONFIG[s as keyof typeof SEAL_CONFIG]?.label ?? s}
                              </span>
                            ))}
                          </div>
                        )}
                        {[
                          { label: "Projeção", value: p.projection?.expectedPoints, best: idx === bestProj, suffix: " pts" },
                          { label: "Teto",     value: p.projection?.ceilingPoints,   best: idx === bestCeil, suffix: " pts" },
                          { label: "Score",    value: p.projection?.recommendationScore, best: idx === bestScore, suffix: "" },
                        ].map(({ label, value, best, suffix }) => (
                          <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
                            <span style={{ fontSize: "10px", color: "hsl(var(--muted-foreground))" }}>{label}</span>
                            <span style={{ fontSize: "12px", fontWeight: 700, color: best ? "hsl(var(--positive))" : "hsl(var(--muted-foreground))" }}>
                              {value != null ? value.toFixed(1) + suffix : "—"}
                              {best && <span style={{ marginLeft: "2px", fontSize: "8px" }}>▲</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>

              </ShareCardFrame>
            );
          })()}
        </>
      )}

    </div>
  );
}
