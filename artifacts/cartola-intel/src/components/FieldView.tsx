/**
 * FieldView — vista de campo para a escalação.
 *
 * Renderiza um campo de futebol com os jogadores posicionados
 * em linhas (ATA → MEI → DEF → GOL) usando os escudos/camisas
 * reais dos clubes (PNG em /jerseys/{ABBR}.png) com fallback SVG.
 */

import type { LineupPlayer, LineupReservePlayer } from "@workspace/api-client-react";
import { getClubColors } from "@/lib/clubColors";

// ── Clubes com imagem PNG disponível ────────────────────────────────────────

const JERSEY_PNG_CLUBS = new Set([
  "ATH", "ATL", "BAH", "BOT", "BRA", "CAP", "CFC", "CHA",
  "COR", "CRU", "FLA", "FLU", "GRE", "INT", "MIR",
  "PAL", "REM", "SAN", "SAO", "VAS", "VIT",
]);

function getJerseyImageUrl(abbr: string | null | undefined): string | null {
  if (!abbr) return null;
  const key = abbr.toUpperCase();
  if (!JERSEY_PNG_CLUBS.has(key)) return null;
  return `${import.meta.env.BASE_URL}jerseys/${key}.png`;
}

// ── Jersey — imagem real ou SVG fallback ──────────────────────────────────────

function Jersey({
  abbr,
  isCaptain,
  size = "md",
  position,
}: {
  abbr: string | null | undefined;
  isCaptain: boolean;
  size?: "sm" | "md";
  position?: string | null;
}) {
  const url = getJerseyImageUrl(abbr);
  const sizeClass = size === "sm"
    ? "w-10 h-10 sm:w-12 sm:h-12"
    : "w-12 h-12 sm:w-16 sm:h-16";

  return (
    <div className="relative inline-block">
      {isCaptain && (
        <div className="absolute -top-2 -right-1 z-10 w-5 h-5 rounded-full bg-yellow-400 text-black text-[10px] font-black flex items-center justify-center shadow-md ring-1 ring-yellow-300">
          C
        </div>
      )}
      {url ? (
        <img
          src={url}
          alt={abbr ?? ""}
          className={`${sizeClass} object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)] group-hover:scale-110 transition-transform duration-200`}
          draggable={false}
        />
      ) : (
        <JerseySvgFallback abbr={abbr} size={size} position={position} />
      )}
    </div>
  );
}

// ── SVG Fallback (clubes sem PNG) ────────────────────────────────────────────

function JerseySvgFallback({
  abbr,
  size = "md",
  position,
}: {
  abbr: string | null | undefined;
  size?: "sm" | "md";
  position?: string | null;
}) {
  const { primary, secondary, text } = getClubColors(abbr);
  const sizeClass = size === "sm" ? "w-10 h-10 sm:w-12 sm:h-12" : "w-12 h-12 sm:w-16 sm:h-16";
  return (
    <svg
      viewBox="0 0 80 72"
      className={`${sizeClass} drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)] group-hover:scale-110 transition-transform duration-200`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M22 17 L5 36 L19 42 L19 67 L61 67 L61 42 L75 36 L58 17 Q49 10 40 10 Q31 10 22 17 Z" fill={primary} />
      <path d="M22 17 L5 36 L19 42 L25 27 Z" fill={secondary} />
      <path d="M58 17 L75 36 L61 42 L55 27 Z" fill={secondary} />
      <path d="M34 11 Q40 6 46 11 L44 19 Q40 15 36 19 Z" fill={secondary} />
      {position && (
        <text x="40" y="50" textAnchor="middle" fill={text} fontSize="13" fontWeight="bold" fontFamily="monospace" opacity="0.55">
          {position}
        </text>
      )}
    </svg>
  );
}

// ── JerseyCard ────────────────────────────────────────────────────────────────

function JerseyCard({
  player,
  captainId,
  onClick,
}: {
  player: LineupPlayer;
  captainId?: number | null;
  onClick?: (player: LineupPlayer) => void;
}) {
  const isCaptain = player.playerId === captainId;
  const raw = player.nickname ?? player.name ?? "";
  const displayName = raw.split(" ")[0]?.slice(0, 9) ?? raw;

  const inner = (
    <>
      <Jersey
        abbr={player.clubAbbr}
        isCaptain={isCaptain}
        position={player.position}
      />
      <div className="bg-black/65 backdrop-blur-sm rounded-md px-1.5 py-0.5 text-center w-[64px] sm:w-[72px]">
        <p className="text-[10px] sm:text-[11px] font-bold text-white truncate leading-tight">
          {displayName}
        </p>
        {player.price != null && (
          <p className="text-[9px] sm:text-[10px] text-yellow-300 font-mono font-bold leading-none">
            C$ {player.price.toFixed(2)}
          </p>
        )}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={() => onClick(player)}
        className="flex flex-col items-center gap-0.5 group cursor-pointer active:scale-95 transition-transform duration-100 focus:outline-none"
      >
        {inner}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-0.5 group">
      {inner}
    </div>
  );
}

// ── ReserveJerseyCard ──────────────────────────────────────────────────────────

function ReserveJerseyCard({ reserve, onClick }: { reserve: LineupReservePlayer; onClick?: (r: LineupReservePlayer) => void }) {
  const displayName = (reserve.nickname ?? reserve.name ?? "").split(" ")[0]?.slice(0, 9) ?? "";
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick: () => onClick(reserve) } : {})}
      className={`flex flex-col items-center gap-0.5 group opacity-80 hover:opacity-100 transition-opacity${onClick ? " cursor-pointer active:scale-95 transition-transform duration-100 focus:outline-none" : ""}`}
    >
      <div className="relative inline-block">
        {reserve.isLuxuryReserve && (
          <div className="absolute -top-1.5 -right-1 z-10 w-4 h-4 rounded-full bg-purple-400 text-white text-[8px] font-black flex items-center justify-center shadow ring-1 ring-purple-300">
            ★
          </div>
        )}
        <Jersey abbr={reserve.clubAbbr} isCaptain={false} size="sm" />
      </div>
      <div className="bg-black/60 rounded px-1 py-0.5 text-center w-[52px] sm:w-[60px]">
        <p className="text-[9px] sm:text-[10px] font-semibold text-white/80 truncate leading-tight">{displayName}</p>
        {reserve.price != null && (
          <p className="text-[8px] sm:text-[9px] text-yellow-300/80 font-mono leading-none">C${reserve.price.toFixed(2)}</p>
        )}
      </div>
    </Wrapper>
  );
}

// ── Pitch Lines ───────────────────────────────────────────────────────────────

function PitchBackground() {
  return (
    <>
      <div className="absolute inset-0 pitch-pattern opacity-80" />
      <div className="absolute inset-3 border-2 border-white/25 rounded-sm pointer-events-none" />
      <div className="absolute top-1/2 left-3 right-3 border-t-2 border-white/25 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 border-2 border-white/25 rounded-full pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-white/40 rounded-full pointer-events-none" />
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-40 h-20 border-2 border-white/25 border-t-0 pointer-events-none" />
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-40 h-20 border-2 border-white/25 border-b-0 pointer-events-none" />
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-9 border-2 border-white/25 border-t-0 pointer-events-none" />
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-20 h-9 border-2 border-white/25 border-b-0 pointer-events-none" />
    </>
  );
}

// ── FieldView ─────────────────────────────────────────────────────────────────

interface FieldViewProps {
  players: LineupPlayer[];
  reserves?: LineupReservePlayer[];
  captainId?: number | null;
  coachId?: number | null;
  onPlayerClick?: (player: LineupPlayer) => void;
  onReserveClick?: (reserve: LineupReservePlayer) => void;
}

export function FieldView({ players, reserves = [], captainId, coachId, onPlayerClick, onReserveClick }: FieldViewProps) {
  const fieldPlayers = players.filter((p) => p.position !== "TEC");
  const coach = players.find((p) => p.position === "TEC" || p.playerId === coachId);

  const byPosition = (positions: string[]) =>
    fieldPlayers.filter((p) => positions.includes(p.position ?? ""));

  const gk  = byPosition(["GOL"]);
  const mid = byPosition(["MEI"]);
  const att = byPosition(["ATA"]);

  // LATs nas pontas, ZAGs no centro
  const rawDef = byPosition(["ZAG", "LAT"]);
  const lats = rawDef.filter((p) => p.position === "LAT");
  const zags = rawDef.filter((p) => p.position === "ZAG");
  const def = lats.length >= 2
    ? [lats[0]!, ...zags, lats[1]!]
    : lats.length === 1
      ? [lats[0]!, ...zags]
      : zags;

  const sortedReserves = [...reserves].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  return (
    <div className="w-full space-y-3">
      {/* Field */}
      <div
        className="relative w-full max-w-2xl mx-auto rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-[#0A1A14]"
        style={{ aspectRatio: "10/13" }}
      >
        <PitchBackground />

        <div className="absolute inset-0 flex flex-col justify-between py-5 px-2 z-10">
          {/* ATT */}
          <div className="flex justify-evenly w-full items-center">
            {att.map((p) => (
              <JerseyCard key={p.playerId} player={p} captainId={captainId} onClick={onPlayerClick} />
            ))}
          </div>

          {/* MID */}
          <div className="flex justify-evenly w-full items-center">
            {mid.map((p) => (
              <JerseyCard key={p.playerId} player={p} captainId={captainId} onClick={onPlayerClick} />
            ))}
          </div>

          {/* DEF */}
          <div className="flex justify-evenly w-full items-center">
            {def.map((p) => (
              <JerseyCard key={p.playerId} player={p} captainId={captainId} onClick={onPlayerClick} />
            ))}
          </div>

          {/* GOL + TEC */}
          <div className="flex justify-center w-full relative items-center">
            {gk.map((p) => (
              <JerseyCard key={p.playerId} player={p} captainId={captainId} onClick={onPlayerClick} />
            ))}
            {coach && (
              <div className="absolute right-2 bottom-0 scale-90 opacity-80 hover:opacity-100 transition-opacity">
                <JerseyCard player={coach} captainId={captainId} onClick={onPlayerClick} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bench */}
      {sortedReserves.length > 0 && (
        <div className="bg-card/60 border border-border/40 rounded-xl p-3 max-w-2xl mx-auto">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 text-center">
            Banco de Reservas
          </p>
          <div className="flex justify-center flex-wrap gap-3">
            {sortedReserves.map((r) => (
              <ReserveJerseyCard key={r.playerId} reserve={r} onClick={onReserveClick} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
