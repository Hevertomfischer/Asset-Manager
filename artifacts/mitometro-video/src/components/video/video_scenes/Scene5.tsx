import { motion } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';

function AnimatedCount({
  target,
  suffix = '',
  delay,
  decimals = 0,
}: {
  target: number;
  suffix?: string;
  delay: number;
  decimals?: number;
}) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const steps = 32;
      let i = 0;
      const id = setInterval(() => {
        i++;
        setVal(parseFloat(((target * i) / steps).toFixed(decimals)));
        if (i >= steps) clearInterval(id);
      }, 40);
      return () => clearInterval(id);
    }, delay * 1000);
    return () => clearTimeout(t);
  }, [target, delay, decimals]);
  return (
    <span>
      {decimals > 0 ? val.toFixed(decimals) : Math.round(val)}
      {suffix}
    </span>
  );
}

const metrics = [
  {
    value: 15,
    suffix: '',
    label: 'rodadas analisadas',
    sublabel: 'Série A 2026',
    color: '#10b981',
    delay: 0.5,
    decimals: 0,
  },
  {
    value: 2.85,
    suffix: ' pts',
    label: 'erro médio absoluto (MAE)',
    sublabel: 'por jogador · temporada',
    color: '#f59e0b',
    delay: 0.72,
    decimals: 2,
  },
  {
    value: 64.4,
    suffix: '%',
    label: 'acerto nos diferenciais',
    sublabel: 'top quartil × mediana da rodada',
    color: '#8b5cf6',
    delay: 0.94,
    decimals: 1,
  },
];

export default function Scene5({ aspectRatio = '9:16', muted = false }: { aspectRatio?: '16:9' | '9:16', muted?: boolean }) {
  const isLandscape = aspectRatio === '16:9';
  const tickAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (muted) return;
    const timers = metrics.map(m => setTimeout(() => tickAudioRef.current?.play().catch(()=>{}), m.delay * 1000 + 100));
    return () => timers.forEach(clearTimeout);
  }, [muted]);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ background: '#060b16' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04, filter: 'blur(10px)' }}
      transition={{ duration: 0.55 }}
    >
      <audio ref={tickAudioRef} src={`${import.meta.env.BASE_URL}audio/tick.wav`} preload="auto" />
      <audio src={`${import.meta.env.BASE_URL}audio/whoosh.wav`} autoPlay muted={muted} />

      {/* Grid bg */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(16,185,129,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.04) 1px, transparent 1px)',
          backgroundSize: '100px 100px',
        }}
      />

      {/* Glow */}
      <div
        style={{
          position: 'absolute',
          width: isLandscape ? 1200 : 900,
          height: isLandscape ? 800 : 900,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />

      {/* Section label */}
      <motion.div
        initial={{ opacity: 0, y: -24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.45 }}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 28,
          color: '#f59e0b',
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          marginBottom: 36,
          position: 'relative',
          zIndex: 2,
        }}
      >
        Transparência total
      </motion.div>

      {/* Main headline */}
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 2, marginBottom: isLandscape ? 50 : 80, padding: '0 60px' }}>
        <motion.h2
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.5, ease: 'circOut' }}
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: isLandscape ? 100 : 86,
            color: '#ffffff',
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          Todo modelo erra.
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.45, ease: 'circOut' }}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: isLandscape ? 40 : 44,
            color: '#64748b',
            marginTop: 25,
          }}
        >
          A diferença é saber{' '}
          <span style={{ color: '#f59e0b', fontWeight: 600 }}>exatamente quanto</span>.
        </motion.p>
      </div>

      {/* Metrics stacked */}
      <div
        style={{
          display: 'flex',
          flexDirection: isLandscape ? 'row' : 'column',
          gap: 30,
          width: '100%',
          padding: isLandscape ? '0 100px' : '0 50px',
          position: 'relative',
          zIndex: 2,
          justifyContent: 'center',
        }}
      >
        {metrics.map((m) => (
          <motion.div
            key={m.label}
            initial={{ opacity: 0, x: 60, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ delay: m.delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            style={{
              borderRadius: 35,
              border: `3px solid ${m.color}30`,
              background: `linear-gradient(135deg, ${m.color}0d 0%, #0b1120 100%)`,
              padding: isLandscape ? '40px' : '40px 55px',
              display: 'flex',
              flexDirection: isLandscape ? 'column' : 'row',
              alignItems: isLandscape ? 'flex-start' : 'center',
              gap: isLandscape ? 20 : 50,
              flex: isLandscape ? 1 : 'none',
            }}
          >
            {/* Number */}
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: isLandscape ? 80 : 88,
                fontWeight: 700,
                color: m.color,
                lineHeight: 1,
                textShadow: `0 0 50px ${m.color}44`,
                flexShrink: 0,
                minWidth: isLandscape ? 'auto' : 230,
                textAlign: isLandscape ? 'left' : 'right',
              }}
            >
              <AnimatedCount target={m.value} suffix={m.suffix} delay={m.delay} decimals={m.decimals} />
            </div>

            <div style={{ 
              width: isLandscape ? '100%' : 2, 
              height: isLandscape ? 2 : 'auto', 
              alignSelf: 'stretch', 
              background: `${m.color}25` 
            }} />

            {/* Label */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: isLandscape ? 30 : 34,
                  color: '#94a3b8',
                  lineHeight: 1.4,
                }}
              >
                {m.label}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: isLandscape ? 20 : 25,
                  color: '#475569',
                  marginTop: 8,
                }}
              >
                {m.sublabel}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Footer note */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.35, duration: 0.5 }}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 26,
          color: '#334155',
          marginTop: isLandscape ? 40 : 60,
          letterSpacing: '0.05em',
          position: 'relative',
          zIndex: 2,
          textAlign: 'center',
          padding: '0 60px',
        }}
      >
        Histórico completo em mitometro.com.br/desempenho
      </motion.p>
    </motion.div>
  );
}
