import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTrack } from "@/hooks/useTrack";

function formatCutoff(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Faixa fina exibida apenas para usuários free beneficiados pela
 * campanha Founder Access (plan === "free" && isPro === true).
 * Dispensável via estado local — reaparece na próxima sessão (intencional).
 */
export function FounderCampaignBanner() {
  const { plan, isPro, user } = useAuth();
  const navigate = useNavigate();
  const track = useTrack();
  const trackedRef = useRef(false);
  const [dismissed, setDismissed] = useState(false);

  const isFounderAccess = isPro && plan === "free";
  const founderCutoff = user?.founderCutoff ?? null;

  useEffect(() => {
    if (!isFounderAccess || trackedRef.current) return;
    trackedRef.current = true;
    track("founder_campaign_banner_viewed", {
      cutoff: founderCutoff ?? "unknown",
    });
  }, [isFounderAccess, founderCutoff, track]);

  if (!isFounderAccess || !founderCutoff || dismissed) return null;

  const cutoffLabel = formatCutoff(founderCutoff);

  return (
    <div
      role="banner"
      aria-label="Campanha Founder Access"
      className="
        w-full flex items-center gap-3 px-4 py-2
        bg-primary/10 border-b border-primary/20
        text-sm text-foreground
      "
    >
      <Sparkles className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />

      <p className="flex-1 min-w-0 leading-snug text-xs sm:text-sm">
        <span className="font-semibold text-primary">Acesso completo liberado</span>
        {" "}— simulador, probabilidades, fronteira e comparador disponíveis para todos até{" "}
        <span className="font-medium">{cutoffLabel}</span>.
        {" "}Depois disso, esses recursos voltam a ser exclusivos do plano Pro.
      </p>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10 font-semibold hidden sm:flex items-center gap-1"
          onClick={() => navigate("/planos")}
        >
          Ver planos
          <ArrowRight className="w-3 h-3" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-transparent"
          aria-label="Fechar aviso"
          onClick={() => setDismissed(true)}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
