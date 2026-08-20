import { useMemo } from "react";
import { useGetPlayers, type LineupPlayer, type LineupReservePlayer, type LineupSuggestion, type Player } from "@workspace/api-client-react";
import { ArrowLeftRight, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { getReplacementSuggestions } from "@/lib/replacementSuggestions";

interface ReplacementSuggestionsProps {
  outPlayer: LineupPlayer;
  lineup: LineupSuggestion;
  reserves?: LineupReservePlayer[];
  onSelect: (candidate: Player) => void;
  onBrowseAll: () => void;
}

export function ReplacementSuggestions({
  outPlayer,
  lineup,
  reserves = [],
  onSelect,
  onBrowseAll,
}: ReplacementSuggestionsProps) {
  const { data, isLoading, isError } = useGetPlayers(
    outPlayer.position
      ? {
          position: outPlayer.position,
          probableOnly: "false",
          ...(lineup.round ? { round: lineup.round } : {}),
        }
      : undefined,
  );

  const lineupPlayerIds = useMemo(
    () => new Set(
      (lineup.players ?? [])
        .map((player) => player.playerId)
        .filter((playerId): playerId is number => playerId != null),
    ),
    [lineup.players],
  );
  const reserveIds = useMemo(
    () => new Set(reserves.map((reserve) => reserve.playerId)),
    [reserves],
  );
  const suggestions = useMemo(
    () => getReplacementSuggestions(data?.players ?? [], outPlayer, lineupPlayerIds),
    [data?.players, lineupPlayerIds, outPlayer],
  );

  return (
    <section aria-label={`Sugestões para substituir ${outPlayer.nickname ?? outPlayer.name ?? "jogador"}`} className="rounded-xl border border-primary/20 bg-primary/[0.035] p-3">
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-primary">Melhores alternativas</p>
            <p className="text-[10px] text-muted-foreground">Mesma posição · projeção da rodada</p>
          </div>
        </div>
        <span className="text-[10px] font-mono font-semibold text-muted-foreground">{outPlayer.position}</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Buscando opções...
        </div>
      ) : isError ? (
        <p className="py-2 text-xs text-destructive">Não foi possível buscar substitutos agora.</p>
      ) : suggestions.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">
          Não há alternativas elegíveis para esta posição nesta rodada.
        </p>
      ) : (
        <div className="space-y-1.5">
          {suggestions.map(({ player, expectedPoints, deltaExpectedPoints, playProbability }) => {
            const positiveDelta = deltaExpectedPoints >= 0;
            const displayName = player.nickname ?? player.name;
            return (
              <button
                key={player.id}
                type="button"
                onClick={() => onSelect(player)}
                className="w-full text-left rounded-lg border border-border/50 bg-background/70 px-2.5 py-2 transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div className="flex items-center gap-2">
                  <span className="w-4 text-center text-[10px] font-black text-muted-foreground">
                    {suggestions.findIndex((item) => item.player.id === player.id) + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-xs font-semibold text-foreground">{displayName}</span>
                      {reserveIds.has(player.id) && (
                        <span className="shrink-0 rounded bg-purple-500/15 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-purple-400">Reserva</span>
                      )}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span>{player.club?.abbreviation ?? player.club?.name ?? "—"}</span>
                      <span>·</span>
                      <span>C$ {(player.price ?? 0).toFixed(2)}</span>
                      {playProbability != null && (
                        <>
                          <span>·</span>
                          <span>{Math.round(playProbability * 100)}% joga</span>
                        </>
                      )}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    <span className="block font-mono text-xs font-bold text-primary">{expectedPoints.toFixed(1)}</span>
                    <span className={`block text-[10px] font-semibold ${positiveDelta ? "text-emerald-500" : "text-red-400"}`}>
                      {positiveDelta ? "+" : ""}{deltaExpectedPoints.toFixed(1)} pts
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
          {suggestions.length < 3 && (
            <p className="px-1 pt-1 text-[10px] text-muted-foreground">
              Apenas {suggestions.length} alternativa{suggestions.length === 1 ? "" : "s"} elegível{suggestions.length === 1 ? "" : "is"} no momento.
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onBrowseAll}
        className="mt-2.5 inline-flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeftRight className="w-3.5 h-3.5" />
        Ver todas as opções
        <ChevronRight className="w-3.5 h-3.5" />
      </button>
    </section>
  );
}