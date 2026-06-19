import { motion } from 'framer-motion';

const tagChars = 'MITOMETRO'.split('');

export default function Scene5() {
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
          width: 700,
          height: 700,
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
          backgroundSize: '60px 60px',
          pointerEvents: 'none',
        }}
      />

      {/* Outer orbit ring */}
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 0.25, scale: 1 }}
        transition={{ delay: 0.2, duration: 1, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'absolute',
          width: 420,
          height: 420,
          borderRadius: '50%',
          border: '1.5px solid #10b981',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: 0.15, scale: 1 }}
        transition={{ delay: 0.35, duration: 1, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'absolute',
          width: 560,
          height: 560,
          borderRadius: '50%',
          border: '1px solid #8b5cf6',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Tagline above */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.5, ease: 'circOut' }}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8rem',
          color: '#10b981',
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          marginBottom: 18,
          position: 'relative',
          zIndex: 2,
        }}
      >
        Inteligência para o Cartola FC
      </motion.div>

      {/* MITOMETRO char-by-char */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
          zIndex: 2,
          overflow: 'hidden',
        }}
      >
        {tagChars.map((ch, i) => {
          const isEmerald = i >= 4; // "METRO" in emerald
          return (
            <motion.span
              key={i}
              initial={{ y: '120%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{
                delay: 0.4 + i * 0.055,
                duration: 0.55,
                ease: [0.16, 1, 0.3, 1],
              }}
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '6rem',
                lineHeight: 1,
                color: isEmerald ? '#10b981' : '#ffffff',
                letterSpacing: '-0.03em',
                display: 'inline-block',
                textShadow: isEmerald ? '0 0 40px rgba(16,185,129,0.6)' : 'none',
              }}
            >
              {ch}
            </motion.span>
          );
        })}
      </div>

      {/* Tagline below */}
      <motion.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.15, duration: 0.5, ease: 'circOut' }}
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '1.35rem',
          color: '#94a3b8',
          marginTop: 18,
          position: 'relative',
          zIndex: 2,
          letterSpacing: '0.04em',
        }}
      >
        Escale com{' '}
        <span style={{ color: '#ffffff', fontWeight: 600 }}>inteligência</span>.
      </motion.p>

      {/* CTA pill */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 1.45, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={{
          marginTop: 32,
          position: 'relative',
          zIndex: 2,
          padding: '12px 36px',
          borderRadius: 100,
          background: 'linear-gradient(135deg, #10b981, #059669)',
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: '1rem',
          color: '#080d1a',
          letterSpacing: '0.04em',
          boxShadow: '0 0 30px rgba(16,185,129,0.4)',
        }}
      >
        mitometro.com.br
      </motion.div>

      {/* Bottom gradient bar */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 1.65, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 4,
          background: 'linear-gradient(90deg, transparent, #10b981, #8b5cf6, transparent)',
          transformOrigin: 'center',
        }}
      />
    </motion.div>
  );
}
