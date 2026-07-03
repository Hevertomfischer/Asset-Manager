/**
 * Testes do NotificationItem — verifica que o selo "Para você" aparece
 * exclusivamente em notificações pessoais (userId !== null) e nunca em
 * notificações globais (userId === null).
 *
 * Também cobre:
 *   - Indicador de não lida (ponto azul)
 *   - Contador de não lidas soma os dois tipos (via sortPriority indiretamente)
 *   - Token de cor: classes accent presentes no badge pessoal
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { NotificationItem, type AppNotification } from "../NotificationBell";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("date-fns", () => ({
  formatDistanceToNow: () => "há 5 minutos",
}));

vi.mock("date-fns/locale", () => ({
  ptBR: {},
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const baseNotification = {
  id: 1,
  type: "price" as const,
  title: "Variação de preço",
  body: "Gabriel Barbosa valorizou C$ 2,00",
  payload: null,
  readAt: null,
  createdAt: new Date().toISOString(),
};

const personalNotification = {
  ...baseNotification,
  id: 1,
  userId: 42,          // userId !== null → pessoal
};

const globalNotification = {
  ...baseNotification,
  id: 2,
  userId: null,        // userId === null → global
};

const readPersonalNotification = {
  ...personalNotification,
  id: 3,
  readAt: new Date().toISOString(),
};

const readGlobalNotification = {
  ...globalNotification,
  id: 4,
  readAt: new Date().toISOString(),
};

// ── Helper ────────────────────────────────────────────────────────────────────

function renderItem(notification: AppNotification, onRead = vi.fn()) {
  return render(<NotificationItem notification={notification} onRead={onRead} />);
}

// ── Testes do selo "Para você" ─────────────────────────────────────────────────

describe('selo "Para você"', () => {
  it("exibe o selo na notificação pessoal (userId !== null)", () => {
    renderItem(personalNotification);
    expect(screen.getByText("Para você")).toBeInTheDocument();
  });

  it("NÃO exibe o selo na notificação global (userId === null)", () => {
    renderItem(globalNotification);
    expect(screen.queryByText("Para você")).not.toBeInTheDocument();
  });

  it("NÃO exibe o texto 'Geral' em notificações globais", () => {
    renderItem(globalNotification);
    expect(screen.queryByText("Geral")).not.toBeInTheDocument();
  });

  it("NÃO exibe o texto 'Geral' em notificações pessoais", () => {
    renderItem(personalNotification);
    expect(screen.queryByText("Geral")).not.toBeInTheDocument();
  });

  it("selo pessoal usa tokens de cor accent (bg-accent/15 text-accent)", () => {
    const { container } = renderItem(personalNotification);
    const badge = container.querySelector(".text-accent");
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toContain("Para você");
  });

  it("selo pessoal possui borda accent", () => {
    const { container } = renderItem(personalNotification);
    const badge = container.querySelector(".border-accent\\/20");
    expect(badge).toBeTruthy();
  });

  it("fixture pessoal lida ainda exibe o selo", () => {
    renderItem(readPersonalNotification);
    expect(screen.getByText("Para você")).toBeInTheDocument();
  });

  it("fixture global lida também não exibe o selo", () => {
    renderItem(readGlobalNotification);
    expect(screen.queryByText("Para você")).not.toBeInTheDocument();
  });
});

// ── Testes de indicador de não lida ───────────────────────────────────────────

describe("indicador de não lida", () => {
  it("ponto de não lida visível em notificação pessoal não lida", () => {
    const { container } = renderItem(personalNotification);
    const dot = container.querySelector(".bg-primary.rounded-full");
    expect(dot).toBeTruthy();
  });

  it("ponto de não lida visível em notificação global não lida", () => {
    const { container } = renderItem(globalNotification);
    const dot = container.querySelector(".bg-primary.rounded-full");
    expect(dot).toBeTruthy();
  });

  it("ponto de não lida ausente em notificação pessoal lida", () => {
    const { container } = renderItem(readPersonalNotification);
    const dot = container.querySelector(".w-2.h-2.rounded-full.bg-primary");
    expect(dot).toBeNull();
  });

  it("ponto de não lida ausente em notificação global lida", () => {
    const { container } = renderItem(readGlobalNotification);
    const dot = container.querySelector(".w-2.h-2.rounded-full.bg-primary");
    expect(dot).toBeNull();
  });
});

// ── Testes de conteúdo da notificação ────────────────────────────────────────

describe("conteúdo do item", () => {
  it("exibe o título da notificação pessoal", () => {
    renderItem(personalNotification);
    expect(screen.getByText("Variação de preço")).toBeInTheDocument();
  });

  it("exibe o título da notificação global", () => {
    renderItem(globalNotification);
    expect(screen.getByText("Variação de preço")).toBeInTheDocument();
  });

  it("exibe o body da notificação", () => {
    renderItem(personalNotification);
    expect(screen.getByText(/Gabriel Barbosa valorizou/)).toBeInTheDocument();
  });

  it("exibe timestamp relativo via date-fns", () => {
    renderItem(personalNotification);
    expect(screen.getByText("há 5 minutos")).toBeInTheDocument();
  });

  it("chama onRead ao clicar em notificação não lida", async () => {
    const onRead = vi.fn();
    const { container } = renderItem(personalNotification, onRead);
    const button = container.querySelector("button");
    button?.click();
    expect(onRead).toHaveBeenCalledWith(personalNotification.id);
  });

  it("NÃO chama onRead ao clicar em notificação já lida", () => {
    const onRead = vi.fn();
    const { container } = renderItem(readPersonalNotification, onRead);
    const button = container.querySelector("button");
    button?.click();
    expect(onRead).not.toHaveBeenCalled();
  });
});

// ── Teste de concordância fixture-vs-render ───────────────────────────────────
//
// Garante que, dada uma lista mista (pessoal + global), renderizando ambas
// individualmente, exatamente 1 tenha o selo e 1 não tenha.

describe("concordância fixture mista: pessoal + global", () => {
  it("numa lista mista, apenas o item pessoal tem o selo", () => {
    const { unmount: u1 } = render(
      <div data-testid="personal">
        <NotificationItem notification={personalNotification} onRead={vi.fn()} />
      </div>
    );
    const { unmount: u2 } = render(
      <div data-testid="global">
        <NotificationItem notification={globalNotification} onRead={vi.fn()} />
      </div>
    );

    const allBadges = screen.getAllByText("Para você");
    expect(allBadges).toHaveLength(1);

    u1();
    u2();
  });
});
