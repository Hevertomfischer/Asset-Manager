import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const positions = [
  { label: 'ATA', score: 8.4, color: '#10b981', delay: 0.3 },
  { label: 'MEI', score: 7.1, color: '#8b5cf6', delay: 0.45 },
  { label: 'ZAG', score: 6.8, color: '#3b82f6', delay: 0.6 },
  { label: 'LAT', score: 5.9, color: '#f59e0b', delay: 0.75 },
  { label: 'GOL', score: 5.2, color: '#ec4899', delay: 0.9 },
];

function AnimatedNumber({ target, delay }: { target: number; delay: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const steps = 28;
      let i = 0;
      const id = setInterval(() => {
        i++;
        setVal(parseFloat(((target * i) / steps).toFixed(1)));
        if (i >= steps) clearInterval(id);
      }, 40);
      return () => clearInterval(id);
    }, delay * 1000);
    return () => clearTimeout(t);
  }, [target, delay]);
  return <span>{val.toFixed(1)}</span>;
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
          background: 'radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 65%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ display: 'flex', gap: 72, alignItems: 'center', position: 'relative', zIndex: 1 }}>
        {/* Left: brand */}
        <div style={{ textAlign: 'left' }}>
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.45, ease: 'circOut' }}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              color: '#10b981',
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              marginBottom: 10,
            }}
          >
            Apresentando
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '4.5rem',
              lineHeight: 1,
              color: '#ffffff',
              letterSpacing: '-0.03em',
            }}
          >
            Mito
            <span style={{ color: '#10b981' }}>metro</span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.45, ease: 'circOut' }}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '1.1rem',
              color: '#64748b',
              marginTop: 14,
              maxWidth: 280,
              lineHeight: 1.5,
            }}
          >
            Projeções de pontuação{' '}
            <span style={{ color: '#94a3b8' }}>por posição</span>,
            <br />
            baseadas em dados reais.
          </motion.div>

          {/* Emerald divider */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.7, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            style={{
              height: 2,
              width: 200,
              background: 'linear-gradient(90deg, #10b981, transparent)',
              marginTop: 20,
              transformOrigin: 'left',
            }}
          />
        </div>

        {/* Right: projection bars */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 300 }}>
          {positions.map((pos) => (
            <motion.div
              key={pos.label}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: pos.delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              style={{ display: 'flex', alignItems: 'center', gap: 12 }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  color: pos.color,
                  width: 30,
                  letterSpacing: '0.05em',
                  fontWeight: 600,
                }}
              >
                {pos.label}
              </span>
              <div
                style={{
                  flex: 1,
                  height: 8,
                  borderRadius: 4,
                  background: '#1e293b',
                  overflow: 'hidden',
                }}
              >
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(pos.score / 10) * 100}%` }}
                  transition={{ delay: pos.delay + 0.15, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    height: '100%',
                    borderRadius: 4,
                    background: `linear-gradient(90deg, ${pos.color}, ${pos.color}88)`,
                    boxShadow: `0 0 8px ${pos.color}66`,
                  }}
                />
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.95rem',
                  color: '#ffffff',
                  width: 36,
                  textAlign: 'right',
                  fontWeight: 600,
                }}
              >
                <AnimatedNumber target={pos.score} delay={pos.delay + 0.15} />
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
