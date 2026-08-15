import { motion } from 'framer-motion';

/**
 * 4-3-3 lineup — Cartola-compliant: max 3 players per club.
 *   FLA (Flamengo):    Léo Ortiz (ZAG), De Arrascaeta (MEI), Pedro (ATA)
 *   CAM (Atlético-MG): Everson (GOL), Guilherme Arana (LAT), Hulk (ATA)
 *   PAL (Palmeiras):   Piquerez (LAT), Raphael Veiga (MEI), Flaco López (ATA)
 *   COR (Corinthians): Murillo (ZAG)
 *   SAO (São Paulo):   Lucas (MEI)
 */

const BASE = import.meta.env.BASE_URL;

const BADGE: Record<string, string> = {
  FLA: `${BASE}badges/FLA.png`,
  CAM: `${BASE}badges/CAM.png`,
  PAL: `${BASE}badges/PAL.png`,
  COR: `${BASE}badges/COR.png`,
  SAO: `${BASE}badges/SAO.png`,
};

const fieldPlayers: Array<{
  name: string;
  pos: string;
  pts: string;
  club: string;
  x: number; // % from left
  y: number; // % from top
  delay: number;
}> = [
  // ATA row
  { name: 'Hulk',          pos: 'ATA', pts: '9.2', club: 'CAM', x: 18, y: 8,  delay: 0.55 },
  { name: 'Pedro',         pos: 'ATA', pts: '8.7', club: 'FLA', x: 50, y: 5,  delay: 0.65 },
  { name: 'Flaco López',   pos: 'ATA', pts: '7.6', club: 'PAL', x: 82, y: 8,  delay: 0.75 },
  // MEI row
  { name: 'Arrascaeta',    pos: 'MEI', pts: '8.1', club: 'FLA', x: 20, y: 34, delay: 0.85 },
  { name: 'R. Veiga',      pos: 'MEI', pts: '7.4', club: 'PAL', x: 50, y: 31, delay: 0.92 },
  { name: 'Lucas',         pos: 'MEI', pts: '6.8', club: 'SAO', x: 80, y: 34, delay: 0.99 },
  // DEF row
  { name: 'G. Arana',      pos: 'LAT', pts: '5.8', club: 'CAM', x: 12, y: 58, delay: 1.06 },
  { name: 'Léo Ortiz',     pos: 'ZAG', pts: '6.3', club: 'FLA', x: 35, y: 55, delay: 1.1  },
  { name: 'Murillo',       pos: 'ZAG', pts: '6.0', club: 'COR', x: 65, y: 55, delay: 1.14 },
  { name: 'Piquerez',      pos: 'LAT', pts: '6.1', club: 'PAL', x: 88, y: 58, delay: 1.18 },
  // GOL
  { name: 'Everson',       pos: 'GOL', pts: '5.5', club: 'CAM', x: 50, y: 82, delay: 1.24 },
];

const POS_COLOR: Record<string, string> = {
  ATA: '#10b981',
  MEI: '#8b5cf6',
  ZAG: '#3b82f6',
  LAT: '#3b82f6',
  GOL: '#f59e0b',
};

function BadgePin({ club, pos, name, pts, delay }: { club: string; pos: string; name: string; pts: string; delay: number }) {
  const color = POS_COLOR[pos] ?? '#10b981';
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0, y: -8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
      }}
    >
      {/* Badge circle */}
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: '#0d1f1a',
          border: `2px solid ${color}`,
          boxShadow: `0 0 10px ${color}55, 0 2px 8px rgba(0,0,0,0.6)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <img
          src={BADGE[club]}
          alt={club}
          style={{ width: 26, height: 26, objectFit: 'contain' }}
        />
      </div>
      {/* Name */}
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.5rem',
          color: '#e2e8f0',
          textAlign: 'center',
          maxWidth: 52,
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          textShadow: '0 1px 4px rgba(0,0,0,0.9)',
        }}
      >
        {name}
      </div>
      {/* Points */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.55rem',
          color,
          fontWeight: 700,
          textShadow: `0 0 6px ${color}88`,
        }}
      >
        {pts}
      </div>
    </motion.div>
  );
}

export default function Scene3() {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: '#080d1a' }}
      initial={{ opacity: 0, x: 80 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Background glow */}
      <div
        style={{
          position: 'absolute',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.08) 0%, transparent 65%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          display: 'flex',
          gap: 48,
          alignItems: 'center',
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 960,
          padding: '0 40px',
        }}
      >
        {/* Left: text info */}
        <div style={{ flex: '0 0 210px', textAlign: 'left' }}>
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.45, ease: 'circOut' }}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: '#10b981',
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            Escalação gerada
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.18, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '3.5rem',
              lineHeight: 1,
              color: '#ffffff',
              letterSpacing: '-0.03em',
            }}
          >
            4-3-3
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.4, ease: 'circOut' }}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.85rem',
              color: '#64748b',
              marginTop: 10,
              lineHeight: 1.5,
            }}
          >
            Sua escalação otimizada{' '}
            <span style={{ color: '#94a3b8' }}>em segundos</span>.
          </motion.p>

          {/* Stats */}
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { label: 'Pts esperados', value: '82 pts',    color: '#10b981' },
              { label: 'Custo total',   value: 'C$ 127,5', color: '#8b5cf6' },
              { label: 'Clubes',        value: '5 clubes', color: '#f59e0b' },
            ].map(({ label, value, color }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.12, duration: 0.4, ease: 'circOut' }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '7px 11px',
                  borderRadius: 8,
                  background: '#0f1629',
                  border: `1px solid ${color}22`,
                }}
              >
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: '#64748b' }}>
                  {label}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', color, fontWeight: 600 }}>
                  {value}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right: football field */}
        <div style={{ flex: 1, position: 'relative' }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.25, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'relative',
              height: 390,
              borderRadius: 14,
              overflow: 'hidden',
              boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
              border: '1.5px solid rgba(16,185,129,0.25)',
            }}
          >
            {/* Green pitch base */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(180deg, #1a4a2e 0%, #1e5534 18%, #1a4a2e 36%, #1e5534 54%, #1a4a2e 72%, #1e5534 90%, #1a4a2e 100%)',
              }}
            />

            {/* Pitch lines SVG */}
            <svg
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              viewBox="0 0 400 390"
              preserveAspectRatio="none"
            >
              {/* Border */}
              <rect x="16" y="12" width="368" height="366" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
              {/* Halfway line */}
              <line x1="16" y1="195" x2="384" y2="195" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" />
              {/* Centre circle */}
              <circle cx="200" cy="195" r="44" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" />
              {/* Centre spot */}
              <circle cx="200" cy="195" r="3" fill="rgba(255,255,255,0.5)" />

              {/* Top penalty area (big) */}
              <rect x="90" y="12" width="220" height="68" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
              {/* Top goal area (small) */}
              <rect x="148" y="12" width="104" height="28" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
              {/* Top penalty spot */}
              <circle cx="200" cy="60" r="2.5" fill="rgba(255,255,255,0.4)" />
              {/* Top penalty arc */}
              <path d="M 156 80 A 44 44 0 0 1 244 80" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />

              {/* Bottom penalty area (big) */}
              <rect x="90" y="310" width="220" height="68" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
              {/* Bottom goal area (small) */}
              <rect x="148" y="350" width="104" height="28" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
              {/* Bottom penalty spot */}
              <circle cx="200" cy="330" r="2.5" fill="rgba(255,255,255,0.4)" />
              {/* Bottom penalty arc */}
              <path d="M 156 310 A 44 44 0 0 0 244 310" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
            </svg>

            {/* Player badges */}
            {fieldPlayers.map((p) => (
              <div
                key={p.name}
                style={{
                  position: 'absolute',
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <BadgePin
                  club={p.club}
                  pos={p.pos}
                  name={p.name}
                  pts={p.pts}
                  delay={p.delay}
                />
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
