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
    detail: '73% escalação · −2.1 pts/jogo',
    delay: 0.42,
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
    delay: 0.64,
  },
];

export default function Scene4() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      style={{ background: '#080d1a' }}
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -60, filter: 'blur(8px)' }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Subtle glow */}
      <div
        style={{
          position: 'absolute',
          width: 980,
          height: 980,
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
        initial={{ opacity: 0, y: -24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.45 }}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 28,
          color: '#10b981',
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          marginBottom: 25,
          position: 'relative',
          zIndex: 2,
        }}
      >
        Análise por jogador
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.45, ease: 'circOut' }}
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 76,
          color: '#ffffff',
          marginBottom: 70,
          letterSpacing: '-0.02em',
          textAlign: 'center',
          position: 'relative',
          zIndex: 2,
          padding: '0 60px',
        }}
      >
        Cada jogador tem{' '}
        <span style={{ color: '#10b981' }}>um motivo</span>.
      </motion.h2>

      {/* Cards stacked vertically */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 30,
          width: '100%',
          padding: '0 50px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {analysisCards.map((card) => (
          <motion.div
            key={card.player}
            initial={{ opacity: 0, x: -70, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ delay: card.delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            style={{
              borderRadius: 35,
              border: `3px solid ${card.badgeBorder}`,
              background: card.badgeBg,
              padding: '35px 45px',
              display: 'flex',
              alignItems: 'center',
              gap: 40,
            }}
          >
            {/* Points — left */}
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 72,
                fontWeight: 700,
                color: card.badgeColor,
                lineHeight: 1,
                textShadow: `0 0 40px ${card.badgeColor}44`,
                flexShrink: 0,
                width: 150,
                textAlign: 'center',
              }}
            >
              {card.pts}
              <div style={{ fontSize: 22, color: '#64748b', fontWeight: 400, marginTop: 6 }}>
                pts proj.
              </div>
            </div>

            {/* Divider */}
            <div style={{ width: 2, alignSelf: 'stretch', background: `${card.badgeBorder}` }} />

            {/* Info — right */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Badge */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '8px 25px',
                  borderRadius: 250,
                  background: card.badgeBg,
                  border: `2px solid ${card.badgeBorder}`,
                  marginBottom: 16,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                    fontSize: 28,
                    color: card.badgeColor,
                  }}
                >
                  {card.badge}
                </span>
              </div>

              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: 40,
                  color: '#ffffff',
                  letterSpacing: '-0.01em',
                }}
              >
                {card.player}
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 29,
                    color: '#475569',
                    fontWeight: 400,
                    marginLeft: 15,
                  }}
                >
                  {card.club}
                </span>
              </div>

              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 30,
                  color: '#94a3b8',
                  marginTop: 8,
                  lineHeight: 1.3,
                }}
              >
                {card.reason}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 25,
                  color: '#475569',
                  marginTop: 6,
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
