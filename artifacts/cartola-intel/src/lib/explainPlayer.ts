/**
 * explainPlayer — traduz o explanationJson de uma projeção em frases curtas em português.
 *
 * Limiares (thresholds):
 *  - Em alta:         shortAvg >= 1.2 × mediumAvg  E  shortAvg > 2 pts
 *  - Queda de forma:  shortAvg <  0.7 × mediumAvg  E  mediumAvg > 2 pts
 *  - Conf. favorável: matchupScore >= 1.10  (time ou condição adversária fraca)
 *  - Conf. difícil:   matchupScore <= 0.93  (adversário forte)
 *  - Joga em casa:    isHome = true  (só se confronto for neutro)
 *  - Saldo possível:  cleanSheetProbability > 0.50 para GOL/ZAG/LAT
 *  - Custo-benefício: valueScore > 0.70 (pts esperados / preço)
 *  - Diferencial:     popularity < 0.15 (menos de 15% de escalação) — PRO-ONLY
 *  - Armadilha:       isTrap = true (popular + queda de forma)        — PRO-ONLY
 *  - Valorizando:     priceVariation > 1.50 C$
 *  - Desvalorizando:  priceVariation < -1.00 C$
 *  - Boa forma:       formScore > 3.0 (fallback quando sem outros insights)
 */

export interface ExplanationJson {
  averagePoints?: number;
  formScore?: number;
  shortAvg?: number;
  mediumAvg?: number;
  longAvg?: number;
  volatility?: number;
  formTrend?: number;
  matchupScore?: number;
  playProbability?: number;
  cleanSheetProbability?: number;
  attackParticipationProbability?: number;
  isHome?: boolean;
  recentRoundsAnalyzed?: number;
  position?: string;
  price?: number;
  popularity?: number;
  valueScore?: number;
  differentialScore?: number;
  isTrap?: boolean;
  isHighVolatility?: boolean;
  isLowVolatility?: boolean;
  priceVariation?: number;
  gamesPlayed?: number;
  lowConfidence?: boolean;
  missingGames?: number;
}

export type InsightKind = "positive" | "warning" | "neutral" | "info";

export interface Insight {
  text: string;
  kind: InsightKind;
  /** Rótulo curto para exibir como badge/chip. Se ausente, o insight não vira badge. */
  badgeLabel?: string;
  /** Se true, o badge fica atrás de ProGate para usuários free. */
  requiresPro?: boolean;
}

export interface Options {
  isCaptain?: boolean;
}

/**
 * True se o jogador qualifica como diferencial — popularidade abaixo do limiar
 * documentado (< 15%) e não é classificado como armadilha.
 */
export function isDifferentialPlayer(exp: ExplanationJson): boolean {
  return (exp.popularity ?? 1) < 0.15 && !exp.isTrap;
}

/**
 * True se o jogador qualifica como armadilha (popular + queda de forma).
 */
export function isTrapPlayer(exp: ExplanationJson): boolean {
  return exp.isTrap === true;
}

export function explainPlayer(exp: ExplanationJson, { isCaptain = false }: Options = {}): Insight[] {
  const insights: Insight[] = [];

  // --- Capitão (sem badgeLabel — não vira chip de badge) -------
  if (isCaptain) {
    insights.push({ text: "Maior piso entre os titulares — capitão recomendado", kind: "positive" });
  }

  // --- Armadilha (popular + queda de forma) — PRO-ONLY ---------
  if (isTrapPlayer(exp)) {
    insights.push({
      text: "Popular mas com queda de forma — risco de armadilha",
      kind: "warning",
      badgeLabel: "Armadilha",
      requiresPro: true,
    });
  }

  // --- Baixa confiança na projeção ------------------------------
  if (exp.lowConfidence) {
    insights.push({
      text: `Poucos jogos registrados (${exp.gamesPlayed ?? 0}) — projeção incerta`,
      kind: "warning",
    });
  }

  // --- Forma recente (shortAvg vs mediumAvg) --------------------
  const shortAvg = exp.shortAvg ?? 0;
  const mediumAvg = exp.mediumAvg ?? 0;
  if (shortAvg > 0 && mediumAvg > 0 && !exp.isTrap) {
    if (shortAvg >= mediumAvg * 1.2 && shortAvg > 2) {
      // Threshold: ≥ 20% acima da média e mínimo de 2 pts para relevância
      insights.push({
        text: `Em alta: ${shortAvg.toFixed(1)} pts nas últimas rodadas`,
        kind: "positive",
        badgeLabel: "Em alta",
      });
    } else if (shortAvg < mediumAvg * 0.7 && mediumAvg > 2) {
      // Threshold: ≥ 30% abaixo da média — queda expressiva
      insights.push({
        text: `Queda de forma (${shortAvg.toFixed(1)} vs ${mediumAvg.toFixed(1)} na média)`,
        kind: "warning",
        badgeLabel: "Queda de forma",
      });
    }
  }

  // --- Confronto ------------------------------------------------
  if (exp.matchupScore != null) {
    const loc = exp.isHome ? "em casa" : "fora";
    if (exp.matchupScore >= 1.10) {
      // ≥ 10% acima do índice neutro (1.0) — confronto visivelmente favorável
      insights.push({
        text: `Confronto favorável (${loc}, índice ${exp.matchupScore.toFixed(2)})`,
        kind: "positive",
        badgeLabel: "Confronto favorável",
      });
    } else if (exp.matchupScore <= 0.93) {
      // ≤ 7% abaixo de neutro — adversário forte
      insights.push({
        text: `Confronto difícil (${loc}, índice ${exp.matchupScore.toFixed(2)})`,
        kind: "warning",
        badgeLabel: "Confronto difícil",
      });
    } else if (exp.isHome) {
      // Confronto neutro mas joga em casa — vantagem leve
      insights.push({
        text: "Joga em casa",
        kind: "neutral",
        badgeLabel: "Em casa",
      });
    }
  }

  // --- Probabilidade de saldo de gol (defensores/goleiros) ------
  const position = exp.position ?? "";
  if (["GOL", "ZAG", "LAT"].includes(position) && (exp.cleanSheetProbability ?? 0) > 0.5) {
    // Threshold: > 50% de chance de clean sheet
    insights.push({
      text: `Alta prob. de saldo de gol (${Math.round((exp.cleanSheetProbability ?? 0) * 100)}%)`,
      kind: "positive",
      badgeLabel: "Saldo possível",
    });
  }

  // --- Custo-benefício -----------------------------------------
  if ((exp.valueScore ?? 0) > 0.7 && !isCaptain) {
    // Threshold: > 0.7 pts/C$ — boa relação pontos por cruzeiro
    insights.push({
      text: `Bom custo-benefício (${(exp.valueScore ?? 0).toFixed(2)} pts/C$)`,
      kind: "positive",
    });
  }

  // --- Diferencial (baixa escalação) — PRO-ONLY ----------------
  if (isDifferentialPlayer(exp)) {
    // Threshold: < 15% de escalação geral — jogador diferencial
    insights.push({
      text: `Diferencial: ${Math.round((exp.popularity ?? 0) * 100)}% de escalação`,
      kind: "info",
      badgeLabel: "Diferencial",
      requiresPro: true,
    });
  }

  // --- Valorização/desvalorização de preço --------------------
  if ((exp.priceVariation ?? 0) > 1.5) {
    // Threshold: ganhou mais de C$ 1,50 na rodada anterior
    insights.push({
      text: `Valorizando: +C$ ${(exp.priceVariation ?? 0).toFixed(2)} na última rodada`,
      kind: "positive",
      badgeLabel: "Valorizando",
    });
  } else if ((exp.priceVariation ?? 0) < -1.0) {
    // Threshold: perdeu mais de C$ 1,00 na rodada anterior
    insights.push({
      text: `Desvalorizando: C$ ${(exp.priceVariation ?? 0).toFixed(2)} na última rodada`,
      kind: "warning",
    });
  }

  // --- Fallback: forma estável ---------------------------------
  const hasSignificantInsight = insights.some(i => !i.text.includes("capitão"));
  if (!hasSignificantInsight && (exp.formScore ?? 0) > 3) {
    insights.push({
      text: `Forma estável: ${(exp.formScore ?? 0).toFixed(1)} pts na média`,
      kind: "neutral",
      badgeLabel: "Boa forma",
    });
  }

  return insights;
}

/**
 * Retorna até 2 badges/chips principais para exibição compacta no card.
 * As badges "Diferencial" e "Armadilha" têm requiresPro = true.
 */
export function getTopBadges(
  exp: ExplanationJson,
  options?: Options
): { label: string; kind: InsightKind; requiresPro?: boolean }[] {
  return explainPlayer(exp, options)
    .filter(i => Boolean(i.badgeLabel))
    .slice(0, 2)
    .map(i => ({ label: i.badgeLabel!, kind: i.kind, requiresPro: i.requiresPro }));
}

/** Normaliza matchupScore (range ~0.7–1.3) para 0–100% centrado em 1.0. */
export function normalizeMatchup(score: number): number {
  return Math.min(100, Math.max(0, ((score - 0.7) / 0.6) * 100));
}
