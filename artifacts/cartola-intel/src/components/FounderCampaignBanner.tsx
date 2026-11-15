import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTrack } from "@/hooks/useTrack";
import { getGetBillingConfigQueryKey, useGetBillingConfig } from "@workspace/api-client-react";
import { formatBillingDate } from "@/lib/billingAccess";

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
  const { data: billingConfig } = useGetBillingConfig({
    query: {
      queryKey: getGetBillingConfigQueryKey(),
      enabled: isFounderAccess && !!founderCutoff && !dismissed,
      staleTime: 30_000,
    },
  });

  useEffect(() => {
    if (!isFounderAccess || trackedRef.current) return;
    trackedRef.current = true;
    track("founder_campaign_banner_viewed", {
      cutoff: founderCutoff ?? "unknown",
    });
  }, [isFounderAccess, founderCutoff, track]);

  if (!isFounderAccess || !founderCutoff || new Date(founderCutoff) <= new Date() || dismissed) return null;

  const cutoffLabel = formatBillingDate(founderCutoff);

  return (
    <div
      role="banner"
      aria-label="Campanha Founder Access"
      className="
        w-full flex items-start gap-3 px-4 py-3
        bg-primary/10 border-b border-primary/20
        text-sm text-foreground
      "
    >
      <Sparkles className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />

      <div className="flex-1 min-w-0">
        <p className="leading-snug text-xs sm:text-sm">
          <span className="font-semibold text-primary">Acesso completo liberado</span>
          {" "}— simulador, probabilidades, fronteira e comparador disponíveis para todos até{" "}
          <span className="font-medium">{cutoffLabel} (Brasília)</span>.
          {" "}Depois disso, esses recursos voltam a ser exclusivos do plano Pro.
        </p>

        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-auto min-h-9 max-w-full whitespace-normal px-3 py-2 text-xs sm:text-sm text-primary border-primary/30 hover:text-primary hover:bg-primary/10 font-semibold"
          onClick={() => {
            track("founder_banner_clicked", { seasonPassYear: billingConfig?.seasonPassYear, cutoff: founderCutoff });
            navigate("/planos");
          }}
        >
          {billingConfig ? `Garantir o Season Pass ${billingConfig.seasonPassYear}` : "Ver planos"}
          <ArrowRight className="w-4 h-4 shrink-0" />
        </Button>
      </div>
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
  );
}
