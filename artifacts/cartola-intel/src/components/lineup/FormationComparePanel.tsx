import { useEffect, useMemo, useRef, useState } from "react";
import {
  useCompareFormations,
  type FormationComparison,
  type LineupGenerateRequestStrategy,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Loader2, GitCompareArrows, Check, AlertTriangle } from "lucide-react";

interface Props {
  budget: number;
  strategy: string;
  round: number | undefined;
  lockedPlayerIds: number[];
  excludedPlayerIds: number[];
  authKey: string;
  disabled: boolean;
  selectedFormation: string;
  onSelectFormation: (formation: string) => void;
  onPaywall: () => void;
}

const fmt = (n: number | null | undefined, d = 1) => (n == null ? "-" : n.toFixed(d));

function errorMessage(error: unknown) {
  const e = error as { data?: { error?: string }; message?: string };
  return e?.data?.error ?? e?.message ?? "Não foi possível comparar as formações.";
}

export function FormationComparePanel(p: Props) {
  const mutation = useCompareFormations();
  const mutateAsyncRef = useRef(mutation.mutateAsync);
  mutateAsyncRef.current = mutation.mutateAsync;
  const paywallRef = useRef(p.onPaywall);
  paywallRef.current = p.onPaywall;

  const key = useMemo(
    () => JSON.stringify([p.budget, p.strategy, p.round ?? null, [...p.lockedPlayerIds].sort(), [...p.excludedPlayerIds].sort(), p.authKey]),
    [p.budget, p.strategy, p.round, p.lockedPlayerIds, p.excludedPlayerIds, p.authKey],
  );

  const epochRef = useRef(0);
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ key: string; data: FormationComparison } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);

  useEffect(() => {
    epochRef.current += 1;
    pendingRef.current = false;
    setPending(false);
    setResult(null);
    setError(null);
    return () => { epochRef.current += 1; };
  }, [key]);

  const run = async () => {
    if (pendingRef.current || p.disabled) return;
    const epoch = epochRef.current;
    const reqKey = key;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const data = await mutateAsyncRef.current({
        data: {
          budget: p.budget,
          strategy: p.strategy as LineupGenerateRequestStrategy,
          round: p.round,
          lockedPlayerIds: p.lockedPlayerIds.length ? p.lockedPlayerIds : undefined,
          excludedPlayerIds: p.excludedPlayerIds.length ? p.excludedPlayerIds : undefined,
        },
      });
      if (epoch !== epochRef.current) return;
      setResult({ key: reqKey, data });
    } catch (err) {
      if (epoch !== epochRef.current) return;
      if ((err as { status?: number }).status === 402) {
        paywallRef.current();
      } else {
        setError({ key: reqKey, message: errorMessage(err) });
      }
    } finally {
      if (epoch === epochRef.current) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  };

  const visible = result && result.key === key ? result.data : null;
  const visibleError = error && error.key === key ? error.message : null;

  const ranked = useMemo(() => {
    if (!visible) return [];
    return [...visible.results].sort((a, b) => {
      if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
      return (b.expectedPoints ?? -Infinity) - (a.expectedPoints ?? -Infinity);
    });
  }, [visible]);

  const anyFeasible = ranked.some((r) => r.feasible);
  const bests = ranked.filter((r) => r.feasible && (r.differenceFromBest === 0 || r.formation === visible?.bestFormation));
  const isBest = (f: string, diff: number | null) => diff === 0 || (diff == null && f === visible?.bestFormation);

  return (
    <div className="space-y-2" data-testid="panel-compare-formations">
      <Button
        type="button"
        variant="outline"
        className="w-full h-9 rounded-xl text-sm font-semibold"
        onClick={run}
        disabled={pending || p.disabled}
        data-testid="button-compare-formations"
      >
        {pending ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Comparando...</>
        ) : (
          <><GitCompareArrows className="w-4 h-4 mr-2" /> Comparar formações</>
        )}
      </Button>

      <div aria-live="polite">
        {pending && (
          <div className="space-y-1.5" role="status" aria-label="Comparando formações">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-9 rounded-lg bg-secondary/50 motion-safe:animate-pulse" />
            ))}
          </div>
        )}

        {!pending && visibleError && (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs space-y-2" data-testid="error-compare-formations">
            <p className="text-foreground">{visibleError}</p>
            <button type="button" onClick={run} className="font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Tentar novamente
            </button>
          </div>
        )}

        {!pending && visible && (
          <div className="rounded-xl border border-border/60 bg-background/60 p-2.5 space-y-2" data-testid="results-compare-formations">
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Rodada {visible.round}</span>
              {p.round != null && p.round !== visible.round && " (rodada efetiva retornada pelo servidor)"}
              {" · "}C$ {visible.budget.toFixed(2)}
            </div>

            {!anyFeasible ? (
              <div className="flex gap-2 rounded-lg border border-attention/30 bg-attention/10 p-2.5 text-xs" data-testid="text-compare-all-infeasible">
                <AlertTriangle className="w-4 h-4 text-attention shrink-0" />
                <p>Nenhuma formação é viável com estes parâmetros. Aumente o orçamento, remova travas ou exclusões, ou mude a estratégia e compare de novo.</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground" data-testid="text-compare-best">
                {bests.length > 1 ? "Empate no topo: " : "Melhor: "}
                <span className="font-semibold text-primary">{bests.map((b) => b.formation).join(", ")}</span>
                . Pontos esperados já incluem o capitão.
              </p>
            )}

            <ol className="space-y-1.5">
              {ranked.map((r, i) => {
                const best = r.feasible && isBest(r.formation, r.differenceFromBest);
                const selected = r.formation === p.selectedFormation;
                return (
                  <li key={r.formation}>
                    <button
                      type="button"
                      disabled={!r.feasible}
                      aria-pressed={selected}
                      onClick={() => p.onSelectFormation(r.formation)}
                      data-testid={`button-select-formation-${r.formation}`}
                      className={`w-full text-left rounded-lg border px-2.5 py-2 motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default ${
                        selected ? "border-primary bg-primary/10" : r.feasible ? "border-border bg-card hover:border-muted-foreground/50" : "border-border/40 bg-card/40 opacity-80"
                      }`}
                    >
                       <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground w-4 tabular-nums">{r.feasible ? i + 1 : ""}</span>
                        <span className="font-mono font-bold text-sm">{r.formation}</span>
                        {best && <span className="text-xs font-semibold text-primary">Melhor</span>}
                        {selected && <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"><Check className="w-3 h-3" />Selecionada</span>}
                        <span className="ml-auto font-mono font-bold text-sm tabular-nums text-primary">
                           {r.feasible ? `${fmt(r.expectedPoints, 2)} pts` : "Inviável"}
                        </span>
                      </div>
                      {r.feasible ? (
                        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular-nums pl-6">
                          <span>Custo C$ {fmt(r.totalCost, 2)}</span>
                           <span>Saldo C$ {fmt(r.balance, 2)}</span>
                           <span>{r.differenceFromBest === 0 || r.differenceFromBest == null ? "Diferença 0,00 pts" : `Diferença -${Math.abs(r.differenceFromBest).toFixed(2)} pts`}</span>
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground pl-6">{r.reason ?? "Sem motivo informado."}</p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="text-xs text-muted-foreground">
              Sugestões para a estratégia selecionada, não o máximo global garantido. Escolher uma formação apenas a seleciona; a escalação atual não muda. Comparar não consome cota nem salva.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
