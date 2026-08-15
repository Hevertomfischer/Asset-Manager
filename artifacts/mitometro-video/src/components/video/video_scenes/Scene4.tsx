import { motion } from 'framer-motion';

const analysisCards = [
  {
    badge: '🔥 Em alta',
    badgeColor: '#10b981',
    badgeBg: 'rgba(16,185,129,0.12)',
    badgeBorder: 'rgba(16,185,129,0.35)',
    player: 'Pedro',
    club: 'Flamengo',
    pts: '9.2',
    reason: 'Últimas 3 rodadas sólidas',
    detail: 'Média 8.6 pts · Em casa',
    delay: 0.2,
  },
  {
    badge: '⚠️ Armadilha',
    badgeColor: '#f59e0b',
    badgeBg: 'rgba(245,158,11,0.12)',
    badgeBorder: 'rgba(245,158,11,0.35)',
    player: 'Calleri',
    club: 'São Paulo',
    pts: '6.1',
    reason: 'Muito escalado, queda de forma',
    detail: '73% escalação · -2.1 pts/jogo',
    delay: 0.45,
  },
  {
    badge: '✅ Confronto favorável',
    badgeColor: '#8b5cf6',
    badgeBg: 'rgba(139,92,246,0.12)',
    badgeBorder: 'rgba(139,92,246,0.35)',
    player: 'De Arrascaeta',
    club: 'Flamengo',
    pts: '8.1',
    reason: 'Em casa · índice 1.4×',
    detail: 'Adversário: Fortaleza',
    delay: 0.7,
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
      {/* Subtle glow */}
      <div
        style={{
          position: 'absolute',
          width: 700,
          height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.07) 0%, transparent 70%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }}
      />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.45 }}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          color: '#10b981',
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          marginBottom: 14,
          position: 'relative',
          zIndex: 2,
        }}
      >
        Análise por jogador
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
          marginBottom: 36,
          letterSpacing: '-0.02em',
          textAlign: 'center',
          position: 'relative',
          zIndex: 2,
        }}
      >
        Cada jogador tem{' '}
        <span style={{ color: '#10b981' }}>um motivo</span>.
      </motion.h2>

      {/* Cards */}
      <div
        style={{
          display: 'flex',
          gap: 20,
          maxWidth: 900,
          width: '100%',
          padding: '0 32px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {analysisCards.map((card) => (
          <motion.div
            key={card.player}
            initial={{ opacity: 0, y: 28, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: card.delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            style={{
              flex: 1,
              borderRadius: 16,
              border: `1.5px solid ${card.badgeBorder}`,
              background: card.badgeBg,
              padding: '20px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {/* Badge */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '5px 12px',
                borderRadius: 100,
                background: card.badgeBg,
                border: `1px solid ${card.badgeBorder}`,
                alignSelf: 'flex-start',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  fontSize: '0.78rem',
                  color: card.badgeColor,
                  letterSpacing: '0.02em',
                }}
              >
                {card.badge}
              </span>
            </div>

            {/* Player info */}
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: '1.25rem',
                  color: '#ffffff',
                  letterSpacing: '-0.01em',
                }}
              >
                {card.player}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.78rem',
                  color: '#475569',
                  marginTop: 2,
                }}
              >
                {card.club}
              </div>
            </div>

            {/* Points */}
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '2rem',
                fontWeight: 700,
                color: card.badgeColor,
                lineHeight: 1,
                textShadow: `0 0 20px ${card.badgeColor}44`,
              }}
            >
              {card.pts}
              <span
                style={{
                  fontSize: '0.85rem',
                  color: '#64748b',
                  fontWeight: 400,
                  marginLeft: 4,
                }}
              >
                pts proj.
              </span>
            </div>

            {/* Reason */}
            <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: `1px solid ${card.badgeBorder}` }}>
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.82rem',
                  color: '#94a3b8',
                  lineHeight: 1.4,
                }}
              >
                {card.reason}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  color: '#475569',
                  marginTop: 4,
                }}
              >
                {card.detail}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
