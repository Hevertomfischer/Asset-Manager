import { useState, useEffect } from "react";
import { CheckCircle2, ClipboardList, Loader2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { usePaywall } from "@/context/PaywallContext";
import {
  useGetUserTeams,
  useCreateUserTeam,
  useRegisterRoundFromSuggestion,
} from "@workspace/api-client-react";

interface RegisterRoundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lineupSuggestionId: number;
  round: number;
}

export function RegisterRoundDialog({
  open,
  onOpenChange,
  lineupSuggestionId,
  round,
}: RegisterRoundDialogProps) {
  const { toast } = useToast();
  const { isPro } = useAuth();
  const { openPaywall } = usePaywall();

  const { data: teamsData, isLoading: teamsLoading } = useGetUserTeams();
  const createTeamMutation = useCreateUserTeam();
  const registerMutation = useRegisterRoundFromSuggestion();

  const teams = teamsData?.teams ?? [];

  // Pre-select the first (default) team when data loads
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");

  useEffect(() => {
    if (teams.length > 0 && !selectedTeamId) {
      setSelectedTeamId(String(teams[0]!.id));
    }
  }, [teams, selectedTeamId]);

  const isWorking =
    createTeamMutation.isPending || registerMutation.isPending;

  const handleRegister = async () => {
    try {
      let teamId: number;

      if (teams.length === 0) {
        // Auto-create "Time Principal"
        const result = await createTeamMutation.mutateAsync({ name: "Time Principal" });
        teamId = result.team.id;
      } else {
        teamId = Number(selectedTeamId);
        if (!teamId) return;
      }

      await registerMutation.mutateAsync({ teamId, lineupSuggestionId });

      toast({ title: "Time registrado!", description: `Rodada ${round} salva no seu time.` });
      onOpenChange(false);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 402) {
        onOpenChange(false);
        openPaywall();
        return;
      }
      toast({
        title: "Falha ao registrar",
        description: (err as Error)?.message || "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleSelectTeam = (value: string) => {
    if (value === "__new__") {
      // Free user hitting this path → paywall
      if (!isPro) {
        onOpenChange(false);
        openPaywall();
        return;
      }
      // Pro user: TODO — could open a create-team flow; for now no-op
      return;
    }
    setSelectedTeamId(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl border border-border/60 bg-card shadow-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="w-4 h-4 text-primary" />
            Foi esse o time que eu escalei
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Registre a escalação da rodada {round} no seu histórico pessoal.
          </DialogDescription>
        </DialogHeader>

        {teamsLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : teams.length === 0 ? (
          // No teams yet — show auto-create message
          <div className="py-2 space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20 text-sm">
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Criar "Time Principal"</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Seu primeiro time será criado automaticamente e esta rodada será registrada nele.
                </p>
              </div>
            </div>
            <Button
              className="w-full rounded-xl bg-gradient-to-r from-primary to-accent font-semibold"
              onClick={handleRegister}
              disabled={isWorking}
            >
              {isWorking ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Confirmar registro
            </Button>
          </div>
        ) : (
          // Has teams — show selector
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Registrar em
              </label>
              <Select value={selectedTeamId} onValueChange={handleSelectTeam}>
                <SelectTrigger className="rounded-xl border-border/60 bg-secondary h-10">
                  <SelectValue placeholder="Selecione um time" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      <span className="font-medium">{t.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t.roundCount} rodada{t.roundCount !== 1 ? "s" : ""}
                      </span>
                    </SelectItem>
                  ))}
                  {/* "Novo time" option — Pro-gated */}
                  <SelectItem value="__new__">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      {isPro ? (
                        <Plus className="w-3.5 h-3.5" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                      )}
                      {isPro ? "Novo time…" : "Novo time (Pro)"}
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full rounded-xl bg-gradient-to-r from-primary to-accent font-semibold"
              onClick={handleRegister}
              disabled={isWorking || !selectedTeamId}
            >
              {isWorking ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Registrar rodada {round}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
