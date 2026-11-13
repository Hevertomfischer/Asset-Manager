import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { usePaywall } from "@/context/PaywallContext";
import { useLineupConstraints, type ConstraintPlayer } from "@/context/LineupConstraintsContext";
import { useAuth } from "@/hooks/useAuth";
import { PlayerConstraintActions } from "@/components/lineup/PlayerConstraintActions";
import { useGetPlayers } from "@workspace/api-client-react";
import { getPositionColor } from "@/hooks/use-custom-api";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, AlertCircle, ChevronLeft, ChevronRight, TrendingUp, AlertTriangle, TrendingDown, ArrowUpDown, ArrowUp, ArrowDown, Sparkles, Share2, Loader2, Zap } from "lucide-react";
import { ProGate } from "@/components/ProGate";
import { type ExplanationJson, getTopBadges, isDifferentialPlayer, isTrapPlayer } from "@/lib/explainPlayer";
import { isDifferentialHighlight, label as popularityLabel } from "@/lib/popularityRules";
import { useShareCard } from "@/hooks/useShareCard";
import { ShareCardFrame } from "@/components/share/ShareCardFrame";
import { PlayerExplanationSheet } from "@/components/PlayerExplanationSheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PlayerCard } from "@/components/PlayerCard";
import { getBadgeUrl, getBadgeScale } from "@/lib/clubColors";
import { PageSkeleton } from "@/components/states/PageSkeleton";
import { ErrorState } from "@/components/states/ErrorState";
import { EmptyState } from "@/components/states/EmptyState";

type SortColumn =
  | "name"
  | "position"
  | "price"
  | "averagePoints"
  | "minimoParaValorizar"
  | "baseAverage"
  | "projection"
  | "floorPoints"
  | "ceilingPoints"
  | "riskScore"
  | "playProbability"
  | "valoriza";

type SortDirection = "asc" | "desc";

function SortIcon({ column, sortColumn, sortDirection }: { column: SortColumn; sortColumn: SortColumn; sortDirection: SortDirection }) {
  if (column !== sortColumn) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
  return sortDirection === "asc"
    ? <ArrowUp className="w-3 h-3 ml-1 text-primary" />
    : <ArrowDown className="w-3 h-3 ml-1 text-primary" />;
}

export default function Players() {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<string>("ALL");
  const [clubFilter, setClubFilter] = useState<string>("ALL");
  const [minPrice, setMinPrice] = useState<number>(0);
  const [maxPrice, setMaxPrice] = useState<number>(30);
  const [minProjection, setMinProjection] = useState<string>("");
  const [maxMinimo, setMaxMinimo] = useState<string>("");
  const [minBaseAverage, setMinBaseAverage] = useState<string>("");
  const [probableOnly, setProbableOnly] = useState(true);
  const [valorizaOnly, setValorizaOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [sortColumn, setSortColumn] = useState<SortColumn>("projection");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const pageSize = 20;
  const { openPaywall } = usePaywall();
  const { isPro } = useAuth();
  const {
    lockedPlayers,
    excludedPlayers,
    isLocked,
    isExcluded,
    toggleLocked,
    toggleExcluded,
  } = useLineupConstraints();

  const toConstraintPlayer = (player: {
    id: number;
    name?: string;
    nickname?: string | null;
    position?: string | null;
    price?: number | null;
    club?: { abbreviation?: string | null } | null;
  }): ConstraintPlayer => ({
    id: player.id,
    name: player.nickname ?? player.name ?? "Jogador",
    position: player.position,
    clubAbbr: player.club?.abbreviation,
    price: player.price,
  });

  const handleToggleLocked = (player: Parameters<typeof toConstraintPlayer>[0]) => {
    if (!isLocked(player.id) && !isPro && lockedPlayers.length >= 1) {
      openPaywall();
      return;
    }
    toggleLocked(toConstraintPlayer(player));
  };

  const handleToggleExcluded = (player: Parameters<typeof toConstraintPlayer>[0]) => {
    if (!isExcluded(player.id) && !isPro && excludedPlayers.length >= 3) {
      openPaywall();
      return;
    }
    toggleExcluded(toConstraintPlayer(player));
  };

  const { data, isLoading, isError, error, refetch } = useGetPlayers({
    position: position === "ALL" ? undefined : position,
    minPrice: minPrice > 0 ? minPrice : undefined,
    maxPrice,
    probableOnly: probableOnly ? "true" : "false",
    minProjection: minProjection ? Number(minProjection) : undefined,
    maxMinimo: maxMinimo ? Number(maxMinimo) : undefined,
    minBaseAverage: minBaseAverage ? Number(minBaseAverage) : undefined,
  });
  useEffect(() => {
    if (isError && (error as { status?: number })?.status === 402) openPaywall();
  }, [isError, error, openPaywall]);

  const { data: allPlayersData } = useGetPlayers({ probableOnly: "false" });

  const players = data?.players || [];
  const allPlayersList = allPlayersData?.players ?? [];

  const topDiferencial = useMemo(() => {
    return allPlayersList
      .filter((p) => isDifferentialHighlight({ ...(p.projection?.explanationJson ?? {}), expectedPoints: p.projection?.expectedPoints }))
      .sort((a, b) => {
        const da = ((a.projection?.explanationJson as ExplanationJson)?.differentialScore ?? 0);
        const db = ((b.projection?.explanationJson as ExplanationJson)?.differentialScore ?? 0);
        return db - da;
      })[0] ?? null;
  }, [allPlayersList]);

  const topArmadilha = useMemo(() => {
    return allPlayersList
      .filter((p) => isTrapPlayer((p.projection?.explanationJson ?? {}) as ExplanationJson))
      .sort((a, b) => {
        const pa = ((a.projection?.explanationJson as ExplanationJson)?.popularity ?? -1);
        const pb = ((b.projection?.explanationJson as ExplanationJson)?.popularity ?? -1);
        return pb - pa;
      })[0] ?? null;
  }, [allPlayersList]);

  const clubs = useMemo(() => {
    const source = allPlayersData?.players ?? players;
    const seen = new Map<number, string>();
    source.forEach(p => {
      const clubId = p.club?.id;
      if (p.club && clubId !== undefined && !seen.has(clubId)) {
        seen.set(clubId, p.club.name ?? '');
      }
    });
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allPlayersData, players]);

  const handleSort = useCallback((col: SortColumn) => {
    setSortColumn(prev => {
      if (prev === col) {
        setSortDirection(d => d === "asc" ? "desc" : "asc");
        return col;
      }
      setSortDirection("desc");
      return col;
    });
    setPage(0);
  }, []);

  const filteredPlayers = useMemo(() => {
    const q = search.toLowerCase();
    const filtered = players.filter(p => {
      const nameMatch = p.name.toLowerCase().includes(q) ||
                        (p.nickname?.toLowerCase().includes(q) ?? false);
      const clubMatch = clubFilter === "ALL" || String(p.club?.id) === clubFilter;
      return nameMatch && clubMatch;
    });

    const isValoriza = (p: typeof filtered[0]) => {
      const exp = p.projection?.expectedPoints;
      const min = p.minimoParaValorizar;
      return exp != null && min != null && exp >= min;
    };

    const getValue = (p: typeof filtered[0], col: SortColumn): number | string => {
      switch (col) {
        case "name": return p.nickname ?? p.name ?? "";
        case "position": return p.position ?? "";
        case "price": return p.price ?? 0;
        case "averagePoints": return p.averagePoints ?? 0;
        case "minimoParaValorizar": return p.minimoParaValorizar ?? -Infinity;
        case "baseAverage": return (p as unknown as { baseAverage?: number }).baseAverage ?? -Infinity;
        case "projection": return p.projection?.expectedPoints ?? -Infinity;
        case "floorPoints": return p.projection?.floorPoints ?? -Infinity;
        case "ceilingPoints": return p.projection?.ceilingPoints ?? -Infinity;
        case "riskScore": return p.availability?.riskScore ?? Infinity;
        case "playProbability": return p.availability?.playProbability ?? -Infinity;
        case "valoriza": return isValoriza(p) ? 1 : 0;
        default: return 0;
      }
    };

    const postFiltered = valorizaOnly ? filtered.filter(isValoriza) : filtered;

    return postFiltered.sort((a, b) => {
      const av = getValue(a, sortColumn);
      const bv = getValue(b, sortColumn);
      let cmp = 0;
      if (typeof av === "string" && typeof bv === "string") {
        cmp = av.localeCompare(bv);
      } else {
        cmp = (av as number) - (bv as number);
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [players, search, clubFilter, sortColumn, sortDirection, valorizaOnly]);

  const totalPages = Math.ceil(filteredPlayers.length / pageSize);
  const paginatedPlayers = filteredPlayers.slice(page * pageSize, (page + 1) * pageSize);

  const handlePositionChange = (val: string) => { setPosition(val); setPage(0); };
  const handleClubChange = (val: string) => { setClubFilter(val); setPage(0); };
  const clearFilters = () => {
    setSearch("");
    setPosition("ALL");
    setClubFilter("ALL");
    setMinPrice(0);
    setMaxPrice(30);
    setMinProjection("");
    setMaxMinimo("");
    setMinBaseAverage("");
    setProbableOnly(true);
    setValorizaOnly(false);
    setPage(0);
  };

  const difRef = useRef<HTMLDivElement>(null);
  const armRef = useRef<HTMLDivElement>(null);
  const { share: shareDif, isSharing: isSharingDif, errorMsg: difError } = useShareCard(
    difRef,
    () => `mitometro-diferencial-${(topDiferencial?.nickname ?? topDiferencial?.name ?? "player").replace(/\s+/g, "_")}.png`,
    "diferencial_rodada"
  );
  const { share: shareArm, isSharing: isSharingArm, errorMsg: armError } = useShareCard(
    armRef,
    () => `mitometro-armadilha-${(topArmadilha?.nickname ?? topArmadilha?.name ?? "player").replace(/\s+/g, "_")}.png`,
    "armadilha_rodada"
  );

  const isPaywalled = (error as { status?: number } | undefined)?.status === 402;
  if (isLoading) return <PageSkeleton variant="list" aria-label="Carregando jogadores" />;
  if (isError && !isPaywalled) {
    return (
      <ErrorState
        title="Não foi possível carregar os jogadores"
        description="Verifique sua conexão e tente novamente."
        onRetry={refetch}
      />
    );
  }

  const SortableHead = ({ col, children, className }: { col: SortColumn; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={`py-4 font-semibold cursor-pointer select-none hover:text-primary motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className ?? ""}`}
      onClick={() => handleSort(col)}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") handleSort(col); }}
      role="button"
      tabIndex={0}
      aria-label={`Ordenar por ${String(children)}`}
    >
      <span className="inline-flex items-center">
        {children}
        <SortIcon column={col} sortColumn={sortColumn} sortDirection={sortDirection} />
      </span>
    </TableHead>
  );

  return (
    <div className="space-y-6 motion-safe:animate-in fade-in slide-in-from-bottom-4 motion-safe:duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Jogadores</h1>
          <p className="text-muted-foreground mt-1">Explore e filtre os {players.length} jogadores ativos.</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-lg shadow-black/5">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-end">
          {/* Search */}
          <div className="space-y-2 xl:col-span-2">
            <Label className="text-xs font-semibold text-muted-foreground">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Nome ou apelido..." 
                className="pl-9 bg-background border-border focus-visible:ring-primary/50 rounded-xl h-10"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              />
            </div>
          </div>
          
          {/* Position */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">Posição</Label>
            <Select value={position} onValueChange={handlePositionChange}>
              <SelectTrigger className="bg-background rounded-xl h-10 border-border focus:ring-primary/50">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas</SelectItem>
                <SelectItem value="GOL">GOL - Goleiro</SelectItem>
                <SelectItem value="ZAG">ZAG - Zagueiro</SelectItem>
                <SelectItem value="LAT">LAT - Lateral</SelectItem>
                <SelectItem value="MEI">MEI - Meia</SelectItem>
                <SelectItem value="ATA">ATA - Atacante</SelectItem>
                <SelectItem value="TEC">TEC - Técnico</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Club filter */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">Clube</Label>
            <Select value={clubFilter} onValueChange={handleClubChange}>
              <SelectTrigger className="bg-background rounded-xl h-10 border-border focus:ring-primary/50">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                {clubs.map(([id, name]) => (
                  <SelectItem key={id} value={String(id)}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Price Range */}
          <div className="space-y-2 xl:col-span-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-muted-foreground">Faixa de preço</Label>
              <span className="text-xs font-mono tabular-nums font-bold text-primary">C$ {minPrice} – {maxPrice}</span>
            </div>
            <Slider 
              value={[minPrice, maxPrice]} 
              onValueChange={(v) => { 
                setMinPrice(v[0]); 
                setMaxPrice(v[1]); 
                setPage(0); 
              }} 
              max={30} 
              min={0}
              step={1}
              className="py-2"
            />
          </div>

          {/* Min Projection */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">Proj. mín. (pts)</Label>
            <div className="relative">
              <TrendingUp className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                type="number"
                placeholder="ex: 3.0"
                className="pl-9 bg-background border-border focus-visible:ring-primary/50 rounded-xl h-10"
                value={minProjection}
                onChange={(e) => { setMinProjection(e.target.value); setPage(0); }}
              />
            </div>
          </div>

          {/* Max Minimo para Valorizar */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">Mín. val. máx. (pts)</Label>
            <div className="relative">
              <ArrowUp className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-attention" />
              <Input 
                type="number"
                placeholder="ex: 5.0"
                className="pl-9 bg-background border-border focus-visible:ring-primary/50 rounded-xl h-10"
                value={maxMinimo}
                onChange={(e) => { setMaxMinimo(e.target.value); setPage(0); }}
              />
            </div>
          </div>

          {/* Min Base Average */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground">Média base mín. (pts)</Label>
            <div className="relative">
              <ArrowUp className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-differential" />
              <Input 
                type="number"
                placeholder="ex: 2.0"
                className="pl-9 bg-background border-border focus-visible:ring-primary/50 rounded-xl h-10"
                value={minBaseAverage}
                onChange={(e) => { setMinBaseAverage(e.target.value); setPage(0); }}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border/50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch 
                id="probable" 
                checked={probableOnly} 
                onCheckedChange={(v) => { setProbableOnly(v); setPage(0); }} 
                className="data-[state=checked]:bg-primary"
              />
              <Label className="text-sm font-medium cursor-pointer" htmlFor="probable">Apenas Prováveis</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch 
                id="valoriza" 
                checked={valorizaOnly} 
                onCheckedChange={(v) => { setValorizaOnly(v); setPage(0); }} 
                className="data-[state=checked]:bg-positive"
              />
              <Label className="text-sm font-medium cursor-pointer flex items-center gap-1" htmlFor="valoriza">
                <Sparkles className="w-3.5 h-3.5 text-positive" />
                Apenas Valorizando
              </Label>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">{filteredPlayers.length} jogadores encontrados</span>
        </div>
      </div>

      {/* ── Destaques da rodada ───────────────────────────────────────────────── */}
      {(topDiferencial || topArmadilha) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Diferencial da rodada */}
          {topDiferencial && (
            <div className="bg-card border border-positive/20 rounded-2xl p-4 shadow-lg shadow-black/5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-positive" />
                  <span className="text-xs font-bold text-positive">Diferencial da rodada</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={shareDif}
                  disabled={isSharingDif}
                  className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2"
                >
                  {isSharingDif ? <Loader2 className="w-3 h-3 animate-spin" /> : <Share2 className="w-3 h-3" />}
                  {isSharingDif ? "Gerando…" : "Compartilhar"}
                </Button>
              </div>
              <div className="flex items-center gap-3">
                {getBadgeUrl(topDiferencial.club?.abbreviation, topDiferencial.club?.badgeUrl) && (
                  <img src={getBadgeUrl(topDiferencial.club?.abbreviation, topDiferencial.club?.badgeUrl)} alt="" className="w-10 h-10 object-contain shrink-0" style={getBadgeScale(topDiferencial.club?.abbreviation) !== 1 ? { transform: `scale(${getBadgeScale(topDiferencial.club?.abbreviation)})` } : undefined} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground truncate">{topDiferencial.nickname ?? topDiferencial.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {topDiferencial.position} · {topDiferencial.club?.abbreviation} · C$ {(topDiferencial.price ?? 0).toFixed(1)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                   <p className="text-lg font-bold text-primary font-mono tabular-nums">
                    {(topDiferencial.projection?.expectedPoints ?? 0).toFixed(1)}
                  </p>
                  <p className="text-xs text-muted-foreground">pts proj.</p>
                </div>
              </div>
              {difError && <p className="text-xs text-destructive mt-2">{difError}</p>}
            </div>
          )}

          {/* Armadilha da rodada */}
          {topArmadilha && (
            <div className="bg-card border border-attention/20 rounded-2xl p-4 shadow-lg shadow-black/5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-attention" />
                  <span className="text-xs font-bold text-attention">Armadilha da rodada</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={shareArm}
                  disabled={isSharingArm}
                  className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2"
                >
                  {isSharingArm ? <Loader2 className="w-3 h-3 animate-spin" /> : <Share2 className="w-3 h-3" />}
                  {isSharingArm ? "Gerando…" : "Compartilhar"}
                </Button>
              </div>
              <div className="flex items-center gap-3">
                {getBadgeUrl(topArmadilha.club?.abbreviation, topArmadilha.club?.badgeUrl) && (
                  <img src={getBadgeUrl(topArmadilha.club?.abbreviation, topArmadilha.club?.badgeUrl)} alt="" className="w-10 h-10 object-contain shrink-0" style={getBadgeScale(topArmadilha.club?.abbreviation) !== 1 ? { transform: `scale(${getBadgeScale(topArmadilha.club?.abbreviation)})` } : undefined} />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-foreground truncate">{topArmadilha.nickname ?? topArmadilha.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {topArmadilha.position} · {topArmadilha.club?.abbreviation} · C$ {(topArmadilha.price ?? 0).toFixed(1)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                   <p className="text-lg font-bold text-attention font-mono tabular-nums">
                    {popularityLabel((topArmadilha.projection?.explanationJson ?? {}) as ExplanationJson)}
                  </p>
                  <p className="text-xs text-muted-foreground">escalação</p>
                </div>
              </div>
              {armError && <p className="text-xs text-destructive mt-2">{armError}</p>}
            </div>
          )}

          {/* Hidden share cards (html-to-image targets) */}
          {topDiferencial && (
            <ShareCardFrame ref={difRef} subtitle="Diferencial da Rodada">
              <div style={{ padding: "14px 20px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                  {getBadgeUrl(topDiferencial.club?.abbreviation, topDiferencial.club?.badgeUrl) && (
                    <img src={getBadgeUrl(topDiferencial.club?.abbreviation, topDiferencial.club?.badgeUrl)} alt="" style={{ width: "36px", height: "36px", objectFit: "contain", ...(getBadgeScale(topDiferencial.club?.abbreviation) !== 1 ? { transform: `scale(${getBadgeScale(topDiferencial.club?.abbreviation)})` } : {}) }} />
                  )}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "18px", color: "#f1f5f9" }}>
                      {topDiferencial.nickname ?? topDiferencial.name}
                    </div>
                    <div style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))" }}>
                      {topDiferencial.position} · {topDiferencial.club?.abbreviation ?? "—"} · C$ {(topDiferencial.price ?? 0).toFixed(1)}
                    </div>
                  </div>
                </div>
                <div style={{ background: "hsl(var(--card))", borderRadius: "10px", padding: "10px 12px", marginBottom: "8px", borderLeft: "3px solid hsl(var(--positive))" }}>
                  <div style={{ fontSize: "12px", color: "hsl(var(--positive))", fontWeight: 700, marginBottom: "4px" }}>
                    Baixa escalação · Alto potencial
                  </div>
                  <div style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))", lineHeight: 1.5 }}>
                    Jogador com alta probabilidade de superar a média com pouca exposição nas escalações.
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                  {[
                    { label: "Projeção", value: `${(topDiferencial.projection?.expectedPoints ?? 0).toFixed(1)} pts`, color: "hsl(var(--positive))" },
                    { label: "Teto",     value: `${(topDiferencial.projection?.ceilingPoints ?? 0).toFixed(1)} pts`,  color: "hsl(var(--differential))" },
                    { label: "Score",    value: `${(topDiferencial.projection?.recommendationScore ?? 0).toFixed(0)}`,  color: "#a855f7" },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: "hsl(var(--card))", borderRadius: "8px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "16px", fontWeight: 800, color }}>{value}</div>
                      <div style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))", marginTop: "3px" }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </ShareCardFrame>
          )}

          {topArmadilha && (
            <ShareCardFrame ref={armRef} subtitle="Armadilha da Rodada">
              <div style={{ padding: "14px 20px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
                  {getBadgeUrl(topArmadilha.club?.abbreviation, topArmadilha.club?.badgeUrl) && (
                    <img src={getBadgeUrl(topArmadilha.club?.abbreviation, topArmadilha.club?.badgeUrl)} alt="" style={{ width: "36px", height: "36px", objectFit: "contain", ...(getBadgeScale(topArmadilha.club?.abbreviation) !== 1 ? { transform: `scale(${getBadgeScale(topArmadilha.club?.abbreviation)})` } : {}) }} />
                  )}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "18px", color: "#f1f5f9" }}>
                      {topArmadilha.nickname ?? topArmadilha.name}
                    </div>
                    <div style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))" }}>
                      {topArmadilha.position} · {topArmadilha.club?.abbreviation ?? "—"} · C$ {(topArmadilha.price ?? 0).toFixed(1)}
                    </div>
                  </div>
                </div>
                <div style={{ background: "hsl(var(--card))", borderRadius: "10px", padding: "10px 12px", marginBottom: "8px", borderLeft: "3px solid hsl(var(--attention))" }}>
                  <div style={{ fontSize: "12px", color: "hsl(var(--attention))", fontWeight: 700, marginBottom: "4px" }}>
                    Alta escalação · Alto risco
                  </div>
                  <div style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))", lineHeight: 1.5 }}>
                    Jogador amplamente escalado com risco elevado de decepcionar na rodada.
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                  {[
                    { label: "Escalação", value: popularityLabel((topArmadilha.projection?.explanationJson ?? {}) as ExplanationJson), color: "hsl(var(--attention))" },
                    { label: "Projeção",  value: `${(topArmadilha.projection?.expectedPoints ?? 0).toFixed(1)} pts`, color: "hsl(var(--danger))" },
                    { label: "Risco",     value: `${((topArmadilha.projection?.riskScore ?? 0) * 100).toFixed(0)}%`,     color: "hsl(var(--danger))" },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: "hsl(var(--card))", borderRadius: "8px", padding: "10px", textAlign: "center" }}>
                      <div style={{ fontSize: "16px", fontWeight: 800, color }}>{value}</div>
                      <div style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))", marginTop: "3px" }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </ShareCardFrame>
          )}
        </div>
      )}

      {/* Table Section */}
      <div className="bg-card border border-border/50 rounded-2xl shadow-lg shadow-black/5 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-secondary/40 border-b border-border/50">
              <TableRow className="hover:bg-transparent">
                <SortableHead col="name" className="w-[280px]">Jogador</SortableHead>
                <SortableHead col="position">Posição</SortableHead>
                <SortableHead col="price" className="text-right">Preço</SortableHead>
                <SortableHead col="averagePoints" className="text-right">Média</SortableHead>
                <SortableHead col="minimoParaValorizar" className="text-right">Mín. Val.</SortableHead>
                <SortableHead col="baseAverage" className="text-right">Média Base</SortableHead>
                <SortableHead col="projection" className="text-right">Projeção</SortableHead>
                <SortableHead col="floorPoints" className="text-right">Piso</SortableHead>
                <SortableHead col="ceilingPoints" className="text-right">Teto</SortableHead>
                <SortableHead col="riskScore" className="text-center">Risco</SortableHead>
                <SortableHead col="playProbability" className="text-center">Prob. Jogo</SortableHead>
                <SortableHead col="valoriza" className="text-center">Valoriza</SortableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedPlayers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-64 text-center text-muted-foreground">
                    <EmptyState
                      icon={Search}
                      title="Nenhum jogador encontrado"
                      description="Tente remover os filtros para ver todos os jogadores disponíveis."
                      actionLabel="Limpar filtros"
                      onAction={clearFilters}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                paginatedPlayers.map((player) => {
                  const prob = player.availability?.playProbability ?? null;
                  const riskScore = player.availability?.riskScore ?? null;
                  const isRisky = prob !== null && prob < 0.5;
                  return (
                    <TableRow key={player.id} className="hover:bg-secondary/20 motion-safe:transition-colors cursor-pointer group border-b-border/30">
                      <TableCell className="py-3">
                        <PlayerCard
                          variant="full"
                          player={{
                            name: player.name ?? "",
                            nickname: player.nickname,
                            club: player.club,
                          }}
                          badges={getTopBadges((player.projection?.explanationJson ?? {}) as ExplanationJson)}
                        >
                          {isRisky && <AlertTriangle className="w-3.5 h-3.5 text-attention shrink-0" />}
                          <PlayerConstraintActions
                            playerName={player.nickname ?? player.name ?? "Jogador"}
                            isLocked={isLocked(player.id)}
                            isExcluded={isExcluded(player.id)}
                            onToggleLocked={() => handleToggleLocked(player)}
                            onToggleExcluded={() => handleToggleExcluded(player)}
                          />
                          <PlayerExplanationSheet
                            exp={(player.projection?.explanationJson ?? {}) as ExplanationJson}
                            playerName={player.nickname ?? player.name ?? ""}
                            position={player.position ?? undefined}
                            minimoParaValorizar={player.minimoParaValorizar}
                            baseAverage={player.baseAverage}
                          />
                        </PlayerCard>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`font-mono text-xs ${getPositionColor(player.position)} border`}>
                          {player.position}
                        </Badge>
                      </TableCell>
                       <TableCell className="text-right font-mono tabular-nums text-sm text-foreground">
                        <div className="flex items-center justify-end gap-1">
                          <span>C$ {player.price?.toFixed(2) ?? '-'}</span>
                          {player.priceVariation != null && player.priceVariation !== 0 && (
                            <span className={`flex items-center gap-0.5 text-xs font-bold tabular-nums ${
                              player.priceVariation > 0 ? 'text-positive' : 'text-danger'
                            }`}>
                              {player.priceVariation > 0
                                ? <TrendingUp className="w-3 h-3" />
                                : <TrendingDown className="w-3 h-3" />}
                              {player.priceVariation > 0 ? '+' : ''}C${player.priceVariation.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                       <TableCell className="text-right font-mono tabular-nums text-sm text-muted-foreground">
                        {player.averagePoints?.toFixed(1) ?? '-'}
                      </TableCell>
                       <TableCell className="text-right font-mono tabular-nums text-sm" title="Mínimo para valorizar: pontuação mínima para aumentar de preço">
                        {player.minimoParaValorizar != null
                          ? <span className="text-attention font-semibold">↑{player.minimoParaValorizar.toFixed(1)}</span>
                          : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                       <TableCell className="text-right font-mono tabular-nums text-sm" title="Média base: pontuação sem contar Gols, Assistências e SG">
                        {player.baseAverage != null
                          ? <span className="text-differential">{player.baseAverage.toFixed(1)}</span>
                          : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-right">
                           <span className="font-mono tabular-nums font-bold text-primary text-base">
                          {player.projection?.expectedPoints?.toFixed(1) ?? '-'}
                        </span>
                      </TableCell>
                       <TableCell className="text-right font-mono tabular-nums text-sm text-muted-foreground">
                        <ProGate variant="inline">
                          {player.projection?.floorPoints?.toFixed(1) ?? '-'}
                        </ProGate>
                      </TableCell>
                       <TableCell className="text-right font-mono tabular-nums text-sm text-muted-foreground">
                        <ProGate variant="inline">
                          {player.projection?.ceilingPoints?.toFixed(1) ?? '-'}
                        </ProGate>
                      </TableCell>
                      <TableCell className="text-center">
                        <ProGate variant="inline">
                          {riskScore !== null ? (
                            <div className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-bold tabular-nums ${
                              riskScore < 0.3 ? 'bg-positive/10 text-positive' :
                              riskScore < 0.6 ? 'bg-attention/10 text-attention' :
                              'bg-danger/10 text-danger'
                            }`}>
                              {riskScore.toFixed(2)}
                            </div>
                          ) : <span className="text-muted-foreground text-xs">-</span>}
                        </ProGate>
                      </TableCell>
                      <TableCell className="text-center">
                        <ProGate variant="inline">
                          {prob !== null ? (
                            <div className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-bold tabular-nums ${
                              prob >= 0.7 ? 'bg-positive/10 text-positive' :
                              prob >= 0.4 ? 'bg-attention/10 text-attention' :
                              'bg-danger/10 text-danger'
                            }`}>
                              {(prob * 100).toFixed(0)}%
                            </div>
                          ) : <span className="text-muted-foreground text-xs">-</span>}
                        </ProGate>
                      </TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const exp = player.projection?.expectedPoints;
                          const min = player.minimoParaValorizar;
                          if (exp == null || min == null) {
                            return <span className="text-muted-foreground text-xs">-</span>;
                          }
                          const diff = exp - min;
                          if (diff >= 0) {
                            return (
                              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold tabular-nums bg-positive/10 text-positive border border-positive/20" title={`Projeção supera o mínimo por ${diff.toFixed(1)} pts`}>
                                <Sparkles className="w-3 h-3" />
                                +{diff.toFixed(1)}
                              </div>
                            );
                          }
                          return (
                            <div className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-xs font-bold tabular-nums bg-secondary text-muted-foreground" title={`Falta ${Math.abs(diff).toFixed(1)} pts para valorizar`}>
                              {diff.toFixed(1)}
                            </div>
                          );
                        })()}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination */}
        {!isLoading && totalPages > 1 && (
          <div className="p-4 border-t border-border/50 bg-secondary/10 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Mostrando <span className="font-semibold text-foreground">{page * pageSize + 1}</span> a <span className="font-semibold text-foreground">{Math.min((page + 1) * pageSize, filteredPlayers.length)}</span> de <span className="font-semibold text-foreground">{filteredPlayers.length}</span>
            </span>
            <div className="flex items-center gap-2">
                 <Button
                 aria-label="Página anterior"
                variant="outline" 
                size="icon" 
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="w-8 h-8 rounded-lg"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
               <Button
                 aria-label="Próxima página"
                variant="outline" 
                size="icon" 
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="w-8 h-8 rounded-lg"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
