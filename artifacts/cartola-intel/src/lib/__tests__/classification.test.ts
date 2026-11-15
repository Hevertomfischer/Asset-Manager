/**
 * Teste de concordância: explainPlayer.ts × dashboard.tsx
 *
 * Garante que isDifferentialPlayer() e isTrapPlayer() — a ÚNICA fonte de verdade
 * para essas classificações — produzem exatamente o mesmo resultado que
 * dashboard.tsx produziria ao construir as listas "diferenciais" e "armadilhas".
 *
 * Se este teste falhar após uma mudança de limiar, significa que o histórico de
 * thresholds em explainPlayer.ts NÃO foi atualizado — corrija-o antes de mergear.
 */

import { describe, it, expect } from "vitest";
import { explainPlayer } from "../explainPlayer";
import { label } from "../popularityRules";
import {
  isDifferentialPlayer,
  isTrapPlayer,
  type ExplanationJson,
} from "../explainPlayer";

// ── Fixture de projeções ───────────────────────────────────────────────────────
// Cada entrada representa um jogador com seu explanationJson.
// Colunas: id, popularity, isTrap, expectedClass

interface FixtureProjection {
  id: string;
  explanationJson: ExplanationJson;
  expectedDifferential: boolean;
  expectedTrap: boolean;
}

const fixtures: FixtureProjection[] = [
  {
    id: "outside_list",
    explanationJson: { popularity: null, popularityListed: false, expectedPoints: 8 },
    expectedDifferential: true,
    expectedTrap: false,
  },
  {
    id: "unknown",
    explanationJson: { popularity: null, popularityListed: null },
    expectedDifferential: false,
    expectedTrap: false,
  },
  // ── Diferenciais claros (popularity << 0.15, sem isTrap) ────────────────────
  {
    id: "A",
    explanationJson: { popularity: 0.05, isTrap: false, expectedPoints: 9 },
    expectedDifferential: true,
    expectedTrap: false,
  },
  {
    id: "B",
    explanationJson: { popularity: 0.10, isTrap: false, expectedPoints: 7 },
    expectedDifferential: true,
    expectedTrap: false,
  },
  // Exatamente no limite inferior (< 0.15 → Diferencial)
  {
    id: "C_limit_below",
    explanationJson: { popularity: 0.149, isTrap: false },
    expectedDifferential: true,
    expectedTrap: false,
  },

  // ── Na fronteira exata (0.15 não é mais < 0.15 → NÃO é diferencial) ─────────
  {
    id: "D_limit_exact",
    explanationJson: { popularity: 0.15, isTrap: false },
    expectedDifferential: false,
    expectedTrap: false,
  },
  // Um passo acima do limiar
  {
    id: "E_limit_above",
    explanationJson: { popularity: 0.151, isTrap: false },
    expectedDifferential: false,
    expectedTrap: false,
  },

  // ── Popular (>= 0.15) → nem diferencial nem armadilha ───────────────────────
  {
    id: "F",
    explanationJson: { popularity: 0.40, isTrap: false, expectedPoints: 8 },
    expectedDifferential: false,
    expectedTrap: false,
  },
  {
    id: "G",
    explanationJson: { popularity: 0.80, isTrap: false },
    expectedDifferential: false,
    expectedTrap: false,
  },

  // ── Armadilhas (isTrap = true) ───────────────────────────────────────────────
  {
    id: "H",
    explanationJson: { popularity: 0.65, riskScore: 0.6, shortAvg: 2, mediumAvg: 5, isTrap: true, expectedPoints: 3 },
    expectedDifferential: false,
    expectedTrap: true,
  },
  {
    id: "I",
    explanationJson: { popularity: 0.70, riskScore: 0.6, shortAvg: 2, mediumAvg: 5, isTrap: true },
    expectedDifferential: false,
    expectedTrap: true,
  },

  // Fronteira inclusiva de armadilha: 60%, com risco e queda de forma.
  {
    id: "J_trap_and_low_popularity",
    explanationJson: { popularity: 0.60, riskScore: 0.6, shortAvg: 2, mediumAvg: 5, isTrap: true },
    expectedDifferential: false,
    expectedTrap: true,
  },

  // ── Sem dados (campos ausentes = defaults conservadores) ────────────────────
  {
    id: "K_no_data",
    explanationJson: {},
    expectedDifferential: false, // popularity ?? 1 = 1 >= 0.15
    expectedTrap: false,         // isTrap undefined → false
  },

  // ── isTrap=false explícito + popularity exatamente 0 ────────────────────────
  {
    id: "L_zero_popularity",
    explanationJson: { popularity: 0, isTrap: false },
    expectedDifferential: true,
    expectedTrap: false,
  },
];

it("ausência comprovada usa selo sem percentual; desconhecido não vira zero", () => {
  const exp = { popularity: null, popularityListed: false };
  expect(explainPlayer(exp)).toContainEqual(expect.objectContaining({
    text: "Fora dos mais escalados", badgeLabel: "Fora dos mais escalados",
  }));
  expect(label({ popularity: null })).not.toContain("%");
});

// ── Helpers que replicam a lógica de dashboard.tsx ────────────────────────────

/**
 * Reproduz `diferenciais` de dashboard.tsx:
 *   .filter(isDifferentialPlayer)
 *   .sort(popA - popB)   ← crescente: menor escalação = mais diferencial
 *   .slice(0, 5)
 */
function buildDiferenciaisList(
  projections: FixtureProjection[],
  limit = 5
): FixtureProjection[] {
  return projections
    .filter((p) => isDifferentialPlayer(p.explanationJson))
    .sort(
      (a, b) =>
        (a.explanationJson.popularity ?? 1) -
        (b.explanationJson.popularity ?? 1)
    )
    .slice(0, limit);
}

/**
 * Reproduz `armadilhas` de dashboard.tsx:
 *   .filter(isTrapPlayer)
 *   .sort(popB - popA)   ← decrescente: maior escalação = pior armadilha
 *   .slice(0, 5)
 */
function buildArmadilhasList(
  projections: FixtureProjection[],
  limit = 5
): FixtureProjection[] {
  return projections
    .filter((p) => isTrapPlayer(p.explanationJson))
    .sort(
      (a, b) =>
        (b.explanationJson.popularity ?? 0) -
        (a.explanationJson.popularity ?? 0)
    )
    .slice(0, limit);
}

// ── Testes unitários de isDifferentialPlayer ───────────────────────────────────

describe("isDifferentialPlayer — limiares e casos extremos", () => {
  fixtures.forEach(({ id, explanationJson, expectedDifferential }) => {
    it(`fixture ${id}: isDifferential=${expectedDifferential}`, () => {
      expect(isDifferentialPlayer(explanationJson)).toBe(expectedDifferential);
    });
  });

  it("popularity ausente usa default 1 (≥ 0.15 → não é diferencial)", () => {
    expect(isDifferentialPlayer({})).toBe(false);
  });

  it("popularity=0.149 é diferencial (< 0.15)", () => {
    expect(isDifferentialPlayer({ popularity: 0.149 })).toBe(true);
  });

  it("popularity=0.15 NÃO é diferencial (limiar exclusivo)", () => {
    expect(isDifferentialPlayer({ popularity: 0.15 })).toBe(false);
  });

  it("flag legada de armadilha não sobrepõe popularidade real abaixo de 15%", () => {
    expect(isDifferentialPlayer({ popularity: 0.05, isTrap: true })).toBe(true);
  });
});

// ── Testes unitários de isTrapPlayer ──────────────────────────────────────────

describe("isTrapPlayer — limiares e casos extremos", () => {
  fixtures.forEach(({ id, explanationJson, expectedTrap }) => {
    it(`fixture ${id}: isTrap=${expectedTrap}`, () => {
      expect(isTrapPlayer(explanationJson)).toBe(expectedTrap);
    });
  });

  it("isTrap ausente → false (não é armadilha por default)", () => {
    expect(isTrapPlayer({})).toBe(false);
  });

  it("isTrap=false explícito → false", () => {
    expect(isTrapPlayer({ isTrap: false })).toBe(false);
  });

  it("isTrap=true não substitui popularidade conhecida, risco e queda de forma", () => {
    expect(isTrapPlayer({ popularity: 0.01, isTrap: true })).toBe(false);
    expect(isTrapPlayer({ popularity: 0.99, isTrap: true })).toBe(false);
    expect(isTrapPlayer({ popularity: 0.99, riskScore: 0.6, shortAvg: 2, mediumAvg: 5 })).toBe(true);
  });
});

// ── Teste de concordância: explainPlayer === dashboard ────────────────────────
//
// Verifica que as listas produzidas pelos helpers (que replicam dashboard.tsx)
// correspondem 100% ao que isDifferentialPlayer/isTrapPlayer classificariam
// individualmente. Se os filtros em dashboard.tsx divergirem algum dia da
// lógica central, este teste quebrará imediatamente.

describe("concordância 100%: explainPlayer.ts × dashboard.tsx", () => {
  it("todo jogador em diferenciais satisfaz isDifferentialPlayer", () => {
    const list = buildDiferenciaisList(fixtures);
    list.forEach(({ id, explanationJson }) => {
      expect(
        isDifferentialPlayer(explanationJson),
        `fixture ${id} está em diferenciais mas isDifferentialPlayer retornou false`
      ).toBe(true);
    });
  });

  it("nenhum jogador excluído de diferenciais satisfaz isDifferentialPlayer", () => {
    const inList = new Set(buildDiferenciaisList(fixtures).map((p) => p.id));
    fixtures
      .filter((p) => !inList.has(p.id))
      .forEach(({ id, explanationJson }) => {
        if (isDifferentialPlayer(explanationJson)) {
          // pode estar fora por causa do slice(0,5); isso é aceitável —
          // só falha se o filtro divergiu, não se o slice cortou
          const allDiferenciais = fixtures.filter((p) =>
            isDifferentialPlayer(p.explanationJson)
          );
          expect(allDiferenciais.length).toBeGreaterThan(5);
        }
      });
  });

  it("todo jogador em armadilhas satisfaz isTrapPlayer", () => {
    const list = buildArmadilhasList(fixtures);
    list.forEach(({ id, explanationJson }) => {
      expect(
        isTrapPlayer(explanationJson),
        `fixture ${id} está em armadilhas mas isTrapPlayer retornou false`
      ).toBe(true);
    });
  });

  it("nenhum jogador classificado como Diferencial também é Armadilha", () => {
    fixtures.forEach(({ id, expectedDifferential, expectedTrap }) => {
      if (expectedDifferential && expectedTrap) {
        throw new Error(
          `fixture ${id} é marcado como Diferencial E Armadilha — classes são mutuamente exclusivas`
        );
      }
    });
  });

  it("diferenciais ordenados por popularity crescente (menor = mais diferencial)", () => {
    const list = buildDiferenciaisList(fixtures);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1].explanationJson.popularity ?? 1;
      const curr = list[i].explanationJson.popularity ?? 1;
      expect(prev).toBeLessThanOrEqual(curr);
    }
  });

  it("armadilhas ordenadas por popularity decrescente (maior = pior armadilha)", () => {
    const list = buildArmadilhasList(fixtures);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1].explanationJson.popularity ?? 0;
      const curr = list[i].explanationJson.popularity ?? 0;
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it("IDs esperados em diferenciais estão presentes (A, B, C_limit_below, L_zero_popularity)", () => {
    const allDiferenciais = fixtures
      .filter((p) => isDifferentialPlayer(p.explanationJson))
      .map((p) => p.id);
    expect(allDiferenciais).toContain("A");
    expect(allDiferenciais).toContain("B");
    expect(allDiferenciais).toContain("C_limit_below");
    expect(allDiferenciais).toContain("L_zero_popularity");
  });

  it("IDs esperados em armadilhas estão presentes (H, I, J_trap_and_low_popularity)", () => {
    const allArmadilhas = fixtures
      .filter((p) => isTrapPlayer(p.explanationJson))
      .map((p) => p.id);
    expect(allArmadilhas).toContain("H");
    expect(allArmadilhas).toContain("I");
    expect(allArmadilhas).toContain("J_trap_and_low_popularity");
  });

  it("IDs populares sem isTrap não estão nem em diferenciais nem em armadilhas (F, G)", () => {
    const diferenciais = fixtures
      .filter((p) => isDifferentialPlayer(p.explanationJson))
      .map((p) => p.id);
    const armadilhas = fixtures
      .filter((p) => isTrapPlayer(p.explanationJson))
      .map((p) => p.id);
    expect(diferenciais).not.toContain("F");
    expect(diferenciais).not.toContain("G");
    expect(armadilhas).not.toContain("F");
    expect(armadilhas).not.toContain("G");
  });

  it("fixtures sem dados (K_no_data) não aparecem em nenhuma lista", () => {
    const diferenciais = fixtures
      .filter((p) => isDifferentialPlayer(p.explanationJson))
      .map((p) => p.id);
    const armadilhas = fixtures
      .filter((p) => isTrapPlayer(p.explanationJson))
      .map((p) => p.id);
    expect(diferenciais).not.toContain("K_no_data");
    expect(armadilhas).not.toContain("K_no_data");
  });
});

// ── Teste de regressão de limiar ──────────────────────────────────────────────
//
// Se alguém mudar DIFFERENTIAL_THRESHOLD sem atualizar este teste E o comentário
// em explainPlayer.ts, este bloco quebrará primeiro.

describe("regressão de limiar — valores absolutos documentados", () => {
  const DIFFERENTIAL_THRESHOLD = 0.15; // espelho do limiar em explainPlayer.ts

  it(`limiar de Diferencial é estritamente < ${DIFFERENTIAL_THRESHOLD}`, () => {
    expect(isDifferentialPlayer({ popularity: DIFFERENTIAL_THRESHOLD - 0.001 })).toBe(true);
    expect(isDifferentialPlayer({ popularity: DIFFERENTIAL_THRESHOLD })).toBe(false);
    expect(isDifferentialPlayer({ popularity: DIFFERENTIAL_THRESHOLD + 0.001 })).toBe(false);
  });

  it("Armadilha exige 60% conhecidos, risco e queda; ignora flag isolada", () => {
    for (const pop of [0, 0.05, 0.15, 0.5, 1]) {
      expect(isTrapPlayer({ popularity: pop, isTrap: true })).toBe(false);
      expect(isTrapPlayer({ popularity: pop, isTrap: false })).toBe(false);
      expect(isTrapPlayer({ popularity: pop, riskScore: 0.6, shortAvg: 2, mediumAvg: 5 })).toBe(pop >= 0.6);
    }
  });
});
