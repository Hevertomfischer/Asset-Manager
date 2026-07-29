/**
 * LineupShareCard — card off-screen para gerar PNG da escalação via html-to-image.
 *
 * IMPORTANTE: usa APENAS inline styles. Tailwind não é aplicado em elementos
 * fora da viewport durante a captura do html-to-image.
 */

import { forwardRef } from "react";
import type { LineupPlayer, LineupReservePlayer } from "@workspace/api-client-react";
import { CLUB_COLORS } from "@/lib/clubColors";

// ── Paleta e utilitários ─────────────────────────────────────────────────────

function getColors(abbr: string | null | undefined) {
  const key = abbr?.toUpperCase() ?? "";
  return CLUB_COLORS[key] ?? { primary: "#1e3a5f", secondary: "#4a90e2", text: "#FFFFFF" };
}

function firstWord(s: string | null | undefined, max = 10): string {
  if (!s) return "?";
  return (s.split(" ")[0] ?? s).slice(0, max);
}

// ── Jersey SVG inline ────────────────────────────────────────────────────────

function JerseyInline({
  abbr,
  size,
  position,
  isCaptain,
  isLuxury,
}: {
  abbr: string | null | undefined;
  size: number;
  position?: string | null;
  isCaptain?: boolean;
  isLuxury?: boolean;
}) {
  const { primary, secondary, text } = getColors(abbr);
  return (
    <div style={{ position: "relative", display: "inline-block", width: size, height: size }}>
      {isCaptain && (
        <div
          style={{
            position: "absolute",
            top: -8,
            right: -4,
            zIndex: 10,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#eab308",
            color: "#000",
            fontSize: 9,
            fontWeight: 900,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
            border: "1px solid #fde047",
          }}
        >
          C
        </div>
      )}
      {isLuxury && (
        <div
          style={{
            position: "absolute",
            top: -6,
            right: -4,
            zIndex: 10,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "#a855f7",
            color: "#fff",
            fontSize: 8,
            fontWeight: 900,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
            border: "1px solid #c084fc",
          }}
        >
          ★
        </div>
      )}
      <svg
        viewBox="0 0 80 72"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))" }}
      >
        <path
          d="M22 17 L5 36 L19 42 L19 67 L61 67 L61 42 L75 36 L58 17 Q49 10 40 10 Q31 10 22 17 Z"
          fill={primary}
        />
        <path d="M22 17 L5 36 L19 42 L25 27 Z" fill={secondary} />
        <path d="M58 17 L75 36 L61 42 L55 27 Z" fill={secondary} />
        <path d="M34 11 Q40 6 46 11 L44 19 Q40 15 36 19 Z" fill={secondary} />
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

// ── PlayerSlot: camisa + nome + preço ────────────────────────────────────────

function PlayerSlot({
  player,
  captainId,
  jerseySize = 46,
  nameWidth = 60,
}: {
  player: LineupPlayer;
  captainId?: number | null;
  jerseySize?: number;
  nameWidth?: number;
}) {
  const isCaptain = player.playerId === captainId;
  const name = firstWord(player.nickname ?? player.name, 10);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <JerseyInline
        abbr={player.clubAbbr}
        size={jerseySize}
        position={player.position}
        isCaptain={isCaptain}
      />
      <div
        style={{
          background: "rgba(0,0,0,0.70)",
          borderRadius: 5,
          padding: "2px 5px",
          textAlign: "center",
          width: nameWidth,
        }}
      >
        <div
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "#fff",
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            lineHeight: 1.2,
          }}
        >
          {name}
        </div>
        {player.price != null && (
          <div style={{ fontSize: 8, color: "#fde047", fontFamily: "monospace", fontWeight: 700, lineHeight: 1.1 }}>
            C${player.price.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
}

function ReserveSlot({ reserve }: { reserve: LineupReservePlayer }) {
  const name = firstWord(reserve.nickname ?? reserve.name, 9);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <JerseyInline
        abbr={reserve.clubAbbr}
        size={38}
        position={reserve.position}
        isLuxury={reserve.isLuxuryReserve ?? false}
      />
      <div
        style={{
          background: "rgba(0,0,0,0.60)",
          borderRadius: 4,
          padding: "1px 4px",
          textAlign: "center",
          width: 52,
        }}
      >
        <div
          style={{
            fontSize: 8,
            fontWeight: 600,
            color: "rgba(255,255,255,0.80)",
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            lineHeight: 1.2,
          }}
        >
          {name}
        </div>
        {reserve.price != null && (
          <div style={{ fontSize: 7, color: "rgba(253,224,71,0.80)", fontFamily: "monospace", lineHeight: 1.1 }}>
            C${reserve.price.toFixed(2)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Pitch background (SVG puro) ──────────────────────────────────────────────

function PitchSvg({ width, height }: { width: number; height: number }) {
  const lw = 1.5;
  const lc = "rgba(255,255,255,0.22)";
  const cx = width / 2;
  const pad = 12;
  const goalW = 70;
  const goalH = 30;
  const penW = 130;
  const penH = 68;
  const circleR = 40;
  return (
    <svg
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0 }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Green pitch gradient */}
      <defs>
        <linearGradient id="pitch-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0d4a26" />
          <stop offset="50%" stopColor="#0a3d1f" />
          <stop offset="100%" stopColor="#0d4a26" />
        </linearGradient>
        {/* Stripes */}
        <pattern id="stripes" x="0" y="0" width="1" height="40" patternUnits="userSpaceOnUse">
          <rect width={width} height="20" fill="rgba(0,0,0,0.06)" />
          <rect y="20" width={width} height="20" fill="transparent" />
        </pattern>
      </defs>
      <rect width={width} height={height} fill="url(#pitch-grad)" />
      <rect width={width} height={height} fill="url(#stripes)" />
      {/* Outer border */}
      <rect x={pad} y={pad} width={width - pad * 2} height={height - pad * 2} fill="none" stroke={lc} strokeWidth={lw} />
      {/* Half line */}
      <line x1={pad} y1={height / 2} x2={width - pad} y2={height / 2} stroke={lc} strokeWidth={lw} />
      {/* Center circle */}
      <circle cx={cx} cy={height / 2} r={circleR} fill="none" stroke={lc} strokeWidth={lw} />
      <circle cx={cx} cy={height / 2} r={3} fill={lc} />
      {/* Top penalty area */}
      <rect x={cx - penW / 2} y={pad} width={penW} height={penH} fill="none" stroke={lc} strokeWidth={lw} />
      {/* Top goal area */}
      <rect x={cx - goalW / 2} y={pad} width={goalW} height={goalH} fill="none" stroke={lc} strokeWidth={lw} />
      {/* Bottom penalty area */}
      <rect x={cx - penW / 2} y={height - pad - penH} width={penW} height={penH} fill="none" stroke={lc} strokeWidth={lw} />
      {/* Bottom goal area */}
      <rect x={cx - goalW / 2} y={height - pad - goalH} width={goalW} height={goalH} fill="none" stroke={lc} strokeWidth={lw} />
    </svg>
  );
}

// ── Row renderer ─────────────────────────────────────────────────────────────

function FieldRow({ players, captainId }: { players: LineupPlayer[]; captainId?: number | null }) {
  if (!players.length) return null;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-evenly",
        alignItems: "center",
        width: "100%",
      }}
    >
      {players.map((p) => (
        <PlayerSlot key={p.playerId} player={p} captainId={captainId} jerseySize={46} nameWidth={60} />
      ))}
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface LineupShareCardProps {
  players: LineupPlayer[];
  reserves?: LineupReservePlayer[];
  captainId?: number | null;
  coachId?: number | null;
  formation?: string | null;
  expectedPoints?: number | null;
  totalCost?: number | null;
  round?: number | null;
}

// ── Main component ────────────────────────────────────────────────────────────

export const LineupShareCard = forwardRef<HTMLDivElement, LineupShareCardProps>(
  function LineupShareCard(
    { players, reserves = [], captainId, coachId, formation, expectedPoints, totalCost, round },
    ref
  ) {
    const CARD_WIDTH = 400;
    const FIELD_HEIGHT = 480;

    // Organise players
    const fieldPlayers = players.filter((p) => p.position !== "TEC");
    const coach = players.find((p) => p.position === "TEC" || p.playerId === coachId);

    const by = (pos: string[]) => fieldPlayers.filter((p) => pos.includes(p.position ?? ""));
    const att = by(["ATA"]);
    const mid = by(["MEI"]);
    const rawDef = by(["ZAG", "LAT"]);
    const lats = rawDef.filter((p) => p.position === "LAT");
    const zags = rawDef.filter((p) => p.position === "ZAG");
    const def =
      lats.length >= 2
        ? [lats[0]!, ...zags, lats[1]!]
        : lats.length === 1
          ? [lats[0]!, ...zags]
          : zags;
    const gk = by(["GOL"]);

    const sortedReserves = [...reserves].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

    const subtitle = round ? `Escalação · Rodada ${round}` : "Escalação";

    return (
      <div
        ref={ref}
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          top: 0,
          width: CARD_WIDTH,
          backgroundColor: "#0f172a",
          color: "#f1f5f9",
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            background: "linear-gradient(135deg, #064e3b 0%, #065f46 100%)",
            padding: "12px 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                background: "#10b981",
                borderRadius: 7,
                width: 24,
                height: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ color: "#0f172a", fontWeight: 900, fontSize: 12 }}>M</span>
            </div>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>
              Mito<span style={{ color: "#10b981" }}>metro</span>
            </span>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 9,
                color: "#34d399",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {subtitle}
            </div>
            <div style={{ fontSize: 8, color: "#6ee7b7", marginTop: 1 }}>Cartola FC Intelligence</div>
          </div>
        </div>

        {/* ── Field ── */}
        <div style={{ position: "relative", width: CARD_WIDTH, height: FIELD_HEIGHT, overflow: "hidden" }}>
          <PitchSvg width={CARD_WIDTH} height={FIELD_HEIGHT} />

          {/* Player rows — absolute overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "20px 8px",
              zIndex: 10,
            }}
          >
            <FieldRow players={att} captainId={captainId} />
            <FieldRow players={mid} captainId={captainId} />
            <FieldRow players={def} captainId={captainId} />
            {/* GOL + TEC */}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", position: "relative", width: "100%" }}>
              {gk.map((p) => (
                <PlayerSlot key={p.playerId} player={p} captainId={captainId} jerseySize={46} nameWidth={60} />
              ))}
              {coach && (
                <div style={{ position: "absolute", right: 8, bottom: 0, opacity: 0.85, transform: "scale(0.88)" }}>
                  <PlayerSlot player={coach} captainId={captainId} jerseySize={46} nameWidth={60} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Stats bar ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-evenly",
            background: "#0d1f2d",
            padding: "10px 16px",
            gap: 8,
          }}
        >
          {[
            { label: "Pts esp.", value: expectedPoints != null ? expectedPoints.toFixed(1) : "—", color: "#10b981" },
            { label: "Custo", value: totalCost != null ? `C$ ${totalCost.toFixed(2)}` : "—", color: "#f1f5f9" },
            { label: "Formação", value: formation ?? "—", color: "#f1f5f9" },
          ].map((stat, i, arr) => (
            <div key={stat.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 8, color: "#94a3b8", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.05em" }}>{stat.label}</div>
                <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 700, color: stat.color, marginTop: 2 }}>{stat.value}</div>
              </div>
              {i < arr.length - 1 && <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.10)" }} />}
            </div>
          ))}
        </div>

        {/* ── Bench ── */}
        {sortedReserves.length > 0 && (
          <div style={{ padding: "10px 14px 14px", background: "#0a1524" }}>
            <div
              style={{
                fontSize: 8,
                color: "#64748b",
                textTransform: "uppercase",
                fontWeight: 700,
                letterSpacing: "0.08em",
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              Banco de Reservas
            </div>
            <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 8 }}>
              {sortedReserves.map((r) => (
                <ReserveSlot key={r.playerId} reserve={r} />
              ))}
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div
          style={{
            padding: "8px 18px",
            background: "#080e1a",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 10, color: "#34d399", fontWeight: 600 }}>mitometro.com.br</span>
          <span style={{ fontSize: 8, color: "#334155" }}>Cartola FC · Temporada 2025</span>
        </div>
      </div>
    );
  }
);
