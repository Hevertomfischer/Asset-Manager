import { useEffect, useRef } from "react";
import { useSyncFull } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

const AUTO_SYNC_KEY = "cartola_intel_last_auto_sync";
const AUTO_SYNC_INTERVAL_MS = 60 * 60 * 1000;

export function AutoSync() {
  const { toast } = useToast();
  const syncFull = useSyncFull();
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    const lastSync = localStorage.getItem(AUTO_SYNC_KEY);
    const now = Date.now();
    const elapsed = lastSync ? now - Number(lastSync) : Infinity;

    if (elapsed < AUTO_SYNC_INTERVAL_MS) return;

    const { id } = toast({
      title: "Sincronizando dados...",
      description: "Atualizando jogadores, projeções e mercado em segundo plano.",
    });

    syncFull.mutate(undefined, {
      onSuccess: () => {
        localStorage.setItem(AUTO_SYNC_KEY, String(Date.now()));
        toast({
          id,
          title: "Dados atualizados",
          description: "Pipeline sincronizado com sucesso.",
        });
      },
      onError: () => {
        toast({
          id,
          title: "Falha na sincronização",
          description: "Não foi possível sincronizar. Tente pelo Admin.",
          variant: "destructive",
        });
      },
    });
  }, []);

  return null;
}
