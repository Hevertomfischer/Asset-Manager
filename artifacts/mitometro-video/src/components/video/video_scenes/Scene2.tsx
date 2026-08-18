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
      exit={{ opacity: 0, x: -200, filter: 'blur(10px)' }}
      transition={{ duration: 0.5 }}
    >
      {/* Subtle grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(16,185,129,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.04) 1px, transparent 1px)',
          backgroundSize: '100px 100px',
        }}
      />

      {/* Horizontal divider line */}
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'absolute',
          left: 86,
          right: 86,
          top: '50%',
          height: 2,
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
          padding: '0 70px',
          position: 'relative',
          zIndex: 2,
          gap: 0,
        }}
      >
        {/* Top — Palpite */}
        <motion.div
          initial={{ opacity: 0, y: -60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingBottom: 70,
            gap: 40,
          }}
        >
          {/* Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 25,
              padding: '20px 50px',
              borderRadius: 250,
              background: 'rgba(239,68,68,0.12)',
              border: '3px solid rgba(239,68,68,0.35)',
            }}
          >
            <span style={{ fontSize: 44 }}>❌</span>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 46,
                color: '#ef4444',
              }}
            >
              Palpite
            </span>
          </div>

          {/* Items row */}
          <div style={{ display: 'flex', gap: 25, flexWrap: 'wrap', justifyContent: 'center' }}>
            {leftItems.map((item, i) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, y: -32 }}
                animate={{ opacity: 0.75, y: 0 }}
                transition={{ delay: 0.4 + i * 0.1, duration: 0.4, ease: 'circOut' }}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 38,
                  color: '#94a3b8',
                  padding: '20px 40px',
                  borderRadius: 20,
                  background: 'rgba(239,68,68,0.06)',
                  border: '2px solid rgba(239,68,68,0.18)',
                }}
              >
                {item}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Bottom — Escalação com explicação */}
        <motion.div
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 70,
            gap: 40,
          }}
        >
          {/* Badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 25,
              padding: '20px 50px',
              borderRadius: 250,
              background: 'rgba(16,185,129,0.12)',
              border: '3px solid rgba(16,185,129,0.4)',
            }}
          >
            <span style={{ fontSize: 44 }}>✅</span>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 42,
                color: '#10b981',
              }}
            >
              Escalação com explicação
            </span>
          </div>

          {/* Items row */}
          <div style={{ display: 'flex', gap: 25, flexWrap: 'wrap', justifyContent: 'center' }}>
            {rightItems.map((item, i) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, y: 32 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.1, duration: 0.4, ease: 'circOut' }}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 38,
                  color: '#e2e8f0',
                  padding: '20px 40px',
                  borderRadius: 20,
                  background: 'rgba(16,185,129,0.08)',
                  border: '2px solid rgba(16,185,129,0.22)',
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
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0, duration: 0.5, ease: 'circOut' }}
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 60,
          color: '#ffffff',
          marginTop: 90,
          textAlign: 'center',
          position: 'relative',
          zIndex: 2,
          letterSpacing: '-0.01em',
          padding: '0 60px',
        }}
      >
        Não é achismo.{' '}
        <span style={{ color: '#10b981' }}>É método.</span>
      </motion.p>
    </motion.div>
  );
}
