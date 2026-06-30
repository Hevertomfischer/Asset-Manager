/**
 * PlayerCard — componente compartilhado de exibição de jogador.
 *
 * variant="compact"  Linha única: badge posição + nome + clube + pts.
 *                    Usado em listas densas (fronteira, reservas da escalação).
 * variant="full"     Avatar do clube + nome + clube + badges de insight.
 *                    Usado na primeira célula da tabela de jogadores.
 *
 * `badges`     Chips de insight pré-computados via getTopBadges().
 * `highlighted` Acento primary no nome (capitão, melhor opção).
 * `children`   Slot para ações extras (botões, ícones de status, etc.).
 */

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TrendingUp, TrendingDown } from "lucide-react";
import { ProGate } from "@/components/ProGate";
import { getPositionColor } from "@/hooks/use-custom-api";
import type { InsightKind } from "@/lib/explainPlayer";

// ── Badge chip colour map ─────────────────────────────────────────────────────
// Única fonte de verdade para os chips de insight — importada pelas páginas.

export const CHIP_CLASS: Record<InsightKind, string> = {
  positive: "bg-green-500/10 text-green-500 border-green-500/20",
  warning:  "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  info:     "bg-blue-400/10 text-blue-400 border-blue-400/20",
  neutral:  "bg-secondary text-muted-foreground border-border/50",
};

// ── PlayerBadge type ──────────────────────────────────────────────────────────

export interface PlayerBadge {
  label: string;
  kind: InsightKind;
  requiresPro?: boolean;
}

// ── PlayerBadges component ────────────────────────────────────────────────────

/** Renderiza chips de insight com ProGate automático quando requiresPro=true. */
export function PlayerBadges({ badges }: { badges: PlayerBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {badges.map((b) =>
        b.requiresPro ? (
          <ProGate key={b.label} variant="inline">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${CHIP_CLASS[b.kind]}`}>
              {b.label}
            </span>
          </ProGate>
        ) : (
          <span key={b.label} className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${CHIP_CLASS[b.kind]}`}>
            {b.label}
          </span>
        )
      )}
    </div>
  );
}

// ── PlayerInfo shape ──────────────────────────────────────────────────────────

export interface PlayerInfo {
  name: string;
  nickname?: string | null;
  position?: string | null;
  club?: {
    name?: string | null;
    abbreviation?: string | null;
    badgeUrl?: string | null;
  } | null;
  price?: number | null;
  priceVariation?: number | null;
  expectedPoints?: number | null;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface PlayerCardProps {
  player: PlayerInfo;
  variant?: "compact" | "full";
  badges?: PlayerBadge[];
  highlighted?: boolean;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PlayerCard({
  player,
  variant = "compact",
  badges = [],
  highlighted = false,
  onClick,
  className = "",
  children,
}: PlayerCardProps) {
  const displayName = player.nickname ?? player.name;
  const posColor = getPositionColor(player.position ?? "");

  // ── Compact: single flex row ─────────────────────────────────────────────
  if (variant === "compact") {
    return (
      <div
        className={`flex items-center justify-between gap-2 text-xs ${onClick ? "cursor-pointer" : ""} ${className}`}
        onClick={onClick}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Badge
            variant="outline"
            className={`text-[9px] shrink-0 px-1.5 py-0 font-bold ${posColor}`}
          >
            {player.position}
          </Badge>
          <span className={`truncate ${highlighted ? "font-bold text-primary" : "text-muted-foreground"}`}>
            {displayName}
          </span>
          {player.club?.abbreviation && (
            <span className="text-muted-foreground/50 shrink-0 text-[10px] hidden sm:inline">
              {player.club.abbreviation}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {children}
          {player.expectedPoints != null && (
            <span className="font-mono text-primary shrink-0 text-[11px]">
              {player.expectedPoints.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── Full: avatar + name + club + badges ──────────────────────────────────
  return (
    <div
      className={`flex items-center gap-3 ${onClick ? "cursor-pointer" : ""} ${className}`}
      onClick={onClick}
    >
      {/* Club avatar */}
      <Avatar className="w-9 h-9 border border-border shrink-0">
        <AvatarImage src={player.club?.badgeUrl ?? undefined} />
        <AvatarFallback className="bg-secondary text-xs">
          {player.club?.abbreviation ?? "??"}
        </AvatarFallback>
      </Avatar>

      {/* Info block */}
      <div className="min-w-0 flex-1">
        {/* Name row + action children */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <p
            className={`font-semibold truncate group-hover:text-primary transition-colors ${
              highlighted ? "text-primary" : "text-foreground"
            }`}
          >
            {displayName}
          </p>
          {children}
        </div>

        {/* Club name */}
        {player.club?.name && (
          <p className="text-xs text-muted-foreground">{player.club.name}</p>
        )}

        {/* Insight badges */}
        {badges.length > 0 && <PlayerBadges badges={badges} />}
      </div>

      {/* Price + variation (only when provided) */}
      {(player.price != null || player.priceVariation != null) && (
        <div className="text-right shrink-0">
          {player.price != null && (
            <div className="flex items-center justify-end gap-1">
              <span className="font-mono text-sm text-foreground">
                C$ {player.price.toFixed(2)}
              </span>
              {player.priceVariation != null && player.priceVariation !== 0 && (
                <span
                  className={`flex items-center gap-0.5 text-[10px] font-bold ${
                    player.priceVariation > 0 ? "text-green-500" : "text-red-500"
                  }`}
                >
                  {player.priceVariation > 0 ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {player.priceVariation > 0 ? "+" : ""}C$
                  {player.priceVariation.toFixed(2)}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
