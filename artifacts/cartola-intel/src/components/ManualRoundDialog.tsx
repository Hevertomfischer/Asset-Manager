/**
 * ManualRoundDialog — form to manually register a user team round.
 *
 * Player search reuses the same autocomplete pattern from comparar.tsx
 * (local filter over useGetPlayers({ probableOnly: "false" })).
 *
 * Positions: GOL, ZAG, LAT, MEI, ATA for the 12 field players.
 * The TEC (técnico) is optional and handled separately.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { Search, X, Crown, Loader2, UserPlus, ShieldCheck, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { getPositionColor } from "@/hooks/use-custom-api";
import {
  useGetPlayers,
  useRegisterRoundManually,
  type ManualRoundPlayerInput,
  type Player,
} from "@workspace/api-client-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const FIELD_POSITIONS = ["GOL", "ZAG", "LAT", "MEI", "ATA"] as const;
const ALL_POSITIONS = [...FIELD_POSITIONS, "TEC"] as const;
const FIELD_PLAYER_COUNT = 12;

// ── Selected player state ─────────────────────────────────────────────────────

interface SelectedPlayer {
  player: Player;
  position: string;
  price: number;
  isTec: boolean;
}

// ── PlayerSearchInput ─────────────────────────────────────────────────────────

function PlayerSearchInput({
  allPlayers,
  excludeIds,
  placeholder,
  onSelect,
  onlyPositions,
}: {
  allPlayers: Player[];
  excludeIds: Set<number>;
  placeholder: string;
  onSelect: (player: Player) => void;
  onlyPositions?: string[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (q.length < 2) return [];
    return allPlayers
      .filter((p) => {
        if (excludeIds.has(p.id)) return false;
        if (onlyPositions && !onlyPositions.includes(p.position)) return false;
        const name = p.name.toLowerCase();
        const nick = p.nickname?.toLowerCase() ?? "";
        return name.includes(q) || nick.includes(q);
      })
      .slice(0, 8);
  }, [allPlayers, query, excludeIds, onlyPositions]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9 rounded-xl border-border/60 bg-secondary text-sm h-9"
          placeholder={placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => query.length >= 2 && setOpen(true)}
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-border/60 bg-popover shadow-xl overflow-hidden">
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-secondary/80 motion-safe:transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => { onSelect(p); setQuery(""); setOpen(false); }}
            >
              <Badge
                variant="outline"
                className={`text-xs font-mono w-8 justify-center shrink-0 ${getPositionColor(p.position)}`}
              >
                {p.position}
              </Badge>
              <span className="flex-1 min-w-0 truncate font-medium">{p.nickname ?? p.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground font-mono">
                C$ {(p.price ?? 0).toFixed(1)}
              </span>
            </button>
          ))}
        </div>
      )}
      {open && query.length >= 2 && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-border/60 bg-popover shadow-xl px-3 py-3">
          <p className="text-xs text-muted-foreground">Nenhum jogador encontrado para "{query}"</p>
        </div>
      )}
    </div>
  );
}

// ── ManualRoundDialog ─────────────────────────────────────────────────────────

interface Props {
  teamId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ManualRoundDialog({ teamId, open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { data: playersData } = useGetPlayers({ probableOnly: "false" });
  const allPlayers: Player[] = playersData?.players ?? [];
  const mutation = useRegisterRoundManually();

  const [round, setRound] = useState<string>("");
  const [budget, setBudget] = useState<string>("");
  const [selected, setSelected] = useState<SelectedPlayer[]>([]);
  const [captainId, setCaptainId] = useState<number | null>(null);
  const [tec, setTec] = useState<Player | null>(null);

  const excludeIds = useMemo(
    () => new Set([...selected.map((s) => s.player.id), ...(tec ? [tec.id] : [])]),
    [selected, tec]
  );

  const fieldPlayers = selected.filter((s) => !s.isTec);
  const remaining = FIELD_PLAYER_COUNT - fieldPlayers.length;
  const isReady = fieldPlayers.length === FIELD_PLAYER_COUNT && captainId !== null;

  function addFieldPlayer(player: Player) {
    if (fieldPlayers.length >= FIELD_PLAYER_COUNT) return;
    const defaultPos = FIELD_POSITIONS.includes(player.position as typeof FIELD_POSITIONS[number])
      ? player.position
      : "ATA";
    setSelected((prev) => [
      ...prev,
      { player, position: defaultPos, price: player.price ?? 0, isTec: false },
    ]);
  }

  function removePlayer(id: number) {
    setSelected((prev) => prev.filter((s) => s.player.id !== id));
    if (captainId === id) setCaptainId(null);
  }

  function updatePosition(id: number, position: string) {
    setSelected((prev) =>
      prev.map((s) => (s.player.id === id ? { ...s, position } : s))
    );
  }

  function updatePrice(id: number, price: string) {
    setSelected((prev) =>
      prev.map((s) => (s.player.id === id ? { ...s, price: Number(price) || 0 } : s))
    );
  }

  function handleReset() {
    setRound("");
    setBudget("");
    setSelected([]);
    setCaptainId(null);
    setTec(null);
  }

  async function handleSubmit() {
    if (!isReady) return;
    const roundNum = parseInt(round, 10);
    if (isNaN(roundNum) || roundNum < 1) {
      toast({ title: "Rodada inválida", variant: "destructive" });
      return;
    }

    const players: ManualRoundPlayerInput[] = fieldPlayers.map((s) => ({
      playerId: s.player.id,
      position: s.position,
      price: s.price > 0 ? s.price : undefined,
    }));

    try {
      await mutation.mutateAsync({
        teamId,
        round: roundNum,
        players,
        captainPlayerId: captainId!,
        coachPlayerId: tec?.id ?? null,
        budgetUsed: budget ? parseFloat(budget) : null,
      });
      toast({ title: `Rodada ${roundNum} registrada!`, description: "Seu time foi salvo com sucesso." });
      handleReset();
      onOpenChange(false);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? "Erro ao registrar rodada.";
      toast({ title: "Erro", description: msg, variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleReset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg rounded-2xl border border-border/60 bg-card max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/30">
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-4 h-4 text-primary" />
            Registrar rodada manualmente
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Escolha os 12 jogadores escalados, marque o capitão e (opcionalmente) o técnico.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto">
          <div className="px-6 py-4 space-y-5">

            {/* ── Round + Budget ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="round-num" className="text-xs font-medium text-muted-foreground">
                  Rodada *
                </Label>
                <Input
                  id="round-num"
                  type="number"
                  min="1"
                  placeholder="Ex: 12"
                  value={round}
                  onChange={(e) => setRound(e.target.value)}
                  className="rounded-xl border-border/60 bg-secondary h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="budget" className="text-xs font-medium text-muted-foreground">
                  Cartoletas gastas
                </Label>
                <Input
                  id="budget"
                  type="number"
                  step="0.01"
                  placeholder="Ex: 107.50"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="rounded-xl border-border/60 bg-secondary h-9 text-sm"
                />
              </div>
            </div>

            {/* ── Field players search ───────────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">
                  Jogadores de campo *
                </Label>
                <span className={`text-xs font-mono ${fieldPlayers.length === FIELD_PLAYER_COUNT ? "text-positive" : "text-muted-foreground"}`}>
                  {fieldPlayers.length}/{FIELD_PLAYER_COUNT}
                </span>
              </div>

              {remaining > 0 && (
                <PlayerSearchInput
                  allPlayers={allPlayers}
                  excludeIds={excludeIds}
                  placeholder={`Buscar jogador (${remaining} restante${remaining !== 1 ? "s" : ""})…`}
                  onSelect={addFieldPlayer}
                  onlyPositions={[...FIELD_POSITIONS]}
                />
              )}

              {/* Player rows */}
              {fieldPlayers.length > 0 && (
                <div className="space-y-1.5 mt-1">
                  {fieldPlayers.map(({ player, position, price }) => (
                    <div
                      key={player.id}
                      className={`flex items-center gap-2 p-2 rounded-xl border motion-safe:transition-colors ${
                        captainId === player.id
                          ? "bg-attention/8 border-attention/25"
                          : "bg-secondary/50 border-border/30"
                      }`}
                    >
                      {/* Captain toggle */}
                      <button
                        type="button"
                        title="Marcar como capitão"
                        onClick={() => setCaptainId((prev) => (prev === player.id ? null : player.id))}
                        aria-label={`${captainId === player.id ? "Desmarcar capitão" : "Marcar como capitão"}: ${player.nickname ?? player.name}`}
                        className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          captainId === player.id
                            ? "bg-attention/20 text-attention"
                            : "bg-secondary text-muted-foreground hover:text-attention"
                        }`}
                      >
                        <Crown className="w-3 h-3" />
                      </button>

                      {/* Position selector */}
                      <select
                        value={position}
                        onChange={(e) => updatePosition(player.id, e.target.value)}
                        className={`text-xs font-mono font-semibold w-12 h-6 rounded-md border bg-transparent text-center appearance-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${getPositionColor(position)}`}
                        style={{ borderColor: "color-mix(in srgb, currentColor 30%, transparent)" }}
                      >
                        {FIELD_POSITIONS.map((p) => (
                          <option key={p} value={p} className="bg-background text-foreground">
                            {p}
                          </option>
                        ))}
                      </select>

                      {/* Name */}
                      <span className={`flex-1 min-w-0 text-sm truncate ${captainId === player.id ? "text-attention font-semibold" : "text-foreground"}`}>
                        {player.nickname ?? player.name}
                      </span>

                      {/* Price input */}
                      <input
                        type="number"
                        step="0.1"
                        value={price}
                        onChange={(e) => updatePrice(player.id, e.target.value)}
                        className="w-16 h-6 rounded-md border border-border/40 bg-secondary text-xs tabular-nums font-mono text-center text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder="C$"
                        title="Cartoletas"
                      />

                      {/* Remove */}
                      <button
                        type="button"
                        onClick={() => removePlayer(player.id)}
                        aria-label={`Remover ${player.nickname ?? player.name}`}
                        className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {fieldPlayers.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">
                  Busque e adicione seus 12 jogadores acima.
                </p>
              )}
            </div>

            {/* ── Caption note ───────────────────────────────────────────── */}
            {fieldPlayers.length > 0 && captainId === null && (
              <p className="text-xs text-attention/80 flex items-center gap-1.5">
                <Crown className="w-3 h-3 shrink-0" />
                Clique no ícone de coroa para marcar o capitão.
              </p>
            )}

            {/* ── TEC (coach) ────────────────────────────────────────────── */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground">
                Técnico (opcional)
              </Label>
              {tec ? (
                <div className="flex items-center gap-2 p-2 rounded-xl bg-secondary/50 border border-border/30">
                  <Badge variant="outline" className="text-xs font-mono border-primary/30 text-primary">TEC</Badge>
                  <span className="flex-1 text-sm text-foreground truncate">{tec.nickname ?? tec.name}</span>
                  <button
                    type="button"
                    onClick={() => setTec(null)}
                    aria-label="Remover técnico"
                    className="text-muted-foreground hover:text-destructive motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <PlayerSearchInput
                  allPlayers={allPlayers}
                  excludeIds={excludeIds}
                  placeholder="Buscar técnico…"
                  onSelect={(p) => setTec(p)}
                  onlyPositions={["TEC"]}
                />
              )}
            </div>
          </div>
        </ScrollArea>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-border/30 flex items-center justify-between gap-3">
          {/* Validation summary */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className={fieldPlayers.length === FIELD_PLAYER_COUNT ? "text-positive" : ""}>
              {fieldPlayers.length === FIELD_PLAYER_COUNT ? (
                <Check className="inline w-3.5 h-3.5 mr-1" />
              ) : null}
              {fieldPlayers.length}/{FIELD_PLAYER_COUNT} jogadores
            </span>
            <span className={captainId !== null ? "text-positive" : ""}>
              {captainId !== null ? (
                <Crown className="inline w-3.5 h-3.5 mr-1 text-attention" />
              ) : null}
              {captainId !== null ? "Capitão ✓" : "Sem capitão"}
            </span>
          </div>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="rounded-xl"
              onClick={() => { handleReset(); onOpenChange(false); }}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="rounded-xl bg-gradient-to-r from-primary to-accent font-semibold"
              disabled={!isReady || !round || mutation.isPending}
              onClick={handleSubmit}
            >
              {mutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <UserPlus className="w-3.5 h-3.5 mr-1.5" />
              )}
              Registrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
