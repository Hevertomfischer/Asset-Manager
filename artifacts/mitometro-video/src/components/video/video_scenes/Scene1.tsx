import { motion } from 'framer-motion';

const chars1 = 'CARTOLA FC'.split('');
const chars2 = 'É ESTRATÉGIA'.split('');

export default function Scene1({ aspectRatio = '9:16', muted = false }: { aspectRatio?: '16:9' | '9:16', muted?: boolean }) {
  const isLandscape = aspectRatio === '16:9';
  
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ background: '#080d1a' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.08, filter: 'blur(12px)' }}
      transition={{ duration: 0.5 }}
    >
      <audio src={`${import.meta.env.BASE_URL}audio/whoosh.wav`} autoPlay muted={muted} />
      <audio src={`${import.meta.env.BASE_URL}audio/tts_opening.mp3`} autoPlay muted={muted} />

      {/* Grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(16,185,129,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.06) 1px, transparent 1px)',
          backgroundSize: '100px 100px',
        }}
      />

      {/* Emerald glow center */}
      <div
        className="absolute"
        style={{
          width: isLandscape ? 1200 : 900,
          height: isLandscape ? 800 : 900,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 70%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Live badge */}
      <motion.div
        style={{ marginBottom: isLandscape ? 40 : 72, overflow: 'hidden' }}
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.4, ease: 'circOut' }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: isLandscape ? 28 : 32,
            color: '#10b981',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
          }}
        >
          ● Ao vivo — Série A 2026
        </span>
      </motion.div>

      {/* "CARTOLA FC" char-by-char */}
      <div className="overflow-hidden flex items-center">
        {chars1.map((ch, i) => (
          <motion.span
            key={i}
            initial={{ y: '110%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 + i * 0.03, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: isLandscape ? 140 : 116,
              lineHeight: 1,
              color: '#ffffff',
              letterSpacing: ch === ' ' ? 16 : '-0.02em',
              display: 'inline-block',
              whiteSpace: 'pre',
            }}
          >
            {ch}
          </motion.span>
        ))}
      </div>

      {/* "É ESTRATÉGIA" char-by-char in emerald */}
      <div className="overflow-hidden flex items-center" style={{ marginTop: 10 }}>
        {chars2.map((ch, i) => (
          <motion.span
            key={i}
            initial={{ y: '110%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.35 + i * 0.03, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: isLandscape ? 140 : 116,
              lineHeight: 1,
              color: '#10b981',
              letterSpacing: ch === ' ' ? 16 : '-0.02em',
              display: 'inline-block',
              whiteSpace: 'pre',
            }}
          >
            {ch}
          </motion.span>
        ))}
      </div>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0, duration: 0.5, ease: 'circOut' }}
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: isLandscape ? 40 : 44,
          color: '#94a3b8',
          marginTop: isLandscape ? 40 : 60,
          letterSpacing: '0.04em',
          textAlign: 'center',
          padding: '0 60px',
        }}
      >
        Escalar no feeling tem limite.
      </motion.p>

      {/* Bottom accent line */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 1.2, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 8,
          background: 'linear-gradient(90deg, transparent, #10b981, transparent)',
          transformOrigin: 'center',
        }}
      />
    </motion.div>
  );
}
