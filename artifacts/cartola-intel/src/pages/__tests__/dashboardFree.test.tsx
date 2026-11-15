import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "../dashboard";

const state = vi.hoisted(() => ({ status: 0, enabled: true }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({
  user: { id: 1, role: "user", plan: "free", isPro: false }, isPro: false, isLoading: false,
}) }));
vi.mock("@/hooks/usePopularityFeatures", () => ({ usePopularityFeatures: () => ({ enabled: state.enabled }) }));
vi.mock("@/components/SyncStatusCard", () => ({ SyncStatusCard: () => <div>Status dos dados</div> }));
vi.mock("@/components/ProGate", () => ({
  ProGate: ({ message }: { message: string }) => <div>{message}</div>,
}));
vi.mock("@workspace/api-client-react", () => ({
  getGetCurrentProjectionsQueryKey: () => ["projections"],
  useGetCurrentRound: () => ({ data: { round: 35 }, refetch: vi.fn() }),
  useGetCurrentMatches: () => ({ data: { matches: [] }, refetch: vi.fn() }),
  useGetCurrentAvailability: () => ({ data: { availability: [] } }),
  useGetCurrentProjections: (_params: unknown, options: { query: { enabled: boolean } }) => {
    expect(options.query.enabled).toBe(true);
    return {
      isError: !!state.status, error: state.status ? { status: state.status } : null, refetch: vi.fn(),
      data: state.status ? undefined : {
        limited: true, proTeaser: { differentials: 7, traps: 3 },
        projections: [{ id: 1, playerId: 1, expectedPoints: 8, player: { nickname: "Atleta público", position: "ATA", price: 10 } }],
      },
    };
  },
}));
afterEach(() => { cleanup(); state.status = 0; state.enabled = true; });

it("Free vê melhores projeções e teasers, sem depender de Founder Access", () => {
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(screen.getByText("Melhores projeções")).toBeTruthy();
  expect(screen.getByText("Atleta público")).toBeTruthy();
  expect(screen.getByText("7 diferenciais nesta rodada")).toBeTruthy();
  expect(screen.getByText("3 armadilhas nesta rodada")).toBeTruthy();
  expect(screen.queryByText("Não foi possível carregar o painel")).toBeNull();
});
it.each([401, 402, 403])("erro %s mantém o Painel e status dos dados, sem erro de página inteira", (status) => {
  state.status = status;
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(screen.getByText("Melhores projeções")).toBeTruthy();
  expect(screen.getByText("Status dos dados")).toBeTruthy();
  expect(screen.getByText("Tentar novamente")).toBeTruthy();
  expect(screen.queryByText("Não foi possível carregar o painel")).toBeNull();
});
it("calibração tem precedência sobre ofertas Pro e teasers", () => {
  state.enabled = false;
  render(<MemoryRouter><Dashboard /></MemoryRouter>);
  expect(screen.getByText("Em calibração")).toBeTruthy();
  expect(screen.queryByText("7 diferenciais nesta rodada")).toBeNull();
});
