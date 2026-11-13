import { Activity } from "lucide-react";

export function PopularityCalibrationCard() {
  return (
    <div role="status" className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-2">
      <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
        <Activity className="h-5 w-5 text-primary" /> Em calibração
      </h3>
      <p className="text-sm text-muted-foreground">
        Diferenciais, armadilhas e Antimassa aguardam dados confiáveis de popularidade:
        pelo menos 20 jogadores em uma coleta bem-sucedida nas últimas 24 horas.
      </p>
    </div>
  );
}
