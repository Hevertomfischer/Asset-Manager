import { forwardRef } from "react";

interface Props {
  subtitle: string;
  /** Largura do card em px. Padrão: 560 */
  width?: number;
  children: React.ReactNode;
}

/**
 * Moldura comum para todos os cards de compartilhamento do Mitometro.
 *
 * Posiciona-se fora da viewport (left: -9999px) para o html-to-image capturar.
 * Usa APENAS inline styles — Tailwind não é capturado corretamente fora da viewport.
 *
 * Uso:
 *   const ref = useRef<HTMLDivElement>(null);
 *   const { share, isSharing } = useShareCard(ref, "filename.png", "cardType");
 *   <ShareCardFrame ref={ref} subtitle="Título">...conteúdo...</ShareCardFrame>
 */
export const ShareCardFrame = forwardRef<HTMLDivElement, Props>(
  function ShareCardFrame({ subtitle, width = 560, children }, ref) {
    return (
      <div
        ref={ref}
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-9999px",
          top: 0,
          width: `${width}px`,
          backgroundColor: "#0f172a",
          color: "#f1f5f9",
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          borderRadius: "16px",
          overflow: "hidden",
        }}
      >
        {/* ── Header com logo ── */}
        <div
          style={{
            background: "linear-gradient(135deg, #064e3b 0%, #065f46 100%)",
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                background: "#10b981",
                borderRadius: "8px",
                width: "26px",
                height: "26px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ color: "#0f172a", fontWeight: 900, fontSize: "13px" }}>M</span>
            </div>
            <span style={{ fontSize: "17px", fontWeight: 700, color: "#f1f5f9" }}>
              Mito<span style={{ color: "#10b981" }}>metro</span>
            </span>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: "10px",
                color: "#34d399",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {subtitle}
            </div>
            <div style={{ fontSize: "9px", color: "#6ee7b7", marginTop: "2px" }}>
              Cartola FC Intelligence
            </div>
          </div>
        </div>

        {/* ── Slot de conteúdo ── */}
        {children}

        {/* ── Footer com URL ── */}
        <div
          style={{
            padding: "9px 20px",
            background: "#080e1a",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "11px", color: "#34d399", fontWeight: 600 }}>
            mitometro.com.br
          </span>
          <span style={{ fontSize: "9px", color: "#334155" }}>Cartola FC · Temporada 2025</span>
        </div>
      </div>
    );
  },
);
