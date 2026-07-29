/**
 * FieldView — vista de campo para a escalação.
 *
 * Renderiza um campo de futebol com os jogadores posicionados
 * em linhas (ATA → MEI → DEF → GOL) usando camisas estilizadas
 * com as cores reais do clube.
 */

import type { LineupPlayer, LineupReservePlayer } from "@workspace/api-client-react";
import { getClubColors } from "@/lib/clubColors";

// ── Jersey SVG ────────────────────────────────────────────────────────────────

function Jersey({
  abbr,
  isCaptain,
  position,
}: {
  abbr: string | null | undefined;
  isCaptain: boolean;
  position?: string | null;
}) {
  const { primary, secondary, text } = getClubColors(abbr);
  return (
    <div className="relative inline-block">
      {isCaptain && (
        <div className="absolute -top-2 -right-1 z-10 w-5 h-5 rounded-full bg-yellow-400 text-black text-[10px] font-black flex items-center justify-center shadow-md ring-1 ring-yellow-300">
          C
        </div>
      )}
      <svg
        viewBox="0 0 80 72"
        className="w-11 h-11 sm:w-14 sm:h-14 drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)] group-hover:scale-110 transition-transform duration-200"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Body */}
        <path
          d="M22 17 L5 36 L19 42 L19 67 L61 67 L61 42 L75 36 L58 17 Q49 10 40 10 Q31 10 22 17 Z"
          fill={primary}
        />
        {/* Left sleeve */}
        <path d="M22 17 L5 36 L19 42 L25 27 Z" fill={secondary} />
        {/* Right sleeve */}
        <path d="M58 17 L75 36 L61 42 L55 27 Z" fill={secondary} />
        {/* Collar */}
        <path
          d="M34 11 Q40 6 46 11 L44 19 Q40 15 36 19 Z"
          fill={secondary}
        />
        {/* Position label on shirt */}
        {position && (
          <text
            x="40"
            y="50"
            textAnchor="middle"
            fill={text}
            fontSize="13"
            fontWeight="bold"
            fontFamily="monospace"
            opacity="0.55"
          >
            {position}
          </text>
        )}
      </svg>
    </div>
  );
}

// ── JerseyCard ────────────────────────────────────────────────────────────────

function JerseyCard({
  player,
  captainId,
}: {
  player: LineupPlayer;
  captainId?: number | null;
}) {
  const isCaptain = player.playerId === captainId;
  const raw = player.nickname ?? player.name ?? "";
  // Show nickname up to first space, or full nickname if single word, capped at 9 chars
  const displayName = raw.split(" ")[0]?.slice(0, 9) ?? raw;

  return (
    <div className="flex flex-col items-center gap-0.5 group">
      <Jersey
        abbr={player.clubAbbr}
        isCaptain={isCaptain}
        position={player.position}
      />
      <div className="bg-black/65 backdrop-blur-sm rounded-md px-1.5 py-0.5 text-center w-[60px] sm:w-[70px]">
        <p className="text-[10px] sm:text-[11px] font-bold text-white truncate leading-tight">
          {displayName}
        </p>
        {player.expectedPoints != null && (
          <p className="text-[9px] sm:text-[10px] text-emerald-400 font-mono font-bold leading-none">
            {player.expectedPoints.toFixed(1)} pts
          </p>
        )}
      </div>
    </div>
  );
}

// ── ReserveJerseyCard ──────────────────────────────────────────────────────────

function ReserveJerseyCard({ reserve }: { reserve: LineupReservePlayer }) {
  const { primary, secondary } = getClubColors(reserve.clubAbbr);
  const displayName = (reserve.nickname ?? reserve.name ?? "").split(" ")[0]?.slice(0, 9) ?? "";
  return (
    <div className="flex flex-col items-center gap-0.5 group opacity-80 hover:opacity-100 transition-opacity">
      <div className="relative inline-block">
        {reserve.isLuxuryReserve && (
          <div className="absolute -top-1.5 -right-1 z-10 w-4 h-4 rounded-full bg-purple-400 text-white text-[8px] font-black flex items-center justify-center shadow ring-1 ring-purple-300">
            ★
          </div>
        )}
        <svg viewBox="0 0 80 72" className="w-9 h-9 sm:w-11 sm:h-11 drop-shadow-md" xmlns="http://www.w3.org/2000/svg">
          <path d="M22 17 L5 36 L19 42 L19 67 L61 67 L61 42 L75 36 L58 17 Q49 10 40 10 Q31 10 22 17 Z" fill={primary} />
          <path d="M22 17 L5 36 L19 42 L25 27 Z" fill={secondary} />
          <path d="M58 17 L75 36 L61 42 L55 27 Z" fill={secondary} />
          <path d="M34 11 Q40 6 46 11 L44 19 Q40 15 36 19 Z" fill={secondary} />
        </svg>
      </div>
      <div className="bg-black/60 rounded px-1 py-0.5 text-center w-[50px] sm:w-[58px]">
        <p className="text-[9px] sm:text-[10px] font-semibold text-white/80 truncate leading-tight">{displayName}</p>
        {reserve.expectedPoints != null && (
          <p className="text-[8px] sm:text-[9px] text-emerald-400/80 font-mono leading-none">{reserve.expectedPoints.toFixed(1)}</p>
        )}
      </div>
    </div>
  );
}

// ── Pitch Lines ───────────────────────────────────────────────────────────────

function PitchBackground() {
  return (
    <>
      {/* Grass stripes */}
      <div className="absolute inset-0 pitch-pattern opacity-80" />
      {/* Outer border */}
      <div className="absolute inset-3 border-2 border-white/25 rounded-sm pointer-events-none" />
      {/* Centre line */}
      <div className="absolute top-1/2 left-3 right-3 border-t-2 border-white/25 pointer-events-none" />
      {/* Centre circle */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 border-2 border-white/25 rounded-full pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-white/40 rounded-full pointer-events-none" />
      {/* Top penalty box */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-40 h-20 border-2 border-white/25 border-t-0 pointer-events-none" />
      {/* Bottom penalty box */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-40 h-20 border-2 border-white/25 border-b-0 pointer-events-none" />
      {/* Top goal area */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-9 border-2 border-white/25 border-t-0 pointer-events-none" />
      {/* Bottom goal area */}
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
}

export function FieldView({ players, reserves = [], captainId, coachId }: FieldViewProps) {
  const fieldPlayers = players.filter((p) => p.position !== "TEC");
  const coach = players.find((p) => p.position === "TEC" || p.playerId === coachId);

  const byPosition = (positions: string[]) =>
    fieldPlayers.filter((p) => positions.includes(p.position ?? ""));

  const gk  = byPosition(["GOL"]);
  const def = byPosition(["ZAG", "LAT"]);
  const mid = byPosition(["MEI"]);
  const att = byPosition(["ATA"]);

  const sortedReserves = [...reserves].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  return (
    <div className="w-full space-y-3">
      {/* Field */}
      <div className="relative w-full max-w-2xl mx-auto rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-[#0A1A14]" style={{ aspectRatio: "10/13" }}>
        <PitchBackground />

        {/* Players layer — attack → mid → def → gk */}
        <div className="absolute inset-0 flex flex-col justify-between py-5 px-2 z-10">
          {/* ATT */}
          <div className="flex justify-evenly w-full items-center">
            {att.map((p) => (
              <JerseyCard key={p.playerId} player={p} captainId={captainId} />
            ))}
          </div>

          {/* MID */}
          <div className="flex justify-evenly w-full items-center">
            {mid.map((p) => (
              <JerseyCard key={p.playerId} player={p} captainId={captainId} />
            ))}
          </div>

          {/* DEF */}
          <div className="flex justify-evenly w-full items-center">
            {def.map((p) => (
              <JerseyCard key={p.playerId} player={p} captainId={captainId} />
            ))}
          </div>

          {/* GOL + TEC */}
          <div className="flex justify-center w-full relative items-center">
            {gk.map((p) => (
              <JerseyCard key={p.playerId} player={p} captainId={captainId} />
            ))}
            {coach && (
              <div className="absolute right-2 bottom-0 scale-90 opacity-80 hover:opacity-100 transition-opacity">
                <JerseyCard player={coach} captainId={captainId} />
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
              <ReserveJerseyCard key={r.playerId} reserve={r} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
