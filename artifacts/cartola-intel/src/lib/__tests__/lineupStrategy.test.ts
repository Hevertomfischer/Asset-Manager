import { expect, it } from "vitest";
import { resolveInitialStrategy } from "../lineupStrategy";

it("Free não herda o antigo default Pro", () => {
  expect(resolveInitialStrategy(null, "cost-benefit", false)).toBe("safe");
  expect(resolveInitialStrategy(null, "safe", false)).toBe("safe");
  expect(resolveInitialStrategy("aggressive", "safe", false)).toBe("safe");
});
it("Pro usa a preferência e a URL tem precedência", () => {
  expect(resolveInitialStrategy(null, "cost-benefit", true)).toBe("cost-benefit");
  expect(resolveInitialStrategy("aggressive", "cost-benefit", true)).toBe("aggressive");
});
it("ausência ou valor desconhecido usa safe", () => {
  expect(resolveInitialStrategy(null, undefined, true)).toBe("safe");
  expect(resolveInitialStrategy("invalid", "invalid", false)).toBe("safe");
});
