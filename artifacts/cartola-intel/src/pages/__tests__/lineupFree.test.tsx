import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Lineup from "../lineup";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterAll(() => vi.unstubAllGlobals());
const state = vi.hoisted(() => ({
  isPro: false, anonymous: false, loading: false, failure: 0,
  generate: vi.fn(), paywall: vi.fn(), track: vi.fn(), toast: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: state.anonymous ? null : { id: 123, preferences: { defaultStrategy: "cost-benefit" } },
  isPro: state.isPro, isLoading: state.loading,
}) }));
vi.mock("@/hooks/usePopularityFeatures", () => ({ usePopularityFeatures: () => ({ enabled: true, isLoading: false }) }));
vi.mock("@/context/PaywallContext", () => ({ usePaywall: () => ({ openPaywall: state.paywall }) }));
vi.mock("@/hooks/useTrack", () => ({ useTrack: () => state.track }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock("@/components/lineup/FormationComparePanel", () => ({ FormationComparePanel: () => null }));
vi.mock("@/context/LineupConstraintsContext", () => ({ useLineupConstraints: () => ({
  lockedPlayers: [], excludedPlayers: [], lockedPlayerIds: [], excludedPlayerIds: [],
  isLocked: () => false, isExcluded: () => false, toggleLocked: vi.fn(), toggleExcluded: vi.fn(), clear: vi.fn(),
}) }));
vi.mock("@workspace/api-client-react", () => ({
  useGetCurrentRound: () => ({ data: { round: 35, marketOpen: true }, isLoading: false }),
  useSaveLineup: () => ({ mutate: vi.fn() }),
  useGenerateLineup: () => ({
    mutate: (input: unknown, callbacks: { onError: (e: unknown) => void }) => {
      state.generate(input);
      if (state.failure) callbacks.onError({ status: state.failure, data: { reason: "login_required" } });
    },
    isPending: false, isError: false,
  }),
}));
afterEach(() => {
  cleanup(); vi.clearAllMocks();
  state.isPro = false; state.anonymous = false; state.loading = false; state.failure = 0;
});
function show(url = "/escalacao") {
  return render(<MemoryRouter initialEntries={[url]}><Lineup /></MemoryRouter>);
}
it("primeiro Gerar do Free envia safe mesmo com preferência antiga Pro", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: /Gerar Escalação/i }));
  expect(state.generate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ strategy: "safe" }) }));
  expect(state.paywall).not.toHaveBeenCalled();
});
it("clique em estratégia Pro abre paywall e registra bloqueio sem chamar API", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Custo-Benefício" }));
  expect(state.paywall).toHaveBeenCalledTimes(1);
  expect(state.track).toHaveBeenCalledWith("lineup_generate_blocked", { reason: "pro_strategy" });
  expect(state.generate).not.toHaveBeenCalled();
});
it("401 para visitante mostra convite e link Google, não paywall", async () => {
  state.anonymous = true; state.failure = 401;
  show();
  fireEvent.click(screen.getByRole("button", { name: /Gerar Escalação/i }));
  expect(await screen.findByText("Entre com Google para gerar sua escalação grátis")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Entrar com Google" }).getAttribute("href")).toBe("/api/auth/google");
  expect(state.track).toHaveBeenCalledWith("lineup_generate_blocked", { reason: "login_required" });
  expect(state.paywall).not.toHaveBeenCalled();
});
it("Pro respeita preferência sem URL e URL explícita tem precedência", () => {
  state.isPro = true;
  const view = show();
  fireEvent.click(screen.getByRole("button", { name: /Gerar Escalação/i }));
  expect(state.generate).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ strategy: "cost-benefit" }) }));
  view.unmount();
  show("/escalacao?strategy=aggressive");
  fireEvent.click(screen.getByRole("button", { name: /Gerar Escalação/i }));
  expect(state.generate).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ strategy: "aggressive" }) }));
});
it("aguarda a autenticação e aplica a preferência após ela carregar", async () => {
  state.loading = true;
  const view = show();
  expect(screen.getByRole("button", { name: /Gerar Escalação/i }).hasAttribute("disabled")).toBe(true);
  state.loading = false; state.isPro = true;
  view.rerender(<MemoryRouter><Lineup /></MemoryRouter>);
  await waitFor(() => expect(screen.getByRole("button", { name: /Gerar Escalação/i }).hasAttribute("disabled")).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: /Gerar Escalação/i }));
  expect(state.generate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ strategy: "cost-benefit" }) }));
});
