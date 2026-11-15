import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerExplanationSheet } from "../PlayerExplanationSheet";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ isPro: true, isLoading: false }),
}));
vi.mock("@/hooks/usePopularityFeatures", () => ({
  usePopularityFeatures: () => ({ enabled: false }),
}));
vi.mock("@/context/PaywallContext", () => ({
  usePaywall: () => ({ openPaywall: vi.fn() }),
}));
vi.mock("@/hooks/useTrack", () => ({
  useTrack: () => vi.fn(),
}));

afterEach(cleanup);

function openAnalysis(riskScore?: number | null) {
  render(
    <PlayerExplanationSheet
      playerName="Jogador de teste"
      position="ATA"
      exp={{ riskScore, volatility: 6.01 }}
    />,
  );
  fireEvent.click(screen.getByTitle("Ver análise completa"));
  return within(screen.getByRole("dialog"));
}

describe("Risco na análise do jogador", () => {
  it.each([
    [0.15, "Baixo", "15%", "bg-positive"],
    [0.45, "Médio", "45%", "bg-attention"],
    [0.80, "Alto", "80%", "bg-danger"],
    [0, "Baixo", "0%", "bg-positive"],
    [0.30, "Médio", "30%", "bg-attention"],
    [0.60, "Alto", "60%", "bg-danger"],
    [1, "Alto", "100%", "bg-danger"],
  ] as const)("riskScore %s mostra %s, independentemente da volatilidade", (score, label, width, color) => {
    const dialog = openAnalysis(score);
    const row = dialog.getByText("Risco").closest(".space-y-1")!;
    expect(within(row as HTMLElement).getByText(label)).toBeInTheDocument();
    const fill = row.querySelector(".h-2 > div");
    expect(fill).toHaveStyle({ width });
    expect(fill).toHaveClass(color);
  });

  it.each([undefined, null, NaN, Infinity, -0.1, 1.1])(
    "não mostra barra de risco para score ausente ou inválido (%s)",
    (score) => {
      const dialog = openAnalysis(score);
      expect(dialog.queryByText("Risco")).not.toBeInTheDocument();
      expect(dialog.queryByText("Alto")).not.toBeInTheDocument();
      expect(dialog.getByText("Forma")).toBeInTheDocument();
      expect(dialog.getByText("Confronto")).toBeInTheDocument();
    },
  );
});
