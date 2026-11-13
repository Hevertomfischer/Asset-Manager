import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@workspace/db", () => ({ db: { select: vi.fn() } }));
import { calculatePeriodEnd, ExpiredSeasonError } from "../services/billing/periodEnd";
import { defaultSeasonEnd, planConfigPatchSchema, resolvePlanConfig, seasonPrice } from "../services/billing/planConfig";
import { FOUNDER_ACCESS_CUTOFF } from "../services/accessService";

afterEach(() => vi.useRealTimers());

describe("configuração e validade de cobranças avulsas", () => {
  it("passe comprado em 10/12/2026 vale até o fim de 2027 em São Paulo", () => {
    const now = new Date("2026-12-10T12:00:00Z");
    const config = resolvePlanConfig({}, now);
    expect(config.seasonPassYear).toBe(2027);
    expect(calculatePeriodEnd("season_pass", config, null, now).toISOString())
      .toBe("2028-01-01T02:59:00.000Z");
  });
  it("mensal em 13/11/2026 começa após o Founder Access e dura 30 dias", () => {
    const now = new Date("2026-11-13T12:00:00Z");
    const end = calculatePeriodEnd("pro_monthly", resolvePlanConfig({}, now), null, now);
    expect(end.getTime()).toBe(FOUNDER_ACCESS_CUTOFF.getTime() + 30 * 86_400_000);
  });
  it("renovações mensais acumulam 30 dias sem perder o saldo anterior", () => {
    const now = new Date(FOUNDER_ACCESS_CUTOFF.getTime() + 86_400_000);
    const config = resolvePlanConfig({}, now);
    const first = calculatePeriodEnd("pro_monthly", config, null, now);
    const renewal = calculatePeriodEnd("pro_monthly", config, first, now);
    expect(renewal.getTime()).toBe(first.getTime() + 30 * 86_400_000);
  });
  it("season pass nunca reduz uma assinatura mais longa", () => {
    const now = new Date("2026-12-10T12:00:00Z");
    const existing = new Date("2029-01-01T12:00:00Z");
    expect(calculatePeriodEnd("season_pass", resolvePlanConfig({}, now), existing, now)).toEqual(existing);
  });
  it("mensal não começa a partir de uma assinatura vencida", () => {
    const now = new Date(FOUNDER_ACCESS_CUTOFF.getTime() + 10 * 86_400_000);
    expect(calculatePeriodEnd("pro_monthly", resolvePlanConfig({}, now),
      new Date(now.getTime() - 86_400_000), now).getTime()).toBe(now.getTime() + 30 * 86_400_000);
  });
  it("recusa passe encerrado mesmo quando já existe acesso mais longo", () => {
    const now = new Date("2028-05-01T12:00:00Z");
    const config = resolvePlanConfig({ seasonPassYear: 2026 }, now);
    expect(() => calculatePeriodEnd("season_pass", config, new Date("2030-01-01"), now))
      .toThrow(ExpiredSeasonError);
  });
  it("ano padrão muda somente em novembro no fuso de São Paulo", () => {
    expect(resolvePlanConfig({}, new Date("2026-11-01T02:59:59Z")).seasonPassYear).toBe(2026);
    expect(resolvePlanConfig({}, new Date("2026-11-01T03:00:00Z")).seasonPassYear).toBe(2027);
    expect(resolvePlanConfig({}, new Date("2027-02-01T12:00:00Z")).seasonPassYear).toBe(2027);
    expect(defaultSeasonEnd(2027)).toBe("2028-01-01T02:59:00.000Z");
  });
  it("desconto founder só se aplica estritamente antes do corte", () => {
    const config = resolvePlanConfig({ seasonPassPrice: 129.9, founderSeasonPassPrice: 79.9 });
    expect(seasonPrice(config, new Date(FOUNDER_ACCESS_CUTOFF.getTime() - 1))).toBe(79.9);
    expect(seasonPrice(config, FOUNDER_ACCESS_CUTOFF)).toBe(129.9);
    expect(seasonPrice(config, new Date(FOUNDER_ACCESS_CUTOFF.getTime() + 1))).toBe(129.9);
  });
  it.each([
    { proMonthlyPrice: -1 }, { seasonPassPrice: 0 }, { proMonthlyPrice: 19.999 },
    { seasonPassYear: 2026.5 }, { seasonPassEndsAt: "ontem" }, { unknown: 2 },
    { founderSeasonPassPrice: "79.90" },
  ])("validação Zod recusa configuração inválida: %j", (patch) => {
    expect(planConfigPatchSchema.safeParse(patch).success).toBe(false);
  });
  it("aceita limpar desconto e alterar apenas um preço", () => {
    expect(planConfigPatchSchema.parse({ founderSeasonPassPrice: null })).toEqual({ founderSeasonPassPrice: null });
    expect(planConfigPatchSchema.parse({ proMonthlyPrice: 29.9 })).toEqual({ proMonthlyPrice: 29.9 });
  });
});
