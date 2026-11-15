/** Risco é um score normalizado; volatilidade em pontos não é percentual. */
export function getRiskDisplay(score: number | null | undefined) {
  if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 1) {
    return null;
  }
  const percent = score * 100;
  return {
    percent,
    label: percent < 30 ? "Baixo" : percent < 60 ? "Médio" : "Alto",
    color: percent < 30 ? "bg-positive" : percent < 60 ? "bg-attention" : "bg-danger",
  };
}
