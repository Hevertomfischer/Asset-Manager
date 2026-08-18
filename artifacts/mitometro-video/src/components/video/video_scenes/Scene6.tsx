import { motion } from 'framer-motion';

const chars = 'MITO'.split('');
const charsGreen = 'METRO'.split('');

export default function Scene6() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ background: '#080d1a' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.92, filter: 'blur(16px)' }}
      transition={{ duration: 0.6 }}
    >
      {/* Radial glow */}
      <div
        style={{
          position: 'absolute',
          width: 1300,
          height: 1300,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(16,185,129,0.22) 0%, rgba(139,92,246,0.08) 40%, transparent 70%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />

      {/* Grid bg */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(16,185,129,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.05) 1px, transparent 1px)',
          backgroundSize: '100px 100px',
          pointerEvents: 'none',
        }}
      />

      {/* Orbit rings */}
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 0.2, scale: 1 }}
        transition={{ delay: 0.2, duration: 1, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'absolute',
          width: 650,
          height: 650,
          borderRadius: '50%',
          border: '3px solid #10b981',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: 0.12, scale: 1 }}
        transition={{ delay: 0.35, duration: 1, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'absolute',
          width: 880,
          height: 880,
          borderRadius: '50%',
          border: '2px solid #8b5cf6',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Tagline above */}
      <motion.div
        initial={{ opacity: 0, y: -32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.5, ease: 'circOut' }}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 30,
          color: '#10b981',
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          marginBottom: 50,
          position: 'relative',
          zIndex: 2,
          textAlign: 'center',
        }}
      >
        Sua escalação. Com razões.
      </motion.div>

      {/* MITOMETRO char-by-char — two rows for portrait */}
      <div style={{ position: 'relative', zIndex: 2, overflow: 'hidden', textAlign: 'center' }}>
        {/* MITO */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {chars.map((ch, i) => (
            <motion.span
              key={`mito-${i}`}
              initial={{ y: '120%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 + i * 0.06, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 190,
                lineHeight: 0.95,
                color: '#ffffff',
                letterSpacing: '-0.03em',
                display: 'inline-block',
              }}
            >
              {ch}
            </motion.span>
          ))}
        </div>
        {/* METRO */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {charsGreen.map((ch, i) => (
            <motion.span
              key={`metro-${i}`}
              initial={{ y: '120%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.64 + i * 0.06, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 190,
                lineHeight: 0.95,
                color: '#10b981',
                letterSpacing: '-0.03em',
                display: 'inline-block',
                textShadow: '0 0 100px rgba(16,185,129,0.6)',
              }}
            >
              {ch}
            </motion.span>
          ))}
        </div>
      </div>

      {/* Tagline below */}
      <motion.p
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.5, ease: 'circOut' }}
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 52,
          color: '#94a3b8',
          marginTop: 50,
          position: 'relative',
          zIndex: 2,
          letterSpacing: '0.04em',
          textAlign: 'center',
        }}
      >
        Escale com{' '}
        <span style={{ color: '#ffffff', fontWeight: 600 }}>explicação</span>.
      </motion.p>

      {/* CTA pill */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 32 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 1.5, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{
          marginTop: 80,
          position: 'relative',
          zIndex: 2,
          padding: '35px 110px',
          borderRadius: 250,
          background: 'linear-gradient(135deg, #10b981, #059669)',
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 43,
          color: '#080d1a',
          letterSpacing: '0.04em',
          boxShadow: '0 0 90px rgba(16,185,129,0.45)',
        }}
      >
        mitometro.com.br
      </motion.div>

      {/* Bottom gradient bar */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 1.75, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 10,
          background: 'linear-gradient(90deg, transparent, #10b981, #8b5cf6, transparent)',
          transformOrigin: 'center',
        }}
      />
    </motion.div>
  );
}
