/**
 * PlayerCard — componente compartilhado de exibição de jogador.
 *
 * variant="compact"  Linha única: badge posição + nome + clube + pts.
 *                    Usado em listas densas (reservas, fronteira).
 * variant="full"     Avatar do clube + nome + clube + badges de insight.
 *                    Usado na primeira célula da tabela de jogadores.
 * variant="pitch"    Card vertical completo para o campo (Pitch.tsx).
 * variant="swap"     Fragment — Avatar + info + métricas, dentro do button
 *                    de CandidateRow (SwapSimulator.tsx).
 * variant="compare"  Div centrada — avatar + nome + posição + preço.
 *                    Usada em PlayerHeader (comparar.tsx).
 * variant="lineup"   Fragment — header nome/pos + row preço/pts.
 *                    Usado em LineupPlayerCard (lineup.tsx).
 *
 * `badges`           Chips de insight pré-computados via getTopBadges().
 * `highlighted`      Acento primary no nome.
 * `loading`          Exibe skeleton animado no lugar do conteúdo.
 * `isCaptain`        Indicador de capitão (anel amarelo + "C" no pitch,
 *                    ícone Crown no lineup).
 * `isCoach`          Ícone Star no lineup.
 * `playProbability`  Probabilidade de jogo 0-1; AlertTriangle se < 0.5.
 * `children`         Slot para ações extras (botões, badges de contexto).
 */

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TrendingUp, TrendingDown, Crown, Star, AlertTriangle } from "lucide-react";
import { ProGate } from "@/components/ProGate";
import { usePopularityFeatures } from "@/hooks/usePopularityFeatures";
import { getPositionColor } from "@/lib/positionColors";
import type { InsightKind } from "@/lib/explainPlayer";
import { getBadgeUrl, getBadgeScale } from "@/lib/clubColors";

// ── Badge chip colour map ──────────────────────────────────────────────────────
// Única fonte de verdade para os chips de insight — importada pelas páginas.

export const CHIP_CLASS: Record<InsightKind, string> = {
  positive: "bg-positive/10 text-positive border-positive/20",
  attention: "bg-attention/10 text-attention border-attention/20",
  danger: "bg-danger/10 text-danger border-danger/20",
  differential: "bg-differential/10 text-differential border-differential/20",
  neutral: "bg-secondary text-muted-foreground border-border/50",
};

// ── PlayerBadge type ───────────────────────────────────────────────────────────

export interface PlayerBadge {
  label: string;
  kind: InsightKind;
  requiresPro?: boolean;
}

// ── PlayerBadges component ─────────────────────────────────────────────────────

/** Renderiza chips de insight com ProGate automático quando requiresPro=true. */
export function PlayerBadges({ badges }: { badges: PlayerBadge[] }) {
  const { enabled } = usePopularityFeatures();
  badges = badges.filter((badge) => enabled || (badge.kind !== "differential" && badge.label !== "Armadilha"));
  if (badges.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {badges.map((b) =>
        b.requiresPro ? (
          <ProGate key={b.label} variant="inline">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-xs font-semibold ${CHIP_CLASS[b.kind]}`}>
              {b.label}
            </span>
          </ProGate>
        ) : (
          <span key={b.label} className={`inline-flex items-center px-1.5 py-0.5 rounded-full border text-xs font-semibold ${CHIP_CLASS[b.kind]}`}>
            {b.label}
          </span>
        )
      )}
    </div>
  );
}

// ── PlayerInfo shape ───────────────────────────────────────────────────────────

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

// ── ClubBadge ─────────────────────────────────────────────────────────────────
// Avatar wrapper standalone com fallback para escudo de clube.
// Usado diretamente em tabelas (historico.tsx) onde PlayerCard completo
// não cabe pela estrutura de <tr>/<td>.

export function ClubBadge({
  url,
  abbr,
  className = "",
}: {
  url?: string | null;
  abbr?: string | null;
  className?: string;
}) {
  const scale = getBadgeScale(abbr);
  return (
    <Avatar className={`border border-border/30 shrink-0 [&_img]:object-contain bg-white/10 ${scale !== 1 ? "overflow-visible" : ""} ${className}`}>
      <AvatarImage
        src={getBadgeUrl(abbr, url) ?? undefined}
        style={scale !== 1 ? { transform: `scale(${scale})` } : undefined}
      />
      <AvatarFallback className="bg-secondary text-xs font-semibold">
        {abbr?.slice(0, 2) ?? "??"}
      </AvatarFallback>
    </Avatar>
  );
}

// ── Variant type ───────────────────────────────────────────────────────────────

export type PlayerCardVariant = "compact" | "full" | "pitch" | "swap" | "compare" | "lineup";

// ── PlayerSkeleton ─────────────────────────────────────────────────────────────
// Skeletons pulsantes correspondentes a cada variant — exportado para uso
// direto quando o componente pai já conhece o estado de loading.

export function PlayerSkeleton({ variant = "compact" }: { variant?: PlayerCardVariant }) {
  if (variant === "pitch") {
    return (
      <div className="flex flex-col items-center w-20 motion-safe:animate-pulse">
        <div className="w-12 h-12 rounded-full bg-white/10" />
        <div className="mt-1 w-full h-8 rounded-md bg-white/10" />
      </div>
    );
  }
  if (variant === "swap") {
    return (
      <>
        <div className="w-8 h-8 rounded-full bg-secondary shrink-0 motion-safe:animate-pulse" />
        <div className="flex-1 space-y-1.5 motion-safe:animate-pulse">
          <div className="h-3 bg-secondary rounded w-24" />
          <div className="h-2.5 bg-secondary/60 rounded w-20" />
        </div>
        <div className="space-y-1.5 shrink-0 motion-safe:animate-pulse">
          <div className="h-3 bg-secondary rounded w-12" />
          <div className="h-2.5 bg-secondary/60 rounded w-10" />
        </div>
      </>
    );
  }
  if (variant === "full") {
    return (
      <div className="flex items-center gap-3 motion-safe:animate-pulse">
        <div className="w-9 h-9 rounded-full bg-secondary shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 bg-secondary rounded w-28" />
          <div className="h-2.5 bg-secondary/60 rounded w-20" />
        </div>
        <div className="space-y-1 shrink-0">
          <div className="h-3 bg-secondary rounded w-16" />
        </div>
      </div>
    );
  }
  if (variant === "compare") {
    return (
      <div className="text-center motion-safe:animate-pulse">
        <div className="w-8 h-8 rounded-full bg-secondary mx-auto mb-2" />
        <div className="h-3 bg-secondary rounded w-20 mx-auto" />
        <div className="h-2.5 bg-secondary/60 rounded w-14 mx-auto mt-1" />
        <div className="flex justify-center gap-2 mt-1.5">
          <div className="h-4 bg-secondary rounded w-8" />
          <div className="h-4 bg-secondary/60 rounded w-12" />
        </div>
      </div>
    );
  }
  if (variant === "lineup") {
    return (
      <>
        <div className="flex items-start justify-between gap-2 mb-2 motion-safe:animate-pulse">
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-secondary rounded w-24" />
            <div className="h-2.5 bg-secondary/60 rounded w-16" />
          </div>
          <div className="h-4 bg-secondary rounded w-8 shrink-0" />
        </div>
        <div className="flex justify-between motion-safe:animate-pulse">
          <div className="h-3 bg-secondary/60 rounded w-14" />
          <div className="h-3 bg-secondary rounded w-10" />
        </div>
      </>
    );
  }
  // compact (default)
  return (
    <div className="flex items-center justify-between gap-2 motion-safe:animate-pulse">
      <div className="flex items-center gap-1.5">
        <div className="w-7 h-4 bg-secondary rounded-full" />
        <div className="h-3 bg-secondary rounded w-20" />
      </div>
      <div className="h-3 bg-secondary rounded w-8" />
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface PlayerCardProps {
  player: PlayerInfo;
  variant?: PlayerCardVariant;
  badges?: PlayerBadge[];
  highlighted?: boolean;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
  /** Exibe skeleton animado em vez do conteúdo. */
  loading?: boolean;
  /** Anel amarelo + "C" no pitch; ícone Crown no lineup. */
  isCaptain?: boolean;
  /** Ícone Star no lineup (ignorado se isCaptain=true). */
  isCoach?: boolean;
  /** Probabilidade de jogo 0-1. Exibe AlertTriangle no swap se < 0.5. */
  playProbability?: number | null;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function PlayerCard({
  player,
  variant = "compact",
  badges = [],
  highlighted = false,
  onClick,
  className = "",
  children,
  loading = false,
  isCaptain = false,
  isCoach = false,
  playProbability,
}: PlayerCardProps): React.ReactElement {
  // No pitch, usa primeiro nome para caber no card estreito (w-20)
  const displayName =
    variant === "pitch"
      ? (player.nickname ?? player.name?.split(" ")[0] ?? player.name)
      : (player.nickname ?? player.name);

  const posColor = getPositionColor(player.position ?? "");

  if (loading) return <PlayerSkeleton variant={variant} /> as React.ReactElement;

  // ── pitch: card vertical no campo ─────────────────────────────────────────
  if (variant === "pitch") {
    return (
      <div
        className={`flex flex-col items-center group relative z-10 w-20 ${onClick ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : ""} ${className}`}
        onClick={onClick}
      >
        <div
         className={`relative rounded-full p-0.5 border-2 bg-black/40 backdrop-blur-md motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-110 ${
            isCaptain
              ? "border-attention shadow-[0_0_15px_hsl(var(--attention)/0.6)]"
              : "border-white/20"
          }`}
        >
          {isCaptain && (
            <div className="absolute -top-2 -right-2 bg-attention text-attention-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold z-20">
              C
            </div>
          )}
          <Avatar className={`w-10 h-10 border border-white/10 bg-white/10 [&_img]:object-contain ${getBadgeScale(player.club?.abbreviation) !== 1 ? "overflow-visible" : ""}`}>
            <AvatarImage src={getBadgeUrl(player.club?.abbreviation, player.club?.badgeUrl)} style={getBadgeScale(player.club?.abbreviation) !== 1 ? { transform: `scale(${getBadgeScale(player.club?.abbreviation)})` } : undefined} />
            <AvatarFallback className="bg-white/10 text-xs">
              {player.club?.abbreviation ?? "??"}
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="mt-1 flex flex-col items-center bg-black/60 backdrop-blur-md rounded-md px-1.5 py-0.5 border border-white/10 w-full">
           <span className="text-xs font-bold text-white truncate w-full text-center tracking-tight">
            {displayName}
          </span>
          <div className="flex gap-1 items-center mt-0.5">
             <span className={`text-xs font-mono px-1 rounded-sm ${posColor}`}>
              {player.position}
            </span>
            {player.expectedPoints != null && (
               <span className="text-xs text-primary font-bold tabular-nums">
                {player.expectedPoints.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── swap: Fragment — Avatar + info + métricas (inner do button CandidateRow) ──
  // Os 3 filhos do Fragment tornam-se irmãos diretos no flex do button pai,
  // recebendo o gap-3 corretamente.
  if (variant === "swap") {
    return (
      <>
        <Avatar className={`w-8 h-8 border border-border shrink-0 bg-white/10 [&_img]:object-contain ${getBadgeScale(player.club?.abbreviation) !== 1 ? "overflow-visible" : ""}`}>
          <AvatarImage src={getBadgeUrl(player.club?.abbreviation, player.club?.badgeUrl)} style={getBadgeScale(player.club?.abbreviation) !== 1 ? { transform: `scale(${getBadgeScale(player.club?.abbreviation)})` } : undefined} />
          <AvatarFallback className="bg-secondary text-xs">
            {player.club?.abbreviation?.slice(0, 2) ?? "??"}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary motion-safe:transition-colors">
              {displayName}
            </p>
            {playProbability != null && playProbability < 0.5 && (
              <AlertTriangle className="w-3 h-3 text-attention shrink-0" />
            )}
          </div>
           <p className="text-xs text-muted-foreground">
            {player.club?.name ?? ""}
            {playProbability != null
              ? ` · ${(playProbability * 100).toFixed(0)}% jogo`
              : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-primary font-mono tabular-nums">
            {(player.expectedPoints ?? 0).toFixed(1)} pts
          </p>
           <p className="text-xs text-muted-foreground font-mono tabular-nums">
            C$ {(player.price ?? 0).toFixed(2)}
          </p>
        </div>
      </>
    ) as React.ReactElement;
  }

  // ── compare: div centrada (PlayerHeader no desktop, comparar.tsx) ──────────
  if (variant === "compare") {
    return (
        <div className={`text-center ${onClick ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : ""} ${className}`} onClick={onClick}>
        <Avatar className={`w-8 h-8 mx-auto mb-2 border border-border/30 [&_img]:object-contain bg-white/10 ${getBadgeScale(player.club?.abbreviation) !== 1 ? "overflow-visible" : ""}`}>
          <AvatarImage src={getBadgeUrl(player.club?.abbreviation, player.club?.badgeUrl)} style={getBadgeScale(player.club?.abbreviation) !== 1 ? { transform: `scale(${getBadgeScale(player.club?.abbreviation)})` } : undefined} />
          <AvatarFallback className="bg-secondary text-xs font-semibold">
            {player.club?.abbreviation?.slice(0, 2) ?? "??"}
          </AvatarFallback>
        </Avatar>
        <p className="font-semibold text-sm text-foreground leading-tight">
          {displayName}
        </p>
         <p className="text-xs text-muted-foreground mt-0.5">
          {player.club?.abbreviation ?? player.club?.name ?? "—"}
        </p>
        <div className="flex items-center justify-center gap-2 mt-1.5">
           <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${posColor}`}>
            {player.position}
          </span>
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            C$ {(player.price ?? 0).toFixed(1)}
          </span>
        </div>
        {children}
      </div>
    );
  }

  // ── lineup: Fragment — header nome/pos + row preço/pts (LineupPlayerCard) ──
  // Renderiza 2 divs que se tornam filhos diretos do container com padding
  // do LineupPlayerCard. Children do lineup não são suportados aqui.
  if (variant === "lineup") {
    return (
      <>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            {isCaptain && <Crown className="w-4 h-4 text-attention shrink-0" />}
            {isCoach && !isCaptain && <Star className="w-4 h-4 text-primary shrink-0" />}
            <div className="min-w-0">
              <p className="font-bold text-sm text-foreground truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground">
                {player.club?.abbreviation ?? player.club?.name ?? ""}
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={`font-mono text-xs shrink-0 ${posColor}`}
          >
            {player.position}
          </Badge>
        </div>
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-muted-foreground">
            C$ {player.price?.toFixed(2) ?? "-"}
          </span>
          <span className="font-bold text-primary font-mono tabular-nums">
            {player.expectedPoints?.toFixed(1) ?? "-"} pts
          </span>
        </div>
      </>
    ) as React.ReactElement;
  }

  // ── compact: linha única ───────────────────────────────────────────────────
  if (variant === "compact") {
    return (
      <div
        className={`flex items-center justify-between gap-2 text-xs ${
          onClick ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : ""
        } ${className}`}
        onClick={onClick}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Badge
            variant="outline"
               className={`text-xs shrink-0 px-1.5 py-0 font-bold ${posColor}`}
          >
            {player.position}
          </Badge>
          <span
            className={`truncate ${
              highlighted ? "font-bold text-primary" : "text-muted-foreground"
            }`}
          >
            {displayName}
          </span>
          {player.club?.abbreviation && (
             <span className="text-muted-foreground/50 shrink-0 text-xs hidden sm:inline">
              {player.club.abbreviation}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {children}
          {player.expectedPoints != null && (
             <span className="font-mono text-primary shrink-0 text-xs tabular-nums">
              {player.expectedPoints.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ── full: avatar + nome + clube + badges + preço ───────────────────────────
  return (
    <div
      className={`flex items-center gap-3 ${onClick ? "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : ""} ${className}`}
      onClick={onClick}
    >
      <Avatar className={`w-9 h-9 border border-border shrink-0 bg-white/10 [&_img]:object-contain ${getBadgeScale(player.club?.abbreviation) !== 1 ? "overflow-visible" : ""}`}>
        <AvatarImage src={getBadgeUrl(player.club?.abbreviation, player.club?.badgeUrl)} style={getBadgeScale(player.club?.abbreviation) !== 1 ? { transform: `scale(${getBadgeScale(player.club?.abbreviation)})` } : undefined} />
        <AvatarFallback className="bg-secondary text-xs">
          {player.club?.abbreviation ?? "??"}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p
            className={`font-semibold truncate group-hover:text-primary motion-safe:transition-colors ${
              highlighted ? "text-primary" : "text-foreground"
            }`}
          >
            {displayName}
          </p>
          {children}
        </div>
        {player.club?.name && (
          <p className="text-xs text-muted-foreground">{player.club.name}</p>
        )}
        {badges.length > 0 && <PlayerBadges badges={badges} />}
      </div>

      {(player.price != null || player.priceVariation != null) && (
        <div className="text-right shrink-0">
          {player.price != null && (
            <div className="flex items-center justify-end gap-1">
              <span className="font-mono text-sm text-foreground tabular-nums">
                C$ {player.price.toFixed(2)}
              </span>
              {player.priceVariation != null && player.priceVariation !== 0 && (
                <span
                  className={`flex items-center gap-0.5 text-xs font-bold tabular-nums ${
                    player.priceVariation > 0 ? "text-positive" : "text-danger"
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
