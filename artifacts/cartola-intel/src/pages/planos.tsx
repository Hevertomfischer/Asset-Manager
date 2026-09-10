import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks";
import { useTrack } from "@/hooks/useTrack";
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Check,
  Loader2,
  Shield,
  TrendingUp,
  History,
  Bell,
  Target,
  CalendarClock,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ProBadge } from "@/components/ProBadge";

interface SubscriptionData {
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
}

async function fetchSubscription(): Promise<SubscriptionData> {
  const res = await fetch("/api/billing/subscription", { credentials: "include" });
  if (!res.ok) return { plan: "free", status: "inactive", currentPeriodEnd: null };
  return res.json() as Promise<SubscriptionData>;
}

async function startCheckout(plan: string): Promise<string> {
  const res = await fetch("/api/billing/checkout", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? "Erro ao iniciar pagamento");
  }
  const { checkoutUrl } = await res.json() as { checkoutUrl: string };
  return checkoutUrl;
}

const FEATURES = [
  { icon: Shield, text: "5 estratégias de escalação (incluindo Antimassa)" },
  { icon: TrendingUp, text: "Projeções avançadas: Piso, Teto e Risco por jogador" },
  { icon: History, text: "Histórico completo & Backtest de projeções" },
  { icon: Bell, text: "Alertas de valorização por rodada" },
  { icon: Target, text: "Probabilidade de jogo de cada atleta" },
];

const PLANS = [
  {
    id: "pro_monthly" as const,
    name: "Pro Mensal",
    price: "R$ 19,90",
    period: "/mês",
    description: "Acesso completo, renovado todo mês. Cancele quando quiser.",
    best: false,
  },
  {
    id: "season_pass" as const,
    name: "Passe de Temporada",
    price: "R$ 99,90",
    period: "/temporada",
    description: "Acesso completo durante toda a temporada. Melhor custo-benefício.",
    best: true,
  },
];

function BillingBanner({ status }: { status: string }) {
  if (status === "success") {
    return (
      <Alert className="mb-6 border-primary/40 bg-primary/10 text-primary">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <AlertDescription className="font-medium text-primary">
          Pagamento confirmado! Bem-vindo ao Pro. Suas funcionalidades já estão liberadas.
        </AlertDescription>
      </Alert>
    );
  }
  if (status === "failure") {
    return (
      <Alert className="mb-6 border-destructive/40 bg-destructive/10" variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          O pagamento não foi concluído. Tente novamente ou use outro método de pagamento.
        </AlertDescription>
      </Alert>
    );
  }
  if (status === "pending") {
    return (
      <Alert className="mb-6 border-attention/40 bg-attention/10">
        <Clock className="h-4 w-4 text-attention" />
        <AlertDescription className="text-attention-foreground">
          Pagamento em análise. Você receberá uma confirmação quando for aprovado.
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

export default function Planos() {
  const { isAuthenticated, isPro, plan, user } = useAuth();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const track = useTrack();
  const billingStatus = searchParams.get("billing");
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const paywallTrackedRef = useRef(false);

  const founderCutoff = user?.founderCutoff ?? null;

  const { data: subscription } = useQuery({
    queryKey: ["billing", "subscription"],
    queryFn: fetchSubscription,
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  // isRealPro: tem assinatura ativa — não conta acesso de campanha
  const isRealPro = plan === "pro" || subscription?.status === "active";
  // isFounderAccess: campanha ativa, recebendo Pro gratuitamente
  const isFounderAccess = isPro && plan === "free" && founderCutoff !== null;

  // Track paywall_viewed once per mount when the user não tem assinatura real.
  useEffect(() => {
    if (isRealPro || paywallTrackedRef.current) return;
    paywallTrackedRef.current = true;
    track("paywall_viewed", { source: "page" });
  }, [isRealPro, track]);

  useEffect(() => {
    if (billingStatus === "success") {
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      void queryClient.invalidateQueries({ queryKey: ["billing", "subscription"] });
      track("subscription_activated");
    }
  }, [billingStatus, queryClient, track]);

  async function handleCheckout(planId: string) {
    track("checkout_started", { plan: planId });
    setLoadingPlan(planId);
    setCheckoutError(null);
    try {
      const url = await startCheckout(planId);
      window.location.href = url;
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Erro ao iniciar pagamento.");
      setLoadingPlan(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-2 py-4">
      {billingStatus && <BillingBanner status={billingStatus} />}

      {isFounderAccess && founderCutoff && (
        <div className="mb-8 border border-primary/30 bg-primary/5 rounded-2xl p-5">
          <div className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 mt-0.5">
              <CalendarClock className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <p className="text-sm font-semibold text-foreground">
                  Você está usando o Founder Access
                </p>
                <Badge className="bg-primary/20 text-primary border border-primary/30 text-xs font-semibold">
                  Campanha ativa
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Todos os recursos Pro — simulador de escalação, probabilidades de jogo, fronteira de eficiência
                e comparador ilimitado — estão liberados gratuitamente para você até{" "}
                <span className="font-medium text-foreground">
                  {new Date(founderCutoff).toLocaleDateString("pt-BR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed mt-2">
                Após essa data, esses recursos voltam a ser exclusivos do plano Pro.
                Assine agora para garantir acesso contínuo sem interrupção.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-4">
          <Sparkles className="w-3.5 h-3.5" />
           <ProBadge />
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
          Escale melhor. Pontue mais.
        </h1>
        <p className="text-muted-foreground text-base md:text-lg max-w-xl mx-auto">
          Acesse todas as ferramentas de análise e inteligência artificial para dominar o Cartola FC.
        </p>
      </div>

      <div className="mb-8 bg-secondary/40 border border-border rounded-2xl p-5">
        <p className="text-xs font-semibold text-muted-foreground mb-3">
          O que está incluso nos planos Pro
        </p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2.5 text-sm text-foreground">
              <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <Icon className="w-3 h-3 text-primary" />
              </div>
              {text}
            </li>
          ))}
        </ul>
      </div>

      {checkoutError && (
        <Alert className="mb-5 border-destructive/40 bg-destructive/10" variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{checkoutError}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {PLANS.map((plan) => {
          const isLoading = loadingPlan === plan.id;
          const isCurrentPlan = isRealPro;

          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col border motion-safe:transition-colors motion-safe:duration-200 ${
                plan.best
                  ? "border-primary/50 bg-primary/5 shadow-lg shadow-primary/10"
                  : "border-border bg-card"
              }`}
            >
              {plan.best && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground font-semibold px-3 py-0.5 text-xs shadow-md">
                    ✦ Melhor oferta
                  </Badge>
                </div>
              )}

              <CardHeader className="pt-7 pb-3 px-6">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold">{plan.name}</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">{plan.description}</p>
                  </div>
                  {isCurrentPlan && (
                    <Badge variant="secondary" className="shrink-0 mt-0.5 text-xs">
                      Plano atual
                    </Badge>
                  )}
                </div>
                <div className="flex items-baseline gap-1 mt-4">
                   <span className="text-3xl font-extrabold tabular-nums tracking-tight text-foreground">
                    {plan.price}
                  </span>
                  <span className="text-muted-foreground text-sm">{plan.period}</span>
                </div>
              </CardHeader>

              <CardContent className="px-6 pb-6 flex-1 flex flex-col justify-between gap-5">
                <ul className="space-y-2">
                  {FEATURES.map(({ text }) => (
                    <li key={text} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{text}</span>
                    </li>
                  ))}
                </ul>

                {!isAuthenticated ? (
                  <Button
                    asChild
                    className={`w-full font-semibold ${
                      plan.best
                        ? "bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90"
                        : ""
                    }`}
                    variant={plan.best ? "default" : "outline"}
                  >
                    <a href="/api/auth/google">
                      Entrar para assinar
                    </a>
                  </Button>
                ) : isCurrentPlan ? (
                  <Button
                    disabled
                    className="w-full font-semibold"
                    variant="secondary"
                  >
                    <Check className="w-4 h-4 mr-1.5" />
                     <span>Você já é</span> <ProBadge />
                  </Button>
                ) : (
                  <Button
                    className={`w-full font-semibold ${
                      plan.best
                        ? "bg-gradient-to-r from-primary to-accent text-primary-foreground hover:opacity-90"
                        : ""
                    }`}
                    variant={plan.best ? "default" : "outline"}
                    disabled={isLoading || loadingPlan !== null}
                    onClick={() => void handleCheckout(plan.id)}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Abrindo checkout…
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Assinar {plan.name}
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-6">
        Pagamentos processados com segurança pelo Mercado Pago. Aceitamos Pix, cartão de crédito e boleto.
      </p>
    </div>
  );
}
