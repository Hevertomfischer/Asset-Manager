import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PopularityCalibrationCard } from "../PopularityCalibrationCard";
import { PlayerBadges } from "../PlayerCard";
import { explainPlayer } from "@/lib/explainPlayer";

const state = vi.hoisted(() => ({ enabled: false }));
vi.mock("@/hooks/usePopularityFeatures", () => ({ usePopularityFeatures: () => ({ enabled: state.enabled }) }));
vi.mock("@/components/ProGate", () => ({ ProGate: ({ children }: { children: React.ReactNode }) => children }));
afterEach(() => { cleanup(); state.enabled = false; });

describe("popularidade em calibração", () => {
  it("explica os critérios sem mostrar jogadores ou percentuais", () => {
    render(<PopularityCalibrationCard />);
    expect(screen.getByRole("status").textContent).toContain("Em calibração");
    expect(screen.getByRole("status").textContent).toContain("20 jogadores");
    expect(screen.getByRole("status").textContent).not.toContain("%");
  });
  it("explainPlayer não produz selos de popularidade quando desligada", () => {
    for (const exp of [
      { popularity: 0.05 },
      { popularity: null, popularityListed: false },
      { popularity: 0.9, riskScore: 0.8, shortAvg: 1, mediumAvg: 5 },
    ]) {
      const insights = explainPlayer({ ...exp, popularityFeaturesEnabled: false });
      expect(insights.some((insight) => insight.kind === "differential" || insight.badgeLabel === "Armadilha")).toBe(false);
    }
  });
  it("oculta badges antigos em cache assim que a chave desliga", () => {
    const badges = [
      { label: "Diferencial", kind: "differential" as const },
      { label: "Armadilha", kind: "danger" as const },
      { label: "Bom confronto", kind: "positive" as const },
    ];
    state.enabled = true;
    const view = render(<PlayerBadges badges={badges} />);
    expect(screen.getByText("Diferencial")).toBeTruthy();
    state.enabled = false;
    view.rerender(<PlayerBadges badges={badges} />);
    expect(screen.queryByText("Diferencial")).toBeNull();
    expect(screen.queryByText("Armadilha")).toBeNull();
    expect(screen.getByText("Bom confronto")).toBeTruthy();
  });
});
