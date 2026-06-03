/**
 * swapValidation — valida e simula uma troca de jogador na escalação.
 *
 * Regras (mesmas constantes do optimizer, sem duplicar lógica):
 *  - Posição: inId deve ter a mesma posição de outId.
 *  - Orçamento: custo total após troca ≤ budget.
 *  - Limite por clube: nenhum clube pode ter > LINEUP_CONFIG.maxPlayersPerClub jogadores.
 *
 * differential = contagem de jogadores com popularity < 0.15
 * (mesma definição usada em explainPlayer.ts do frontend).
 */

import { LINEUP_CONFIG } from "../config/projectionWeights";

/** Threshold de popularidade para considerar um jogador "diferencial". */
const DIFFERENTIAL_THRESHOLD = 0.15;

/** Arredonda para 2 casas decimais. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlayerSnapshot {
  playerId: number;
  position: string;
  clubId: number | null;
  price: number;
  expectedPoints: number;
  riskScore: number;
  /** Percentual de escalação (0–1). null quando não disponível. */
  popularity: number | null;
}

export interface LineupMetrics {
  /** Soma de pontos esperados; capitão conta em dobro. */
  expectedPoints: number;
  /** Média do riskScore dos jogadores de campo (exclui TEC). */
  totalRisk: number;
  /** Soma dos preços da escalação. */
  costUsed: number;
  /** Número de jogadores com popularity < 15% (diferenciais). */
  differential: number;
}

export interface MetricsDelta {
  expectedPoints: number;
  totalRisk: number;
  cost: number;
}

export interface SwapComparison {
  before: LineupMetrics;
  after: LineupMetrics;
  delta: MetricsDelta;
  valid: boolean;
  reason: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Calcula as métricas de uma escalação.
 * Exportada para testes unitários e outros consumers.
 */
export function computeLineupMetrics(
  players: PlayerSnapshot[],
  captainId: number | null
): LineupMetrics {
  const fieldPlayers = players.filter((p) => p.position !== "TEC");
  let expectedPoints = 0;
  let totalRisk = 0;
  let costUsed = 0;
  let differential = 0;

  for (const p of players) {
    const mult = p.playerId === captainId ? 2 : 1;
    expectedPoints += (p.expectedPoints ?? 0) * mult;
    costUsed += p.price;
    if ((p.popularity ?? 1) < DIFFERENTIAL_THRESHOLD) differential++;
  }

  for (const p of fieldPlayers) {
    totalRisk += p.riskScore;
  }

  return {
    expectedPoints: r2(expectedPoints),
    totalRisk: r2(fieldPlayers.length > 0 ? totalRisk / fieldPlayers.length : 0),
    costUsed: r2(costUsed),
    differential,
  };
}

/** Retorna um SwapComparison inválido com métricas `after` zeradas. */
function makeInvalid(before: LineupMetrics, reason: string): SwapComparison {
  const zero: LineupMetrics = { expectedPoints: 0, totalRisk: 0, costUsed: 0, differential: 0 };
  return {
    before,
    after: zero,
    delta: { expectedPoints: 0, totalRisk: 0, cost: 0 },
    valid: false,
    reason,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface ValidateSwapArgs {
  lineup: PlayerSnapshot[];
  captainId: number | null;
  outId: number;
  inPlayer: PlayerSnapshot;
  /** Orçamento total da escalação (padrão: LINEUP_CONFIG.defaultBudget). */
  budget: number;
}

/**
 * Valida a troca e retorna a comparação de métricas antes/depois.
 * Nunca lança exceção — encapsula erros em `valid: false, reason: "<motivo>"`.
 */
export function validateAndSimulate({
  lineup,
  captainId,
  outId,
  inPlayer,
  budget,
}: ValidateSwapArgs): SwapComparison {
  const before = computeLineupMetrics(lineup, captainId);

  // ── Regra 1: outId deve estar na escalação ────────────────────────
  const outPlayer = lineup.find((p) => p.playerId === outId);
  if (!outPlayer) {
    return makeInvalid(
      before,
      `Jogador ${outId} não está na escalação atual.`
    );
  }

  // ── Regra 2: inId não pode já estar na escalação ──────────────────
  if (lineup.some((p) => p.playerId === inPlayer.playerId)) {
    return makeInvalid(
      before,
      `Jogador ${inPlayer.playerId} já está na escalação.`
    );
  }

  // ── Regra 3: mesma posição ────────────────────────────────────────
  if (outPlayer.position !== inPlayer.position) {
    return makeInvalid(
      before,
      `Posição incompatível: ${outPlayer.position} (saindo) ≠ ${inPlayer.position} (entrando). ` +
        `A troca deve ser entre jogadores da mesma posição.`
    );
  }

  // Aplica a troca provisoriamente
  const afterLineup = lineup.map((p) => (p.playerId === outId ? inPlayer : p));

  // ── Regra 4: orçamento ────────────────────────────────────────────
  const afterCost = afterLineup.reduce((s, p) => s + p.price, 0);
  if (r2(afterCost) > budget) {
    const excess = r2(afterCost - budget);
    return makeInvalid(
      before,
      `Orçamento excedido: escalação ficaria C$ ${r2(afterCost).toFixed(2)} ` +
        `(limite C$ ${budget.toFixed(2)}). Excesso de C$ ${excess.toFixed(2)}.`
    );
  }

  // ── Regra 5: limite de jogadores por clube ────────────────────────
  const clubCountAfter = new Map<number, number>();
  for (const p of afterLineup) {
    if (p.clubId != null) {
      clubCountAfter.set(p.clubId, (clubCountAfter.get(p.clubId) ?? 0) + 1);
    }
  }
  for (const [clubId, count] of clubCountAfter) {
    if (count > LINEUP_CONFIG.maxPlayersPerClub) {
      return makeInvalid(
        before,
        `Limite de jogadores por clube excedido: clube ${clubId} teria ${count} jogadores ` +
          `(máximo permitido: ${LINEUP_CONFIG.maxPlayersPerClub}).`
      );
    }
  }

  // ── Troca válida: calcula métricas finais ─────────────────────────
  const after = computeLineupMetrics(afterLineup, captainId);
  const delta: MetricsDelta = {
    expectedPoints: r2(after.expectedPoints - before.expectedPoints),
    totalRisk: r2(after.totalRisk - before.totalRisk),
    cost: r2(after.costUsed - before.costUsed),
  };

  return { before, after, delta, valid: true, reason: null };
}
