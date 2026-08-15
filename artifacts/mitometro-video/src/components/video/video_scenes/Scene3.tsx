import { motion } from 'framer-motion';

/**
 * 4-3-3 lineup — Cartola-compliant: max 3 players per club.
 *   FLA (Flamengo):    Léo Ortiz (ZAG), De Arrascaeta (MEI), Pedro (ATA)
 *   CAM (Atlético-MG): Everson (GOL), Guilherme Arana (LAT), Hulk (ATA)
 *   PAL (Palmeiras):   Piquerez (LAT), Raphael Veiga (MEI), Flaco López (ATA)
 *   COR (Corinthians): Murillo (ZAG)
 *   SAO (São Paulo):   Lucas (MEI)
 */
const fieldPlayers: Array<{
  name: string;
  pos: string;
  pts: string;
  color: string;
  x: number; // % from left
  y: number; // % from top
  delay: number;
}> = [
  // ATA row
  { name: 'Hulk',          pos: 'ATA', pts: '9.2', color: '#10b981', x: 18, y: 8,  delay: 0.55 },
  { name: 'Pedro',         pos: 'ATA', pts: '8.7', color: '#10b981', x: 50, y: 5,  delay: 0.65 },
  { name: 'Flaco López',   pos: 'ATA', pts: '7.6', color: '#10b981', x: 82, y: 8,  delay: 0.75 },
  // MEI row
  { name: 'De Arrascaeta', pos: 'MEI', pts: '8.1', color: '#8b5cf6', x: 20, y: 34, delay: 0.85 },
  { name: 'R. Veiga',      pos: 'MEI', pts: '7.4', color: '#8b5cf6', x: 50, y: 31, delay: 0.92 },
  { name: 'Lucas',         pos: 'MEI', pts: '6.8', color: '#8b5cf6', x: 80, y: 34, delay: 0.99 },
  // DEF row (2 ZAG + 2 LAT)
  { name: 'G. Arana',      pos: 'LAT', pts: '5.8', color: '#3b82f6', x: 12, y: 58, delay: 1.06 },
  { name: 'Léo Ortiz',     pos: 'ZAG', pts: '6.3', color: '#3b82f6', x: 35, y: 55, delay: 1.1  },
  { name: 'Murillo',       pos: 'ZAG', pts: '6.0', color: '#3b82f6', x: 65, y: 55, delay: 1.14 },
  { name: 'Piquerez',      pos: 'LAT', pts: '6.1', color: '#3b82f6', x: 88, y: 58, delay: 1.18 },
  // GOL
  { name: 'Everson',       pos: 'GOL', pts: '5.5', color: '#f59e0b', x: 50, y: 82, delay: 1.24 },
];

function Jersey({ color, pos }: { color: string; pos: string }) {
  return (
    <div
      style={{
        width: 36,
        height: 40,
        borderRadius: '6px 6px 4px 4px',
        background: `linear-gradient(160deg, ${color} 0%, ${color}99 100%)`,
        boxShadow: `0 0 14px ${color}55`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `1.5px solid ${color}88`,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.5rem',
          color: '#080d1a',
          fontWeight: 700,
          letterSpacing: '0.04em',
        }}
      >
        {pos}
      </span>
    </div>
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
          background: 'radial-gradient(circle, rgba(16,185,129,0.1) 0%, transparent 65%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          display: 'flex',
          gap: 56,
          alignItems: 'center',
          position: 'relative',
          zIndex: 1,
          width: '100%',
          maxWidth: 960,
          padding: '0 40px',
        }}
      >
        {/* Left: text info */}
        <div style={{ flex: '0 0 220px', textAlign: 'left' }}>
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
              fontSize: '0.9rem',
              color: '#64748b',
              marginTop: 10,
              lineHeight: 1.5,
            }}
          >
            Sua escalação otimizada{' '}
            <span style={{ color: '#94a3b8' }}>em segundos</span>.
          </motion.p>

          {/* Stats */}
          <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Pts esperados', value: '82 pts', color: '#10b981' },
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
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: '#0f1629',
                  border: `1px solid ${color}22`,
                }}
              >
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: '#64748b' }}>
                  {label}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color, fontWeight: 600 }}>
                  {value}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right: field */}
        <div style={{ flex: 1, position: 'relative' }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.25, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'relative',
              height: 380,
              borderRadius: 16,
              border: '1.5px solid rgba(16,185,129,0.2)',
              background:
                'linear-gradient(180deg, rgba(16,185,129,0.05) 0%, rgba(16,185,129,0.02) 50%, rgba(16,185,129,0.05) 100%)',
              overflow: 'hidden',
            }}
          >
            {/* Pitch lines */}
            <div style={{ position: 'absolute', top: '50%', left: '8%', right: '8%', height: 1, background: 'rgba(16,185,129,0.12)' }} />
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: 80, height: 80, borderRadius: '50%', border: '1px solid rgba(16,185,129,0.1)', transform: 'translate(-50%, -50%)' }} />
            <div style={{ position: 'absolute', top: '4%', left: '30%', right: '30%', height: '12%', border: '1px solid rgba(16,185,129,0.1)', borderTop: 'none' }} />
            <div style={{ position: 'absolute', bottom: '4%', left: '30%', right: '30%', height: '12%', border: '1px solid rgba(16,185,129,0.1)', borderBottom: 'none' }} />

            {/* Player jerseys */}
            {fieldPlayers.map((p) => (
              <motion.div
                key={p.name}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: p.delay, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  position: 'absolute',
                  left: `${p.x}%`,
                  top: `${p.y}%`,
                  transform: 'translate(-50%, -50%)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Jersey color={p.color} pos={p.pos} />
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.55rem',
                    color: '#94a3b8',
                    textAlign: 'center',
                    maxWidth: 56,
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {p.name}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: p.color, fontWeight: 600 }}>
                  {p.pts}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
