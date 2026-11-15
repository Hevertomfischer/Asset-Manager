import type { BillingSubscription } from "@workspace/api-client-react";

export function formatBillingDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function getAccessDetails(
  plan: "free" | "pro",
  subscription: BillingSubscription | undefined,
  founderCutoff: string | null,
  now = new Date(),
) {
  const cutoff = founderCutoff && new Date(founderCutoff) > now ? founderCutoff : null;
  const paidEnd = subscription?.plan === "pro" && subscription.status === "active"
    && subscription.currentPeriodEnd && new Date(subscription.currentPeriodEnd) > now
    ? subscription.currentPeriodEnd : null;
  const realPlan = subscription ? (paidEnd ? "pro" : "free") : plan;
  const paidStartsAt = paidEnd && subscription?.currentPeriodStart
    && new Date(subscription.currentPeriodStart) > now ? subscription.currentPeriodStart : null;
  const ends = [cutoff, paidEnd].filter((date): date is string => !!date);
  return {
    realPlan,
    origin: realPlan === "pro" && (!paidStartsAt || !cutoff) ? "Assinatura"
      : cutoff ? "Acesso Fundador" : "Gratuito",
    effectiveEndsAt: ends.length ? ends.reduce((max, date) => new Date(date) > new Date(max) ? date : max) : null,
    paidStartsAt,
  };
}
