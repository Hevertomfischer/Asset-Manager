import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AuthUser } from "@/hooks/useAuth";
import type { BillingConfiguration, BillingSubscription } from "@workspace/api-client-react";

const mocks = vi.hoisted(() => ({
  user: {} as AuthUser,
  config: {} as { data?: BillingConfiguration; isError: boolean },
  subscription: {} as { data?: BillingSubscription; isLoading: boolean; isError: boolean },
  track: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mocks.user, plan: mocks.user.plan, isPro: mocks.user.isPro,
    isAuthenticated: true, isLoading: false, logout: vi.fn(),
  }),
}));
vi.mock("@/hooks/useTrack", () => ({ useTrack: () => mocks.track }));
vi.mock("@workspace/api-client-react", async (original) => ({
  ...await original<typeof import("@workspace/api-client-react")>(),
  useGetBillingConfig: () => mocks.config,
  useGetBillingSubscription: () => mocks.subscription,
}));
import Planos from "@/pages/planos";
import Conta from "@/pages/conta";
import { FounderCampaignBanner } from "../FounderCampaignBanner";
import { formatBillingDate, getAccessDetails } from "@/lib/billingAccess";

const cutoff = "2030-12-31T23:59:59Z";
const end = "2032-01-01T02:59:00Z";
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2030-11-13T12:00:00Z"));
  mocks.track.mockClear();
  mocks.user = {
    id: 42, email: "billing@example.test", name: "Teste", avatarUrl: null, role: "user",
    provider: "google", plan: "free", isPro: true, founderCutoff: cutoff,
    preferences: { onboardingCompleted: true, defaultStrategy: "cost-benefit" },
  };
  mocks.config = {
    data: {
      seasonPassYear: 2031, seasonPassEndsAt: end, founderCutoff: cutoff,
      proMonthlyPrice: 29.9, seasonPassPrice: 79.9, regularSeasonPassPrice: 129.9,
      founderSeasonPassPrice: 79.9,
    }, isError: false,
  };
  mocks.subscription = {
    data: { plan: "free", status: "inactive", currentPeriodStart: null, currentPeriodEnd: null },
    isLoading: false, isError: false,
  };
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function wrap(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;
}

test("planos usa ano, validade e preços da API e destaca o desconto Founder", () => {
  render(wrap(<Planos />));
  expect(screen.getByRole("heading", { name: "Season Pass 2031" })).toBeInTheDocument();
  expect(screen.getByText(/^R\$\s29,90$/)).toBeInTheDocument();
  expect(screen.getByText(/79,90/)).toBeInTheDocument();
  expect(screen.getByText(/129,90/)).toHaveProperty("tagName", "S");
  expect(screen.getByText("Preço de Fundador")).toBeInTheDocument();
  expect(screen.getByText(`Válido até ${formatBillingDate(end)} (Brasília).`)).toBeInTheDocument();
  expect(screen.getByText(/Sua assinatura paga começa a contar após/)).toHaveTextContent(formatBillingDate(cutoff));
});
test("campanha e preço Founder desaparecem depois do corte, mesmo com configuração em cache", () => {
  vi.setSystemTime(new Date("2031-01-01T12:00:00Z"));
  render(wrap(<Planos />));
  expect(screen.queryByText("Preço de Fundador")).not.toBeInTheDocument();
  expect(screen.queryByText(/Sua assinatura paga começa a contar após/)).not.toBeInTheDocument();
  expect(screen.getByText(/^R\$\s129,90$/)).toBeInTheDocument();
});
test("409 mantém a mensagem exata do backend e reabilita o botão", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false, status: 409, json: async () => ({ error: "Este Season Pass foi encerrado pelo administrador." }),
  });
  vi.stubGlobal("fetch", fetchMock);
  render(wrap(<Planos />));
  fireEvent.click(screen.getByRole("button", { name: "Assinar Season Pass 2031" }));
  expect(await screen.findByText("Este Season Pass foi encerrado pelo administrador.")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "Assinar Season Pass 2031" })).toBeEnabled());
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ plan: "season_pass" });
});
test("banner oferece o Season Pass no mobile e registra o clique antes de navegar", () => {
  render(wrap(<Routes>
    <Route path="/" element={<FounderCampaignBanner />} />
    <Route path="/planos" element={<div>Destino dos planos</div>} />
  </Routes>));
  const button = screen.getByRole("button", { name: "Garantir o Season Pass 2031" });
  expect(button.className).not.toContain("hidden");
  fireEvent.click(button);
  expect(mocks.track).toHaveBeenCalledWith("founder_banner_clicked", expect.objectContaining({ seasonPassYear: 2031 }));
  expect(screen.getByText("Destino dos planos")).toBeInTheDocument();
});
test("conta separa plano gratuito de benefício Fundador e mostra fim do acesso", () => {
  render(wrap(<Conta />));
  expect(screen.getByText("Plano real")).toBeInTheDocument();
  expect(screen.getByText("Gratuito")).toBeInTheDocument();
  expect(screen.getByText("Acesso Fundador")).toBeInTheDocument();
  expect(screen.getByText(`${formatBillingDate(cutoff)} (Brasília)`)).toBeInTheDocument();
});
test("conta informa início futuro pago e fim efetivo sem perder o plano real Pro", () => {
  mocks.user.plan = "pro";
  mocks.subscription.data = { plan: "pro", status: "active", currentPeriodStart: cutoff, currentPeriodEnd: end };
  render(wrap(<Conta />));
  expect(screen.getByText("Pro")).toBeInTheDocument();
  expect(screen.getByText("Acesso Fundador")).toBeInTheDocument();
  expect(screen.getByText("Início da assinatura paga")).toBeInTheDocument();
  expect(screen.getByText(`${formatBillingDate(cutoff)} (Brasília)`)).toBeInTheDocument();
  expect(screen.getByText(`${formatBillingDate(end)} (Brasília)`)).toBeInTheDocument();
});
test("conta com assinatura em curso mostra origem Assinatura", () => {
  mocks.user.plan = "pro";
  mocks.user.founderCutoff = null;
  mocks.subscription.data = { plan: "pro", status: "active", currentPeriodStart: "2030-11-01T00:00:00Z", currentPeriodEnd: end };
  render(wrap(<Conta />));
  expect(screen.getByText("Assinatura")).toBeInTheDocument();
  expect(screen.queryByText("Início da assinatura paga")).not.toBeInTheDocument();
});
test("conta gratuita fora da campanha não inventa um vencimento", () => {
  mocks.user.founderCutoff = null;
  mocks.user.isPro = false;
  render(wrap(<Conta />));
  expect(screen.getByText("Sem data de término — plano gratuito")).toBeInTheDocument();
});
test("conta trata erro da assinatura sem anunciar uma validade falsa", () => {
  mocks.subscription.isError = true;
  mocks.subscription.data = undefined;
  render(wrap(<Conta />));
  expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível carregar os detalhes");
  expect(screen.queryByText("Sem data de término — plano gratuito")).not.toBeInTheDocument();
});
test("acesso efetivo considera o maior prazo e ignora assinatura vencida", () => {
  const now = new Date("2030-11-13T12:00:00Z");
  const paid = { plan: "pro", status: "active", currentPeriodStart: null, currentPeriodEnd: "2030-11-30T00:00:00Z" };
  expect(getAccessDetails("pro", paid, cutoff, now).effectiveEndsAt).toBe(cutoff);
  expect(getAccessDetails("pro", { ...paid, currentPeriodEnd: "2030-01-01T00:00:00Z" }, null, now))
    .toMatchObject({ realPlan: "free", origin: "Gratuito", effectiveEndsAt: null });
});
