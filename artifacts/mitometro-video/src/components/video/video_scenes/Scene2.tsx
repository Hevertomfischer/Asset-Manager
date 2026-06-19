import { motion } from 'framer-motion';

const players = [
  { name: 'Atacante', pts: '?', color: '#ef4444', delay: 0.1 },
  { name: 'Meio-campo', pts: '?', color: '#f59e0b', delay: 0.2 },
  { name: 'Zagueiro', pts: '?', color: '#8b5cf6', delay: 0.3 },
  { name: 'Goleiro', pts: '?', color: '#3b82f6', delay: 0.4 },
  { name: 'Lateral', pts: '?', color: '#ec4899', delay: 0.5 },
  { name: 'Técnico', pts: '?', color: '#10b981', delay: 0.6 },
];

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
      {/* floating cards background */}
      {players.map((p, i) => {
        const angle = (i / players.length) * 360;
        const rad = (angle * Math.PI) / 180;
        const r = 320;
        const x = Math.cos(rad) * r;
        const y = Math.sin(rad) * r;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.6, x: 0, y: 0 }}
            animate={{ opacity: 0.55, scale: 1, x, y }}
            transition={{ delay: p.delay, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              marginTop: -52,
              marginLeft: -44,
              width: 88,
              height: 104,
              borderRadius: 12,
              border: `1.5px solid ${p.color}44`,
              background: `linear-gradient(135deg, ${p.color}14 0%, #0f1629 100%)`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '1.6rem', color: p.color }}>
              {p.pts}
            </span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.6rem', color: '#64748b', textAlign: 'center', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {p.name}
            </span>
          </motion.div>
        );
      })}

      {/* Center question */}
      <div style={{ position: 'relative', zIndex: 10, textAlign: 'center' }}>
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          style={{
            width: 90,
            height: 90,
            borderRadius: '50%',
            background: 'rgba(239,68,68,0.12)',
            border: '2px solid rgba(239,68,68,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
          }}
        >
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', color: '#ef4444', fontWeight: 700 }}>?</span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5, ease: 'circOut' }}
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2.6rem',
            fontWeight: 700,
            color: '#ffffff',
            lineHeight: 1.1,
          }}
        >
          Palpites ou{' '}
          <span style={{ color: '#10b981' }}>dados</span>?
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85, duration: 0.5, ease: 'circOut' }}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '1.1rem',
            color: '#64748b',
            marginTop: 14,
            maxWidth: 420,
            lineHeight: 1.5,
          }}
        >
          A maioria escala no feeling.
          <br />
          Os melhores escaladores <span style={{ color: '#f59e0b' }}>usam análise</span>.
        </motion.p>
      </div>
    </motion.div>
  );
}
