import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

/**
 * 4-3-3 lineup — Cartola-compliant: max 3 players per club.
 */
const BASE = import.meta.env.BASE_URL;

const BADGE: Record<string, string> = {
  FLA: `${BASE}badges/FLA.png`,
  CAM: `${BASE}badges/CAM.png`,
  PAL: `${BASE}badges/PAL.png`,
  COR: `${BASE}badges/COR.png`,
  SAO: `${BASE}badges/SAO.png`,
  FLU: `${BASE}badges/FLU.png`,
};

const fieldPlayers: Array<{
  name: string;
  pos: string;
  club: string;
  x: number;
  y: number;
  delay: number;
}> = [
  // ATA row
  { name: 'Hulk',       pos: 'ATA', club: 'FLU', x: 18, y: 8,  delay: 0.5  },
  { name: 'Pedro',      pos: 'ATA', club: 'FLA', x: 50, y: 5,  delay: 0.6  },
  { name: 'Flaco',      pos: 'ATA', club: 'PAL', x: 82, y: 8,  delay: 0.7  },
  // MEI row
  { name: 'Arrascaeta', pos: 'MEI', club: 'FLA', x: 20, y: 34, delay: 0.78 },
  { name: 'R. Veiga',   pos: 'MEI', club: 'PAL', x: 50, y: 31, delay: 0.85 },
  { name: 'Lucas',      pos: 'MEI', club: 'SAO', x: 80, y: 34, delay: 0.92 },
  // DEF row
  { name: 'G. Arana',   pos: 'LAT', club: 'CAM', x: 12, y: 58, delay: 0.99 },
  { name: 'Léo Ortiz',  pos: 'ZAG', club: 'FLA', x: 35, y: 55, delay: 1.04 },
  { name: 'Murillo',    pos: 'ZAG', club: 'COR', x: 65, y: 55, delay: 1.08 },
  { name: 'Piquerez',   pos: 'LAT', club: 'PAL', x: 88, y: 58, delay: 1.12 },
  // GOL
  { name: 'Everson',    pos: 'GOL', club: 'CAM', x: 50, y: 82, delay: 1.18 },
];

const POS_COLOR: Record<string, string> = {
  ATA: '#10b981',
  MEI: '#8b5cf6',
  ZAG: '#3b82f6',
  LAT: '#3b82f6',
  GOL: '#f59e0b',
};

function BadgePin({ club, pos, name, delay }: { club: string; pos: string; name: string; delay: number }) {
  const color = POS_COLOR[pos] ?? '#10b981';
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: '#0d1f1a',
          border: `4px solid ${color}`,
          boxShadow: `0 0 20px ${color}55`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <img src={BADGE[club]} alt={club} style={{ width: 56, height: 56, objectFit: 'contain' }} />
      </div>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 24,
          color: '#e2e8f0',
          textAlign: 'center',
          maxWidth: 130,
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          textShadow: '0 2px 8px rgba(0,0,0,0.9)',
        }}
      >
        {name}
      </div>
    </motion.div>
  );
}

export default function Scene3({ aspectRatio = '9:16', muted = false }: { aspectRatio?: '16:9' | '9:16', muted?: boolean }) {
  const isLandscape = aspectRatio === '16:9';
  const hitAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (muted) return;
    const t = setTimeout(() => {
      hitAudioRef.current?.play().catch(()=>{});
    }, 1500); // After Everson animates
    return () => clearTimeout(t);
  }, [muted]);

  return (
    <motion.div
      className="absolute inset-0 flex"
      style={{ background: '#080d1a', flexDirection: isLandscape ? 'row' : 'column' }}
      initial={{ opacity: 0, x: 200 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
    >
      <audio ref={hitAudioRef} src={`${import.meta.env.BASE_URL}audio/hit.wav`} preload="auto" />
      <audio src={`${import.meta.env.BASE_URL}audio/whoosh.wav`} autoPlay muted={muted} />

      {/* Header & Stats (Left in 16:9, Top/Bottom in 9:16) */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        padding: isLandscape ? '100px 80px' : '70px 60px 30px',
        flexShrink: 0,
        width: isLandscape ? '45%' : '100%',
        justifyContent: 'center'
      }}>
        <motion.div
          initial={{ opacity: 0, y: -24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.45, ease: 'circOut' }}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 28,
            color: '#10b981',
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            marginBottom: 16,
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
            fontSize: 120,
            lineHeight: 1,
            color: '#ffffff',
            letterSpacing: '-0.03em',
            marginBottom: isLandscape ? 60 : 0
          }}
        >
          4-3-3
        </motion.div>

        {isLandscape && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {[
              { label: 'Pts esperados', value: '82 pts',    color: '#10b981' },
              { label: 'Custo total',   value: 'C$ 127,5', color: '#8b5cf6' },
              { label: 'Clubes',        value: '5 clubes', color: '#f59e0b' },
            ].map(({ label, value, color }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.65 + i * 0.1, duration: 0.4, ease: 'circOut' }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 20,
                  padding: '25px 30px',
                  borderRadius: 25,
                  background: '#0f1629',
                  border: `2px solid ${color}22`,
                }}
              >
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 36, color, fontWeight: 700, minWidth: 160 }}>
                  {value}
                </span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 28, color: '#64748b' }}>
                  {label}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Football pitch */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.25, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        style={{
          flex: 1,
          maxWidth: isLandscape ? 600 : 'none',
          margin: isLandscape ? '60px auto 60px 0' : '0 40px',
          borderRadius: 35,
          overflow: 'hidden',
          position: 'relative',
          boxShadow: '0 20px 100px rgba(0,0,0,0.5)',
          border: '3px solid rgba(16,185,129,0.25)',
          minHeight: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, #1a4a2e 0%, #1e5534 18%, #1a4a2e 36%, #1e5534 54%, #1a4a2e 72%, #1e5534 90%, #1a4a2e 100%)',
          }}
        />
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          viewBox="0 0 300 460"
          preserveAspectRatio="none"
        >
          <rect x="12" y="10" width="276" height="440" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
          <line x1="12" y1="230" x2="288" y2="230" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" />
          <circle cx="150" cy="230" r="36" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" />
          <circle cx="150" cy="230" r="2.5" fill="rgba(255,255,255,0.5)" />
          <rect x="70" y="10" width="160" height="58" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
          <rect x="110" y="10" width="80" height="24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
          <circle cx="150" cy="52" r="2" fill="rgba(255,255,255,0.4)" />
          <path d="M 116 68 A 36 36 0 0 1 184 68" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
          <rect x="70" y="392" width="160" height="58" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
          <rect x="110" y="426" width="80" height="24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
          <circle cx="150" cy="408" r="2" fill="rgba(255,255,255,0.4)" />
          <path d="M 116 392 A 36 36 0 0 0 184 392" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
        </svg>

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
            <BadgePin club={p.club} pos={p.pos} name={p.name} delay={p.delay} />
          </div>
        ))}
      </motion.div>

      {/* Stats row — bottom (only in 9:16) */}
      {!isLandscape && (
        <div
          style={{
            display: 'flex',
            gap: 20,
            padding: '30px 40px 60px',
            flexShrink: 0,
          }}
        >
          {[
            { label: 'Pts esperados', value: '82 pts',    color: '#10b981' },
            { label: 'Custo total',   value: 'C$ 127,5', color: '#8b5cf6' },
            { label: 'Clubes',        value: '5 clubes', color: '#f59e0b' },
          ].map(({ label, value, color }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.65 + i * 0.1, duration: 0.4, ease: 'circOut' }}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                padding: '25px 20px',
                borderRadius: 25,
                background: '#0f1629',
                border: `2px solid ${color}22`,
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 36, color, fontWeight: 700 }}>
                {value}
              </span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 25, color: '#64748b', textAlign: 'center', lineHeight: 1.2 }}>
                {label}
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
