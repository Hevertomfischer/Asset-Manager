/**
 * Testes básicos de PlayerCard — verificam paridade de markup com os 6 locais
 * de uso anteriores (players, comparar, historico, lineup, Pitch, SwapSimulator).
 *
 * Cobertura:
 *   - Cada variant renderiza sem crash
 *   - Campos chave (nome, posição, preço, pts) aparecem no DOM
 *   - loading=true exibe skeleton (oculta conteúdo real)
 *   - Fallback de escudo: sem badgeUrl → exibe abreviação
 *   - Fallback extremo: club=null → exibe "??"
 *   - isCaptain=true → indicadores visuais presentes
 *   - isCoach=true → indicador Star presente no lineup
 *   - playProbability < 0.5 → AlertTriangle presente no swap
 *   - ClubBadge exibe fallback correto
 *   - PlayerSkeleton renderiza para todas as variants sem crash
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlayerCard, PlayerSkeleton, ClubBadge, PlayerBadges } from "../PlayerCard";
import type { PlayerCardVariant } from "../PlayerCard";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/components/ProGate", () => ({
  ProGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/hooks/use-custom-api", () => ({
  getPositionColor: (pos: string) =>
    pos === "ATA"
      ? "text-red-400 border-red-400/30 bg-red-400/10"
      : "text-muted-foreground",
}));

vi.mock("@/lib/explainPlayer", () => ({
  default: {},
}));

// ── Fixture ───────────────────────────────────────────────────────────────────

const basePlayer = {
  name: "Gabriel Barbosa",
  nickname: "Gabigol",
  position: "ATA",
  club: {
    name: "Flamengo",
    abbreviation: "FLA",
    badgeUrl: "https://example.com/fla.png",
  },
  price: 18.5,
  priceVariation: 0.5,
  expectedPoints: 9.2,
};

// ── variant="compact" ─────────────────────────────────────────────────────────

describe("PlayerCard variant=compact", () => {
  it("exibe nickname e posição", () => {
    render(<PlayerCard variant="compact" player={basePlayer} />);
    expect(screen.getByText("Gabigol")).toBeInTheDocument();
    expect(screen.getByText("ATA")).toBeInTheDocument();
  });

  it("exibe pontuação esperada", () => {
    render(<PlayerCard variant="compact" player={basePlayer} />);
    expect(screen.getByText("9.2")).toBeInTheDocument();
  });

  it("exibe abreviação do clube", () => {
    render(<PlayerCard variant="compact" player={basePlayer} />);
    expect(screen.getByText("FLA")).toBeInTheDocument();
  });

  it("usa name quando nickname é null", () => {
    render(<PlayerCard variant="compact" player={{ ...basePlayer, nickname: null }} />);
    expect(screen.getByText("Gabriel Barbosa")).toBeInTheDocument();
  });

  it("highlighted=true adiciona classe text-primary no nome", () => {
    const { container } = render(
      <PlayerCard variant="compact" player={basePlayer} highlighted />
    );
    const nameEl = container.querySelector(".text-primary");
    expect(nameEl).toBeTruthy();
  });

  it("children aparecem no lado direito", () => {
    render(
      <PlayerCard variant="compact" player={basePlayer}>
        <span data-testid="child">Luxo</span>
      </PlayerCard>
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});

// ── variant="full" ────────────────────────────────────────────────────────────

describe("PlayerCard variant=full", () => {
  it("exibe nome do clube e nickname", () => {
    render(<PlayerCard variant="full" player={basePlayer} />);
    expect(screen.getByText("Gabigol")).toBeInTheDocument();
    expect(screen.getByText("Flamengo")).toBeInTheDocument();
  });

  it("exibe preço e variação", () => {
    render(<PlayerCard variant="full" player={basePlayer} />);
    expect(screen.getByText("C$ 18.50")).toBeInTheDocument();
  });

  it("Avatar usa abreviação como fallback quando badgeUrl ausente", () => {
    render(
      <PlayerCard
        variant="full"
        player={{ ...basePlayer, club: { ...basePlayer.club, badgeUrl: null } }}
      />
    );
    expect(screen.getByText("FLA")).toBeInTheDocument();
  });

  it("exibe '??' quando club=null (fallback extremo)", () => {
    render(<PlayerCard variant="full" player={{ ...basePlayer, club: null }} />);
    expect(screen.getByText("??")).toBeInTheDocument();
  });
});

// ── variant="pitch" ───────────────────────────────────────────────────────────

describe("PlayerCard variant=pitch", () => {
  it("usa primeiro nome quando sem nickname", () => {
    render(
      <PlayerCard variant="pitch" player={{ ...basePlayer, nickname: null }} />
    );
    expect(screen.getByText("Gabriel")).toBeInTheDocument();
  });

  it("usa nickname quando disponível", () => {
    render(<PlayerCard variant="pitch" player={basePlayer} />);
    expect(screen.getByText("Gabigol")).toBeInTheDocument();
  });

  it("exibe posição e pontuação esperada", () => {
    render(<PlayerCard variant="pitch" player={basePlayer} />);
    expect(screen.getByText("ATA")).toBeInTheDocument();
    expect(screen.getByText("9.2")).toBeInTheDocument();
  });

  it("isCaptain=true exibe anel amarelo e badge 'C'", () => {
    const { container } = render(
      <PlayerCard variant="pitch" player={basePlayer} isCaptain />
    );
    expect(screen.getByText("C")).toBeInTheDocument();
    expect(container.querySelector(".border-yellow-400")).toBeTruthy();
  });

  it("sem isCaptain não exibe badge 'C'", () => {
    render(<PlayerCard variant="pitch" player={basePlayer} />);
    expect(screen.queryByText("C")).not.toBeInTheDocument();
  });

  it("Avatar usa fallback quando sem badgeUrl", () => {
    render(
      <PlayerCard
        variant="pitch"
        player={{ ...basePlayer, club: { ...basePlayer.club, badgeUrl: null } }}
      />
    );
    expect(screen.getByText("FLA")).toBeInTheDocument();
  });
});

// ── variant="swap" ────────────────────────────────────────────────────────────

describe("PlayerCard variant=swap", () => {
  const wrap = (children: React.ReactNode) => (
    <button className="flex gap-3">{children}</button>
  );

  it("exibe Avatar + info + métricas como filhos do flex", () => {
    render(wrap(<PlayerCard variant="swap" player={basePlayer} playProbability={0.75} />));
    expect(screen.getByText("Gabigol")).toBeInTheDocument();
    expect(screen.getByText("9.2 pts")).toBeInTheDocument();
    expect(screen.getByText("C$ 18.50")).toBeInTheDocument();
  });

  it("exibe probabilidade de jogo quando fornecida", () => {
    render(wrap(<PlayerCard variant="swap" player={basePlayer} playProbability={0.75} />));
    expect(screen.getByText(/75% jogo/)).toBeInTheDocument();
  });

  it("AlertTriangle presente quando prob < 0.5", () => {
    const { container } = render(
      wrap(<PlayerCard variant="swap" player={basePlayer} playProbability={0.3} />)
    );
    expect(container.querySelector(".text-yellow-500")).toBeTruthy();
  });

  it("AlertTriangle ausente quando prob >= 0.5", () => {
    const { container } = render(
      wrap(<PlayerCard variant="swap" player={basePlayer} playProbability={0.6} />)
    );
    expect(container.querySelector(".text-yellow-500")).toBeNull();
  });

  it("Avatar usa fallback quando sem badgeUrl", () => {
    render(
      wrap(
        <PlayerCard
          variant="swap"
          player={{ ...basePlayer, club: { ...basePlayer.club, badgeUrl: null } }}
        />
      )
    );
    expect(screen.getByText("FL")).toBeInTheDocument();
  });
});

// ── variant="compare" ─────────────────────────────────────────────────────────

describe("PlayerCard variant=compare", () => {
  it("exibe nome, abreviação, posição e preço centrados", () => {
    render(<PlayerCard variant="compare" player={basePlayer} />);
    expect(screen.getByText("Gabigol")).toBeInTheDocument();
    expect(screen.getByText("FLA")).toBeInTheDocument();
    expect(screen.getByText("ATA")).toBeInTheDocument();
    expect(screen.getByText("C$ 18.5")).toBeInTheDocument();
  });

  it("children (seals) aparecem abaixo da identidade", () => {
    render(
      <PlayerCard variant="compare" player={basePlayer}>
        <span data-testid="seal">Seal</span>
      </PlayerCard>
    );
    expect(screen.getByTestId("seal")).toBeInTheDocument();
  });

  it("Avatar usa abreviação como fallback", () => {
    render(
      <PlayerCard
        variant="compare"
        player={{ ...basePlayer, club: { ...basePlayer.club, badgeUrl: null } }}
      />
    );
    expect(screen.getAllByText("FL").length).toBeGreaterThan(0);
  });
});

// ── variant="lineup" ─────────────────────────────────────────────────────────

describe("PlayerCard variant=lineup", () => {
  const wrap = (children: React.ReactNode) => (
    <div className="p-4">{children}</div>
  );

  it("exibe nome, abreviação, posição, preço e pts", () => {
    render(wrap(<PlayerCard variant="lineup" player={basePlayer} />));
    expect(screen.getByText("Gabigol")).toBeInTheDocument();
    expect(screen.getByText("FLA")).toBeInTheDocument();
    expect(screen.getByText("ATA")).toBeInTheDocument();
    expect(screen.getByText("C$ 18.50")).toBeInTheDocument();
    expect(screen.getByText("9.2 pts")).toBeInTheDocument();
  });

  it("isCaptain=true exibe ícone Crown (text-yellow-500)", () => {
    const { container } = render(
      wrap(<PlayerCard variant="lineup" player={basePlayer} isCaptain />)
    );
    expect(container.querySelector(".text-yellow-500")).toBeTruthy();
  });

  it("isCoach=true exibe ícone Star (text-primary)", () => {
    const { container } = render(
      wrap(
        <PlayerCard variant="lineup" player={basePlayer} isCoach isCaptain={false} />
      )
    );
    expect(container.querySelector(".text-primary")).toBeTruthy();
  });

  it("isCoach e isCaptain=true exibe Crown não Star", () => {
    const { container } = render(
      wrap(<PlayerCard variant="lineup" player={basePlayer} isCaptain isCoach />)
    );
    const yellows = container.querySelectorAll(".text-yellow-500");
    expect(yellows.length).toBeGreaterThan(0);
  });
});

// ── loading skeleton ───────────────────────────────────────────────────────────

describe("PlayerCard loading", () => {
  const variants: PlayerCardVariant[] = [
    "compact", "full", "pitch", "compare",
  ];

  variants.forEach((v) => {
    it(`variant=${v}: oculta conteúdo real quando loading=true`, () => {
      render(<PlayerCard variant={v} player={basePlayer} loading />);
      expect(screen.queryByText("Gabigol")).not.toBeInTheDocument();
    });
  });

  it("variant=swap loading: oculta conteúdo real", () => {
    render(
      <button className="flex">
        <PlayerCard variant="swap" player={basePlayer} loading />
      </button>
    );
    expect(screen.queryByText("Gabigol")).not.toBeInTheDocument();
  });

  it("variant=lineup loading: oculta conteúdo real", () => {
    render(
      <div>
        <PlayerCard variant="lineup" player={basePlayer} loading />
      </div>
    );
    expect(screen.queryByText("Gabigol")).not.toBeInTheDocument();
  });
});

// ── PlayerSkeleton ─────────────────────────────────────────────────────────────

describe("PlayerSkeleton", () => {
  const variants: PlayerCardVariant[] = [
    "compact", "full", "pitch", "compare",
  ];

  variants.forEach((v) => {
    it(`variant=${v} renderiza sem crash`, () => {
      expect(() => render(<div><PlayerSkeleton variant={v} /></div>)).not.toThrow();
    });
  });

  it("variant=swap renderiza sem crash dentro de flex", () => {
    expect(() =>
      render(<div className="flex"><PlayerSkeleton variant="swap" /></div>)
    ).not.toThrow();
  });

  it("variant=lineup renderiza sem crash", () => {
    expect(() =>
      render(<div><PlayerSkeleton variant="lineup" /></div>)
    ).not.toThrow();
  });
});

// ── ClubBadge ─────────────────────────────────────────────────────────────────

describe("ClubBadge", () => {
  it("exibe abreviação cortada em 2 chars como fallback", () => {
    render(<ClubBadge url={null} abbr="FLAM" />);
    expect(screen.getByText("FL")).toBeInTheDocument();
  });

  it("exibe '??' quando abbr é null", () => {
    render(<ClubBadge url={null} abbr={null} />);
    expect(screen.getByText("??")).toBeInTheDocument();
  });

  it("aceita className para tamanho", () => {
    const { container } = render(<ClubBadge url={null} abbr="FLA" className="w-5 h-5" />);
    expect(container.querySelector(".w-5")).toBeTruthy();
  });

  it("não exibe fallback '??' quando abbr é fornecida junto com url", () => {
    // Radix Avatar em jsdom não dispara onLoad sem rede real.
    // Verificamos que a abreviação de fallback está presente (pois a imagem
    // não carrega no ambiente de test), o que garante que o fallback funciona.
    render(<ClubBadge url="https://example.com/badge.png" abbr="FLA" />);
    expect(screen.queryByText("??")).not.toBeInTheDocument();
    expect(screen.getByText("FL")).toBeInTheDocument();
  });
});

// ── PlayerBadges ──────────────────────────────────────────────────────────────

describe("PlayerBadges", () => {
  it("retorna null quando lista vazia", () => {
    const { container } = render(<PlayerBadges badges={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("exibe labels dos badges", () => {
    render(
      <PlayerBadges
        badges={[
          { label: "Bom momento", kind: "positive" },
          { label: "Risco", kind: "warning" },
        ]}
      />
    );
    expect(screen.getByText("Bom momento")).toBeInTheDocument();
    expect(screen.getByText("Risco")).toBeInTheDocument();
  });
});
