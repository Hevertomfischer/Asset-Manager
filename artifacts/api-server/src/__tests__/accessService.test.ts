/**
 * Testes de accessService — verifica que:
 *   1. isPro() retorna true para qualquer usuário ANTES do FOUNDER_ACCESS_CUTOFF
 *      (Founder Access ativo), independente do plano real.
 *   2. isPro() consulta o plano real DEPOIS do cutoff (campanha encerrada).
 *   3. getUserPlan() não é afetado pela campanha — retorna sempre o plano real.
 *
 * Data de corte do fallback: 2026-09-30T23:59:59Z
 * (espelho da constante em accessService.ts — se mudar lá, atualizar aqui)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mocks de dependências externas ────────────────────────────────────────────
// Devem ser declarados ANTES do import do módulo testado (vi.mock é hoistado).

vi.mock("@workspace/db/schema", () => ({
  subscriptionsTable: {
    id: "id",
    userId: "userId",
    status: "status",
    plan: "plan",
    currentPeriodEnd: "currentPeriodEnd",
  },
}));

// Controla o retorno do DB a partir dos testes individuais.
// O mock retorna uma assinatura pro ativa quando mockActivePro=true, vazio caso contrário.
let mockActivePro = false;

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () =>
            mockActivePro ? [{ id: 1, plan: "pro" }] : [],
        }),
      }),
    }),
  },
}));

// drizzle-orm helpers são funções puras de construção de predicado;
// podem ser mantidos reais sem conectar a nada.
// Se causarem erro no ambiente de test, descomentar:
// vi.mock("drizzle-orm", () => ({ eq: () => ({}), and: () => ({}), gt: () => ({}) }));

// ── Import DEPOIS dos mocks ───────────────────────────────────────────────────

import { isPro, getUserPlan, FOUNDER_ACCESS_CUTOFF } from "../services/accessService";

// ── Datas de referência ───────────────────────────────────────────────────────

// Dois meses ANTES do cutoff (2026-09-30) → campanha ativa
const BEFORE_CUTOFF = new Date("2026-07-15T12:00:00Z");
// Um dia APÓS o cutoff → campanha encerrada
const AFTER_CUTOFF = new Date("2026-10-01T00:00:00Z");

// ── Setup / teardown de tempo ─────────────────────────────────────────────────

afterEach(() => {
  vi.useRealTimers();
  mockActivePro = false;
});

// ── Sanity check do cutoff ────────────────────────────────────────────────────

describe("FOUNDER_ACCESS_CUTOFF", () => {
  it("é uma Date válida", () => {
    expect(FOUNDER_ACCESS_CUTOFF).toBeInstanceOf(Date);
    expect(Number.isNaN(FOUNDER_ACCESS_CUTOFF.getTime())).toBe(false);
  });

  it("BEFORE_CUTOFF fixture é anterior ao cutoff", () => {
    expect(BEFORE_CUTOFF < FOUNDER_ACCESS_CUTOFF).toBe(true);
  });

  it("AFTER_CUTOFF fixture é posterior ao cutoff", () => {
    expect(AFTER_CUTOFF > FOUNDER_ACCESS_CUTOFF).toBe(true);
  });
});

// ── isPro: campanha ativa (before cutoff) ─────────────────────────────────────

describe("isPro — Founder Access ativo (before cutoff)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BEFORE_CUTOFF);
  });

  it("usuário free recebe isPro=true durante a campanha", async () => {
    mockActivePro = false; // plano real = free
    expect(await isPro(99)).toBe(true);
  });

  it("usuário pro recebe isPro=true durante a campanha", async () => {
    mockActivePro = true; // plano real = pro
    expect(await isPro(1)).toBe(true);
  });

  it("userId qualquer (novo usuário = 9999) recebe isPro=true", async () => {
    mockActivePro = false;
    expect(await isPro(9999)).toBe(true);
  });
});

// ── isPro: campanha encerrada (after cutoff) ──────────────────────────────────

describe("isPro — Founder Access encerrado (after cutoff)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(AFTER_CUTOFF);
  });

  it("usuário free recebe isPro=false após a campanha", async () => {
    mockActivePro = false; // DB retorna sem assinatura
    expect(await isPro(99)).toBe(false);
  });

  it("usuário pro recebe isPro=true após a campanha (plano real)", async () => {
    mockActivePro = true; // DB retorna assinatura ativa
    expect(await isPro(1)).toBe(true);
  });
});

// ── getUserPlan: inalterado pela campanha ─────────────────────────────────────

describe("getUserPlan — não afetado pela campanha", () => {
  it("retorna 'free' antes do cutoff quando sem assinatura", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BEFORE_CUTOFF);
    mockActivePro = false;
    expect(await getUserPlan(99)).toBe("free");
  });

  it("retorna 'free' após o cutoff quando sem assinatura", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(AFTER_CUTOFF);
    mockActivePro = false;
    expect(await getUserPlan(99)).toBe("free");
  });

  it("retorna 'pro' quando assinatura ativa existe (independente de data)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(BEFORE_CUTOFF);
    mockActivePro = true;
    expect(await getUserPlan(1)).toBe("pro");

    vi.setSystemTime(AFTER_CUTOFF);
    expect(await getUserPlan(1)).toBe("pro");
  });
});

// ── Teste de concordância: especificação do task ──────────────────────────────
// Replica exatamente o cenário descrito: "before cutoff, free user = isPro true;
// after cutoff, free user = isPro false".

describe("concordância com a especificação (cenário exato do task)", () => {
  it("usuário free: isPro=true antes, isPro=false depois", async () => {
    mockActivePro = false; // sempre free

    vi.useFakeTimers();

    vi.setSystemTime(BEFORE_CUTOFF);
    const beforeResult = await isPro(42);

    vi.setSystemTime(AFTER_CUTOFF);
    const afterResult = await isPro(42);

    expect(beforeResult).toBe(true);
    expect(afterResult).toBe(false);
  });
});
