import { useState, useMemo } from "react";
import { useGetPlayers } from "@workspace/api-client-react";
import { getPositionColor } from "@/hooks/use-custom-api";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, Filter, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function Players() {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState<string>("ALL");
  const [maxPrice, setMaxPrice] = useState<number>(30);
  const [probableOnly, setProbableOnly] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  // We fetch all or rely on API params if it supported it fully. 
  // The generated hook takes params: position, minPrice, maxPrice, probableOnly, minProjection
  const { data, isLoading } = useGetPlayers({
    position: position === "ALL" ? undefined : position,
    maxPrice,
    probableOnly: probableOnly ? "true" : "false"
  });

  const players = data?.players || [];

  const filteredPlayers = useMemo(() => {
    return players
      .filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || 
                   (p.nickname && p.nickname.toLowerCase().includes(search.toLowerCase())))
      .sort((a, b) => (b.projection?.expectedPoints || 0) - (a.projection?.expectedPoints || 0));
  }, [players, search]);

  const totalPages = Math.ceil(filteredPlayers.length / pageSize);
  const paginatedPlayers = filteredPlayers.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Player Database</h1>
          <p className="text-muted-foreground mt-1">Explore and filter all {players.length} active players.</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-card border border-border/50 rounded-2xl p-5 shadow-lg shadow-black/5">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase">Search Player</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Name or nickname..." 
                className="pl-9 bg-background border-border focus-visible:ring-primary/50 rounded-xl h-11"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase">Position</Label>
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger className="bg-background rounded-xl h-11 border-border focus:ring-primary/50">
                <SelectValue placeholder="All Positions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Positions</SelectItem>
                <SelectItem value="GOL">GOL - Goleiro</SelectItem>
                <SelectItem value="ZAG">ZAG - Zagueiro</SelectItem>
                <SelectItem value="LAT">LAT - Lateral</SelectItem>
                <SelectItem value="MEI">MEI - Meia</SelectItem>
                <SelectItem value="ATA">ATA - Atacante</SelectItem>
                <SelectItem value="TEC">TEC - Técnico</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-muted-foreground uppercase">Max Price</Label>
              <span className="text-sm font-mono font-bold text-primary">C$ {maxPrice}</span>
            </div>
            <Slider 
              value={[maxPrice]} 
              onValueChange={(v) => setMaxPrice(v[0])} 
              max={30} 
              step={1}
              className="py-1"
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-border/50 bg-background h-11">
            <Label className="text-sm font-medium cursor-pointer" htmlFor="probable">Probable Only</Label>
            <Switch 
              id="probable" 
              checked={probableOnly} 
              onCheckedChange={setProbableOnly} 
              className="data-[state=checked]:bg-primary"
            />
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-card border border-border/50 rounded-2xl shadow-lg shadow-black/5 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-secondary/40 border-b border-border/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[300px] py-4 font-semibold">Player</TableHead>
                <TableHead className="py-4 font-semibold">Position</TableHead>
                <TableHead className="py-4 font-semibold text-right">Price</TableHead>
                <TableHead className="py-4 font-semibold text-right">Proj. Pts</TableHead>
                <TableHead className="py-4 font-semibold text-right">Floor</TableHead>
                <TableHead className="py-4 font-semibold text-right">Ceiling</TableHead>
                <TableHead className="py-4 font-semibold text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Loading database...
                    </div>
                  </TableCell>
                </TableRow>
              ) : paginatedPlayers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No players found matching criteria.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedPlayers.map((player) => (
                  <TableRow key={player.id} className="hover:bg-secondary/20 transition-colors cursor-pointer group border-b-border/30">
                    <TableCell className="py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-9 h-9 border border-border">
                          <AvatarImage src={player.club?.badgeUrl ?? undefined} />
                          <AvatarFallback className="bg-secondary text-xs">{player.club?.abbreviation || '??'}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-foreground group-hover:text-primary transition-colors">{player.name}</p>
                          <p className="text-xs text-muted-foreground">{player.club?.name}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`font-mono text-[10px] ${getPositionColor(player.position)} border`}>
                        {player.position}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-foreground">
                      {player.price?.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-mono font-bold text-primary text-base">
                        {player.projection?.expectedPoints?.toFixed(1) || '-'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {player.projection?.floorPoints?.toFixed(1) || '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {player.projection?.ceilingPoints?.toFixed(1) || '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center">
                        <div className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          (player.availability?.playProbability || 0) >= 0.7 ? 'bg-green-500/10 text-green-500' :
                          (player.availability?.playProbability || 0) >= 0.4 ? 'bg-yellow-500/10 text-yellow-500' :
                          'bg-red-500/10 text-red-500'
                        }`}>
                          {(player.availability?.playProbability || 0) * 100}%
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination */}
        {!isLoading && totalPages > 1 && (
          <div className="p-4 border-t border-border/50 bg-secondary/10 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{page * pageSize + 1}</span> to <span className="font-semibold text-foreground">{Math.min((page + 1) * pageSize, filteredPlayers.length)}</span> of <span className="font-semibold text-foreground">{filteredPlayers.length}</span>
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
