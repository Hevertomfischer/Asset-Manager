import { motion } from 'framer-motion';

const leftItems = ['Feeling', 'Influenciador', 'Chute'];
const rightItems = ['Dados históricos', 'Confrontos', 'Razões claras'];

export default function Scene2() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ background: '#080d1a' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -80, filter: 'blur(10px)' }}
      transition={{ duration: 0.5 }}
    >
      {/* Subtle grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(16,185,129,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.04) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Horizontal divider line */}
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'absolute',
          left: '8%',
          right: '8%',
          top: '50%',
          height: 1,
          background: 'linear-gradient(to right, transparent, #334155, transparent)',
          transformOrigin: 'center',
          zIndex: 1,
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          padding: '0 28px',
          position: 'relative',
          zIndex: 2,
          gap: 0,
        }}
      >
        {/* Top — Palpite */}
        <motion.div
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingBottom: 28,
            gap: 16,
          }}
        >
          {/* Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 20px',
              borderRadius: 100,
              background: 'rgba(239,68,68,0.12)',
              border: '1.5px solid rgba(239,68,68,0.35)',
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>❌</span>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '1.15rem',
                color: '#ef4444',
              }}
            >
              Palpite
            </span>
          </div>

          {/* Items row */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            {leftItems.map((item, i) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 0.75, y: 0 }}
                transition={{ delay: 0.4 + i * 0.1, duration: 0.4, ease: 'circOut' }}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.95rem',
                  color: '#94a3b8',
                  padding: '8px 16px',
                  borderRadius: 8,
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.18)',
                }}
              >
                {item}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Bottom — Escalação com explicação */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 28,
            gap: 16,
          }}
        >
          {/* Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 20px',
              borderRadius: 100,
              background: 'rgba(16,185,129,0.12)',
              border: '1.5px solid rgba(16,185,129,0.4)',
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>✅</span>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '1.05rem',
                color: '#10b981',
              }}
            >
              Escalação com explicação
            </span>
          </div>

          {/* Items row */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            {rightItems.map((item, i) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.1, duration: 0.4, ease: 'circOut' }}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.95rem',
                  color: '#e2e8f0',
                  padding: '8px 16px',
                  borderRadius: 8,
                  background: 'rgba(16,185,129,0.08)',
                  border: '1px solid rgba(16,185,129,0.22)',
                }}
              >
                {item}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Bottom tagline */}
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0, duration: 0.5, ease: 'circOut' }}
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 'clamp(1.3rem, 5.5vw, 1.65rem)',
          color: '#ffffff',
          marginTop: 36,
          textAlign: 'center',
          position: 'relative',
          zIndex: 2,
          letterSpacing: '-0.01em',
          padding: '0 24px',
        }}
      >
        Não é achismo.{' '}
        <span style={{ color: '#10b981' }}>É método.</span>
      </motion.p>
    </motion.div>
  );
}
