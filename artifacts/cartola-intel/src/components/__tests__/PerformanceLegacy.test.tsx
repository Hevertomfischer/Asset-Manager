import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, test, vi } from "vitest";
const m = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@tanstack/react-query", async (original) => ({
  ...await original<typeof import("@tanstack/react-query")>(), useQuery: m.query,
}));
vi.mock("@/hooks/useShareCard", () => ({ useShareCard: () => ({ share: vi.fn(), isSharing: false, errorMsg: null }) }));
import Desempenho from "@/pages/desempenho";

test("mostra o legado separado mesmo quando a série confiável ainda está vazia", () => {
  m.query.mockReturnValue({ data: {
    empty: true, message: "Aguardando a primeira rodada congelada.",
    season: { totalRounds: 0, totalDataPoints: 0, mae: null },
    calibration: [], byRound: [],
    legacy: {
      empty: false, disclaimer: "Sem garantia de congelamento. Não integra a série confiável.",
      season: { totalRounds: 26, totalDataPoints: 7790, mae: 2.79 },
      byRound: [{ round: 34, count: 306, mae: 2.72 }],
    },
  }, isLoading: false, isError: false, refetch: vi.fn() });
  render(<MemoryRouter><Desempenho /></MemoryRouter>);
  expect(screen.getByText("Histórico legado")).toBeInTheDocument();
  expect(screen.getByText("Série confiável aguardando resultados")).toBeInTheDocument();
  expect(screen.getByText("MAE do legado — não validado")).toBeInTheDocument();
  expect(screen.queryByText("Acerto de diferenciais")).not.toBeInTheDocument();
  expect(screen.queryByText("Taxa de armadilha")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Compartilhar desempenho" })).not.toBeInTheDocument();
});
