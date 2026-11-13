import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@workspace/db", () => ({ db: {} }));
vi.mock("mercadopago", () => ({
  default: class {},
  Preference: class { create = mocks.create; },
}));
import { createCheckout } from "../services/billing/mercadopagoProvider";
import { resolvePlanConfig } from "../services/billing/planConfig";
import { FOUNDER_ACCESS_CUTOFF } from "../services/accessService";
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("Mercado Pago recebe ano e preços configurados, com desconto founder", async () => {
  vi.stubEnv("MP_ACCESS_TOKEN", "unit-test-not-a-credential");
  vi.useFakeTimers();
  vi.setSystemTime(new Date(FOUNDER_ACCESS_CUTOFF.getTime() - 1000));
  mocks.create.mockResolvedValue({ init_point: "https://checkout.example.test/" });
  const config = resolvePlanConfig({ seasonPassYear: 2027, seasonPassPrice: 129.9, founderSeasonPassPrice: 79.9, proMonthlyPrice: 29.9 });
  await createCheckout(42, "season_pass", config);
  expect(mocks.create.mock.lastCall?.[0].body.items[0]).toMatchObject({
    title: "Mitometro Pro - Season Pass 2027", unit_price: 79.9, currency_id: "BRL",
  });
  expect(mocks.create.mock.lastCall?.[0].body.metadata.billing_config).toEqual(config);
  vi.setSystemTime(FOUNDER_ACCESS_CUTOFF);
  await createCheckout(42, "season_pass", config);
  expect(mocks.create.mock.lastCall?.[0].body.items[0].unit_price).toBe(129.9);
  await createCheckout(42, "pro_monthly", config);
  expect(mocks.create.mock.lastCall?.[0].body.items[0].unit_price).toBe(29.9);
});
