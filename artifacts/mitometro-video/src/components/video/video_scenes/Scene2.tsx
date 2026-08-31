import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

const leftItems = ['Feeling', 'Influenciador', 'Chute'];
const rightItems = ['Dados históricos', 'Confrontos', 'Razões claras'];

export default function Scene2({ aspectRatio = '9:16', muted = false }: { aspectRatio?: '16:9' | '9:16', muted?: boolean }) {
  const isLandscape = aspectRatio === '16:9';
  const tickAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (muted) return;
    const timers = [
      setTimeout(() => tickAudioRef.current?.play().catch(()=>{}), 400),
      setTimeout(() => tickAudioRef.current?.play().catch(()=>{}), 550),
      setTimeout(() => tickAudioRef.current?.play().catch(()=>{}), 700),
      // Right items
      setTimeout(() => tickAudioRef.current?.play().catch(()=>{}), 400),
      setTimeout(() => tickAudioRef.current?.play().catch(()=>{}), 550),
      setTimeout(() => tickAudioRef.current?.play().catch(()=>{}), 700),
    ];
    return () => timers.forEach(clearTimeout);
  }, [muted]);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: '#080d1a', flexDirection: isLandscape ? 'row' : 'column' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: -200, filter: 'blur(10px)' }}
      transition={{ duration: 0.5 }}
    >
      <audio ref={tickAudioRef} src={`${import.meta.env.BASE_URL}audio/tick.wav`} preload="auto" />
      <audio src={`${import.meta.env.BASE_URL}audio/whoosh.wav`} autoPlay muted={muted} />
      {/* Voice-over */}
      <audio src={`${import.meta.env.BASE_URL}audio/tts1.mp3`} autoPlay muted={muted} />

      {/* Subtle grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(16,185,129,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(16,185,129,0.04) 1px, transparent 1px)',
          backgroundSize: '100px 100px',
        }}
      />

      {/* Divider line */}
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ delay: 0.3, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'absolute',
          ...(isLandscape
            ? { top: 86, bottom: 86, left: '50%', width: 2, transformOrigin: 'top', background: 'linear-gradient(to bottom, transparent, #334155, transparent)' }
            : { left: 86, right: 86, top: '50%', height: 2, transformOrigin: 'center', background: 'linear-gradient(to right, transparent, #334155, transparent)' }),
          zIndex: 1,
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: isLandscape ? 'row' : 'column',
          width: '100%',
          padding: isLandscape ? '0 40px' : '0 70px',
          position: 'relative',
          zIndex: 2,
          gap: isLandscape ? 40 : 0,
          marginTop: isLandscape ? -80 : 0
        }}
      >
        {/* Top/Left — Palpite */}
        <motion.div
          initial={{ opacity: 0, y: isLandscape ? 0 : -60, x: isLandscape ? -60 : 0 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          transition={{ delay: 0.15, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingBottom: isLandscape ? 0 : 70,
            flex: 1,
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
                fontSize: isLandscape ? 38 : 46,
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
                transition={{ delay: 0.4 + i * 0.15, duration: 0.4, ease: 'circOut' }}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: isLandscape ? 32 : 38,
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

        {/* Bottom/Right — Escalação com explicação */}
        <motion.div
          initial={{ opacity: 0, y: isLandscape ? 0 : 60, x: isLandscape ? 60 : 0 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          transition={{ delay: 0.15, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: isLandscape ? 0 : 70,
            flex: 1,
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
                fontSize: isLandscape ? 38 : 42,
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
                transition={{ delay: 0.4 + i * 0.15, duration: 0.4, ease: 'circOut' }}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: isLandscape ? 32 : 38,
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
          fontSize: isLandscape ? 72 : 60,
          color: '#ffffff',
          marginTop: 90,
          textAlign: 'center',
          position: 'absolute',
          bottom: isLandscape ? 100 : 280,
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
