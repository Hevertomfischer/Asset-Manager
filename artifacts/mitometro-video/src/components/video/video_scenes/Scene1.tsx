import { motion } from 'framer-motion';

const chars1 = 'CARTOLA FC'.split('');
const chars2 = 'É ESTRATÉGIA'.split('');

export default function Scene1() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ background: '#080d1a' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.08, filter: 'blur(12px)' }}
      transition={{ duration: 0.5 }}
    >
      {/* Grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(16,185,129,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.06) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          animation: 'gridPulse 4s ease-in-out infinite',
        }}
      />

      {/* Emerald glow center */}
      <div
        className="absolute"
        style={{
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 70%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Tag line */}
      <motion.div
        className="mb-6 overflow-hidden"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5, ease: 'circOut' }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.9rem',
            color: '#10b981',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
          }}
        >
          ● Ao vivo na Série A
        </span>
      </motion.div>

      {/* "CARTOLA FC" char-by-char */}
      <div className="overflow-hidden flex items-center">
        {chars1.map((ch, i) => (
          <motion.span
            key={i}
            initial={{ y: '110%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.25 + i * 0.04, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '5rem',
              lineHeight: 1,
              color: '#ffffff',
              letterSpacing: ch === ' ' ? '0.5rem' : '-0.02em',
              display: 'inline-block',
              whiteSpace: 'pre',
            }}
          >
            {ch}
          </motion.span>
        ))}
      </div>

      {/* "É ESTRATÉGIA" char-by-char in emerald */}
      <div className="overflow-hidden flex items-center mt-1">
        {chars2.map((ch, i) => (
          <motion.span
            key={i}
            initial={{ y: '110%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.55 + i * 0.04, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '5rem',
              lineHeight: 1,
              color: '#10b981',
              letterSpacing: ch === ' ' ? '0.5rem' : '-0.02em',
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
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.4, duration: 0.5, ease: 'circOut' }}
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '1.25rem',
          color: '#94a3b8',
          marginTop: '1.5rem',
          letterSpacing: '0.04em',
        }}
      >
        Mas poucos escapam do achismo.
      </motion.p>

      {/* Bottom accent line */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ delay: 1.7, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 3,
          background: 'linear-gradient(90deg, transparent, #10b981, transparent)',
          transformOrigin: 'center',
        }}
      />
    </motion.div>
  );
}
