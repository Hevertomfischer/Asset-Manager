import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Shield, Scale, Zap, BarChart2, Brain, Lightbulb, Loader2, ArrowRight, Check } from "lucide-react";

type Strategy = "safe" | "cost-benefit" | "aggressive";

const STEP1_CARDS = [
  {
    icon: BarChart2,
    title: "Projetamos",
    desc: "Calculamos os pontos esperados de cada atleta com base em forma, confronto e histórico recente.",
  },
  {
    icon: Brain,
    title: "Montamos o time ideal",
    desc: "Combinamos os melhores jogadores dentro do seu orçamento para maximizar sua pontuação.",
  },
  {
    icon: Lightbulb,
    title: "Mostramos o porquê",
    desc: "Cada escolha vem com explicações claras: piso, teto, risco e probabilidade de jogo.",
  },
];

const STRATEGY_OPTIONS: {
  value: Strategy;
  label: string;
  sublabel: string;
  desc: string;
  icon: typeof Shield;
  color: string;
}[] = [
  {
    value: "safe",
    label: "Mais seguro",
    sublabel: "Alto Piso",
    desc: "Seleciona jogadores consistentes para minimizar o risco de pontuação baixa.",
    icon: Shield,
    color: "text-blue-400",
  },
  {
    value: "cost-benefit",
    label: "Equilibrado",
    sublabel: "Custo-Benefício",
    desc: "Prioriza a melhor relação pontos por cruzeiro investido.",
    icon: Scale,
    color: "text-primary",
  },
  {
    value: "aggressive",
    label: "Mais agressivo",
    sublabel: "Alto Teto",
    desc: "Maximiza o potencial de pontos aceitando mais volatilidade.",
    icon: Zap,
    color: "text-amber-400",
  },
];

async function patchPreferences(body: { defaultStrategy?: string; onboardingCompleted?: boolean }) {
  await fetch("/api/users/me/preferences", {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

interface Props {
  onClose: () => void;
}

export function OnboardingDialog({ onClose }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<Strategy | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSkip() {
    try {
      await patchPreferences({ onboardingCompleted: true });
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    } catch {
    }
    onClose();
  }

  async function handleFinish() {
    if (!selected) return;
    setIsSubmitting(true);
    try {
      await patchPreferences({ defaultStrategy: selected, onboardingCompleted: true });
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      onClose();
      navigate(`/escalacao?strategy=${selected}&autoGenerate=true`);
    } catch {
      onClose();
      navigate("/escalacao");
    }
  }

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        className="w-[calc(100vw-2rem)] max-w-lg rounded-2xl p-0 overflow-hidden border-border/60 shadow-2xl"
      >
        <div className="p-6 pb-0 flex items-center justify-between">
          <div className="flex gap-1.5">
            {[1, 2].map((s) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  s === step ? "w-8 bg-primary" : s < step ? "w-4 bg-primary/40" : "w-4 bg-border"
                }`}
              />
            ))}
          </div>
          <button
            onClick={handleSkip}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
          >
            Pular
          </button>
        </div>

        {step === 1 && (
          <div className="p-6 space-y-5">
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-1">
                Bem-vindo ao Cartola Intel
              </p>
              <h2 className="text-xl font-bold leading-snug">
                Inteligência para escalar melhor
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Veja como funcionamos em 3 passos simples.
              </p>
            </div>

            <div className="space-y-3">
              {STEP1_CARDS.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="flex gap-3.5 p-3.5 rounded-xl bg-secondary/40 border border-border/40"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <Button className="w-full font-semibold" onClick={() => setStep(2)}>
              Próximo
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="p-6 space-y-5">
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-1">
                Personalização
              </p>
              <h2 className="text-xl font-bold leading-snug">Como você joga?</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Escolha seu estilo padrão — você pode mudar a qualquer rodada.
              </p>
            </div>

            <div className="space-y-3">
              {STRATEGY_OPTIONS.map(({ value, label, sublabel, desc, icon: Icon, color }) => {
                const isSelected = selected === value;
                return (
                  <button
                    key={value}
                    onClick={() => setSelected(value)}
                    className={`w-full text-left p-4 rounded-xl border transition-all duration-150 ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-sm shadow-primary/10"
                        : "border-border/50 bg-secondary/30 hover:border-border hover:bg-secondary/60"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          isSelected ? "bg-primary/20" : "bg-secondary"
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isSelected ? "text-primary" : color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{label}</span>
                          <span className="text-[10px] font-medium text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                            {sublabel}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3 text-primary-foreground" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <Button
              className="w-full font-semibold"
              disabled={!selected || isSubmitting}
              onClick={() => void handleFinish()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Gerando escalação…
                </>
              ) : (
                <>
                  Gerar minha escalação
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
