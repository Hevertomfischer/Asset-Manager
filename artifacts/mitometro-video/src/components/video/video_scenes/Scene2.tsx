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
          backgroundSize: '60px 60px',
        }}
      />

      {/* Center divider line */}
      <motion.div
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: 1, opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'absolute',
          top: '10%',
          bottom: '10%',
          left: '50%',
          width: 1,
          background: 'linear-gradient(to bottom, transparent, #334155, transparent)',
          transformOrigin: 'center',
          zIndex: 1,
        }}
      />

      <div
        style={{
          display: 'flex',
          gap: 0,
          alignItems: 'stretch',
          width: '100%',
          maxWidth: 900,
          position: 'relative',
          zIndex: 2,
          padding: '0 48px',
        }}
      >
        {/* Left — Palpite */}
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            paddingRight: 48,
            gap: 20,
          }}
        >
          {/* Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 18px',
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
                fontSize: '1.1rem',
                color: '#ef4444',
              }}
            >
              Palpite
            </span>
          </div>

          {/* Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
            {leftItems.map((item, i) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 0.7, x: 0 }}
                transition={{ delay: 0.4 + i * 0.12, duration: 0.4, ease: 'circOut' }}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '1rem',
                  color: '#94a3b8',
                  padding: '8px 16px',
                  borderRadius: 8,
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.15)',
                }}
              >
                {item}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Right — Escalação com explicação */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            paddingLeft: 48,
            gap: 20,
          }}
        >
          {/* Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 18px',
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

          {/* Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
            {rightItems.map((item, i) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.12, duration: 0.4, ease: 'circOut' }}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '1rem',
                  color: '#e2e8f0',
                  padding: '8px 16px',
                  borderRadius: 8,
                  background: 'rgba(16,185,129,0.08)',
                  border: '1px solid rgba(16,185,129,0.2)',
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
          fontSize: '1.6rem',
          color: '#ffffff',
          marginTop: 44,
          textAlign: 'center',
          position: 'relative',
          zIndex: 2,
          letterSpacing: '-0.01em',
        }}
      >
        Não é achismo.{' '}
        <span style={{ color: '#10b981' }}>É método.</span>
      </motion.p>
    </motion.div>
  );
}
