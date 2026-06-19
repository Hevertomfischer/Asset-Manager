import { motion } from 'framer-motion';

const features = [
  {
    icon: '🎯',
    title: 'Projeções',
    desc: 'Pontuação esperada por posição com base em histórico e confronto',
    color: '#10b981',
    delay: 0.15,
  },
  {
    icon: '🔄',
    title: 'Simulações de Troca',
    desc: 'Veja o impacto de cada substituição antes de confirmar',
    color: '#8b5cf6',
    delay: 0.3,
  },
  {
    icon: '⚠️',
    title: 'Armadilhas',
    desc: 'Alertas de jogadores supervalorizados ou em má fase',
    color: '#f59e0b',
    delay: 0.45,
  },
  {
    icon: '📊',
    title: 'Comparações',
    desc: 'Ranqueamento de opções por posição em tempo real',
    color: '#3b82f6',
    delay: 0.6,
  },
];

export default function Scene4() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ background: '#080d1a' }}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30, filter: 'blur(8px)' }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Section label */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.4 }}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          color: '#10b981',
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          marginBottom: 16,
        }}
      >
        Funcionalidades
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.45, ease: 'circOut' }}
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: '2.4rem',
          color: '#ffffff',
          marginBottom: 40,
          letterSpacing: '-0.02em',
          textAlign: 'center',
        }}
      >
        Tudo que você precisa para{' '}
        <span style={{ color: '#10b981' }}>escalar melhor</span>
      </motion.h2>

      {/* Feature cards grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          maxWidth: 760,
          width: '100%',
          padding: '0 32px',
        }}
      >
        {features.map((f) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: f.delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            style={{
              borderRadius: 14,
              border: `1.5px solid ${f.color}30`,
              background: `linear-gradient(135deg, ${f.color}0d 0%, #0f1629 100%)`,
              padding: '22px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.5rem' }}>{f.icon}</span>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  fontSize: '1.05rem',
                  color: f.color,
                }}
              >
                {f.title}
              </span>
            </div>
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.88rem',
                color: '#64748b',
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              {f.desc}
            </p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
