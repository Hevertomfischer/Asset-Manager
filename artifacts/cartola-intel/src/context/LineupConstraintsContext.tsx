import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export interface ConstraintPlayer {
  id: number;
  name: string;
  position?: string | null;
  clubAbbr?: string | null;
  price?: number | null;
}

interface LineupConstraintsValue {
  lockedPlayers: ConstraintPlayer[];
  excludedPlayers: ConstraintPlayer[];
  lockedPlayerIds: number[];
  excludedPlayerIds: number[];
  isLocked: (playerId: number) => boolean;
  isExcluded: (playerId: number) => boolean;
  toggleLocked: (player: ConstraintPlayer) => void;
  toggleExcluded: (player: ConstraintPlayer) => void;
  clear: () => void;
}

const LineupConstraintsContext = createContext<LineupConstraintsValue | null>(null);

export function LineupConstraintsProvider({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState<Map<number, ConstraintPlayer>>(new Map());
  const [excluded, setExcluded] = useState<Map<number, ConstraintPlayer>>(new Map());

  const toggleLocked = useCallback((player: ConstraintPlayer) => {
    setLocked((current) => {
      const next = new Map(current);
      if (next.has(player.id)) next.delete(player.id);
      else next.set(player.id, player);
      return next;
    });
    setExcluded((current) => {
      if (!current.has(player.id)) return current;
      const next = new Map(current);
      next.delete(player.id);
      return next;
    });
  }, []);

  const toggleExcluded = useCallback((player: ConstraintPlayer) => {
    setExcluded((current) => {
      const next = new Map(current);
      if (next.has(player.id)) next.delete(player.id);
      else next.set(player.id, player);
      return next;
    });
    setLocked((current) => {
      if (!current.has(player.id)) return current;
      const next = new Map(current);
      next.delete(player.id);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setLocked(new Map());
    setExcluded(new Map());
  }, []);

  const value = useMemo<LineupConstraintsValue>(() => ({
    lockedPlayers: [...locked.values()],
    excludedPlayers: [...excluded.values()],
    lockedPlayerIds: [...locked.keys()],
    excludedPlayerIds: [...excluded.keys()],
    isLocked: (playerId) => locked.has(playerId),
    isExcluded: (playerId) => excluded.has(playerId),
    toggleLocked,
    toggleExcluded,
    clear,
  }), [locked, excluded, toggleLocked, toggleExcluded, clear]);

  return (
    <LineupConstraintsContext.Provider value={value}>
      {children}
    </LineupConstraintsContext.Provider>
  );
}

export function useLineupConstraints() {
  const context = useContext(LineupConstraintsContext);
  if (!context) throw new Error("useLineupConstraints must be used within LineupConstraintsProvider");
  return context;
}