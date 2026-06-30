import { useState, useMemo, useEffect, useCallback } from "react";
import { usePaywall } from "@/context/PaywallContext";
import { useGetPlayers } from "@workspace/api-client-react";
import { getPositionColor } from "@/hooks/use-custom-api";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, AlertCircle, ChevronLeft, ChevronRight, TrendingUp, AlertTriangle, TrendingDown, ArrowUpDown, ArrowUp, ArrowDown, Sparkles } from "lucide-react";
import { ProGate } from "@/components/ProGate";
import { type ExplanationJson, type InsightKind, getTopBadges } from "@/lib/explainPlayer";
import { PlayerExplanationSheet } from "@/components/PlayerExplanationSheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const chipClass: Record<InsightKind, string> = {
  positive: "bg-green-500/10 text-green-500 border-green-500/20",
  warning:  "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  info:     "bg-blue-400/10 text-blue-400 border-blue-400/20",
  neutral:  "bg-secondary text-muted-foreground border-border/50",
};

function PlayerBadges({ exp }: { exp: ExplanationJson }) {
  const badges = getTopBadges(exp);
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {badges.map((badge) =>
        badge.requiresPro ? (
          <ProGate key={badge.label} variant="inline">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${chipClass[badge.kind]}`}>
              {badge.label}
            </span>
          </ProGate>
        ) : (
          <span key={badge.label} className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${chipClass[badge.kind]}`}>
            {badge.label}
          </span>
        )
      )}
    </div>
  );
}

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

  const { data, isLoading, isError, error } = useGetPlayers({
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

  const SortableHead = ({ col, children, className }: { col: SortColumn; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={`py-4 font-semibold cursor-pointer select-none hover:text-primary transition-colors ${className ?? ""}`}
      onClick={() => handleSort(col)}
    >
      <span className="inline-flex items-center">
        {children}
        <SortIcon column={col} sortColumn={sortColumn} sortDirection={sortDirection} />
      </span>
    </TableHead>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
            <Label className="text-xs font-semibold text-muted-foreground uppercase">Buscar</Label>
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
            <Label className="text-xs font-semibold text-muted-foreground uppercase">Posição</Label>
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
            <Label className="text-xs font-semibold text-muted-foreground uppercase">Clube</Label>
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
              <Label className="text-xs font-semibold text-muted-foreground uppercase">Faixa de Preço</Label>
              <span className="text-xs font-mono font-bold text-primary">C$ {minPrice} – {maxPrice}</span>
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
            <Label className="text-xs font-semibold text-muted-foreground uppercase">Proj. mín. (pts)</Label>
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
            <Label className="text-xs font-semibold text-muted-foreground uppercase">Mín. Val. máx. (pts)</Label>
            <div className="relative">
              <ArrowUp className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500" />
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
            <Label className="text-xs font-semibold text-muted-foreground uppercase">Média Base mín. (pts)</Label>
            <div className="relative">
              <ArrowUp className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
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
                className="data-[state=checked]:bg-emerald-500"
              />
              <Label className="text-sm font-medium cursor-pointer flex items-center gap-1" htmlFor="valoriza">
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                Apenas Valorizando
              </Label>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">{filteredPlayers.length} jogadores encontrados</span>
        </div>
      </div>

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
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-64 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Carregando base de dados...
                    </div>
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-destructive">
                      <AlertCircle className="w-8 h-8 opacity-70" />
                      <p className="text-sm font-medium">Erro ao carregar jogadores.</p>
                      <p className="text-xs text-muted-foreground">Verifique se o servidor está disponível.</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedPlayers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="h-64 text-center text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    Nenhum jogador encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedPlayers.map((player) => {
                  const prob = player.availability?.playProbability ?? null;
                  const riskScore = player.availability?.riskScore ?? null;
                  const isRisky = prob !== null && prob < 0.5;
                  return (
                    <TableRow key={player.id} className="hover:bg-secondary/20 transition-colors cursor-pointer group border-b-border/30">
                      <TableCell className="py-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-9 h-9 border border-border">
                            <AvatarImage src={player.club?.badgeUrl ?? undefined} />
                            <AvatarFallback className="bg-secondary text-xs">{player.club?.abbreviation || '??'}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">{player.nickname ?? player.name}</p>
                              {isRisky && <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />}
                              <PlayerExplanationSheet
                                exp={(player.projection?.explanationJson ?? {}) as ExplanationJson}
                                playerName={player.nickname ?? player.name ?? ""}
                                position={player.position ?? undefined}
                                minimoParaValorizar={player.minimoParaValorizar}
                                baseAverage={player.baseAverage}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground">{player.club?.name}</p>
                            <PlayerBadges exp={(player.projection?.explanationJson ?? {}) as ExplanationJson} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`font-mono text-[10px] ${getPositionColor(player.position)} border`}>
                          {player.position}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-foreground">
                        <div className="flex items-center justify-end gap-1">
                          <span>C$ {player.price?.toFixed(2) ?? '-'}</span>
                          {player.priceVariation != null && player.priceVariation !== 0 && (
                            <span className={`flex items-center gap-0.5 text-[10px] font-bold ${
                              player.priceVariation > 0 ? 'text-green-500' : 'text-red-500'
                            }`}>
                              {player.priceVariation > 0
                                ? <TrendingUp className="w-3 h-3" />
                                : <TrendingDown className="w-3 h-3" />}
                              {player.priceVariation > 0 ? '+' : ''}C${player.priceVariation.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {player.averagePoints?.toFixed(1) ?? '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm" title="Mínimo para valorizar: pontuação mínima para aumentar de preço">
                        {player.minimoParaValorizar != null
                          ? <span className="text-amber-500 font-semibold">↑{player.minimoParaValorizar.toFixed(1)}</span>
                          : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm" title="Média base: pontuação sem contar Gols, Assistências e SG">
                        {player.baseAverage != null
                          ? <span className="text-blue-400">base {player.baseAverage.toFixed(1)}</span>
                          : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-mono font-bold text-primary text-base">
                          {player.projection?.expectedPoints?.toFixed(1) ?? '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        <ProGate variant="inline">
                          {player.projection?.floorPoints?.toFixed(1) ?? '-'}
                        </ProGate>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        <ProGate variant="inline">
                          {player.projection?.ceilingPoints?.toFixed(1) ?? '-'}
                        </ProGate>
                      </TableCell>
                      <TableCell className="text-center">
                        <ProGate variant="inline">
                          {riskScore !== null ? (
                            <div className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                              riskScore < 0.3 ? 'bg-green-500/10 text-green-500' :
                              riskScore < 0.6 ? 'bg-yellow-500/10 text-yellow-500' :
                              'bg-red-500/10 text-red-500'
                            }`}>
                              {riskScore.toFixed(2)}
                            </div>
                          ) : <span className="text-muted-foreground text-xs">-</span>}
                        </ProGate>
                      </TableCell>
                      <TableCell className="text-center">
                        <ProGate variant="inline">
                          {prob !== null ? (
                            <div className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold ${
                              prob >= 0.7 ? 'bg-green-500/10 text-green-500' :
                              prob >= 0.4 ? 'bg-yellow-500/10 text-yellow-500' :
                              'bg-red-500/10 text-red-500'
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
                              <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" title={`Projeção supera o mínimo por ${diff.toFixed(1)} pts`}>
                                <Sparkles className="w-3 h-3" />
                                +{diff.toFixed(1)}
                              </div>
                            );
                          }
                          return (
                            <div className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-bold bg-secondary text-muted-foreground" title={`Falta ${Math.abs(diff).toFixed(1)} pts para valorizar`}>
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
                variant="outline" 
                size="icon" 
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="w-8 h-8 rounded-lg"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button 
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
