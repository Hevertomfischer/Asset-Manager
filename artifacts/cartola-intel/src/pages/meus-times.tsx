import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trophy, Plus, Calendar, TrendingUp, Loader2, ChevronRight, Sparkles, ClipboardList, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { usePaywall } from "@/context/PaywallContext";
import { useGetUserTeams, useCreateUserTeam } from "@workspace/api-client-react";

// ── Create team dialog ────────────────────────────────────────────────────────

function CreateTeamDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [name, setName] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();
  const createMutation = useCreateUserTeam();

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      const result = await createMutation.mutateAsync({ name: name.trim() });
      toast({ title: "Time criado!", description: result.team.name });
      onOpenChange(false);
      setName("");
      navigate(`/meus-times/${result.team.id}`);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 402) {
        onOpenChange(false);
        return;
      }
      toast({ title: "Erro ao criar time", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl border border-border/60 bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Trophy className="w-4 h-4 text-primary" />
            Novo Time
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Dê um nome ao seu time para acompanhar o desempenho ao longo da temporada.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="team-name" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Nome do time
            </Label>
            <Input
              id="team-name"
              placeholder="Ex: Time do Coração"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="rounded-xl border-border/60 bg-secondary"
              autoFocus
            />
          </div>
          <Button
            className="w-full rounded-xl bg-gradient-to-r from-primary to-accent font-semibold"
            onClick={handleCreate}
            disabled={createMutation.isPending || !name.trim()}
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            Criar Time
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Team card ─────────────────────────────────────────────────────────────────

function TeamCard({ team }: { team: { id: number; name: string; createdAt: string; roundCount: number; seasonPoints: number } }) {
  return (
    <Link to={`/meus-times/${team.id}`}>
      <Card className="group hover:border-primary/40 hover:bg-card/80 transition-all cursor-pointer border-border/50">
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Trophy className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                  {team.name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {team.roundCount} rodada{team.roundCount !== 1 ? "s" : ""} registrada{team.roundCount !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right hidden sm:block">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pontos na temp.</p>
                <p className="text-xl font-bold font-mono text-primary">
                  {team.seasonPoints.toFixed(1)}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </div>
          {/* mobile points */}
          <div className="flex items-center gap-2 mt-3 sm:hidden">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            <span className="text-sm font-mono font-bold text-primary">{team.seasonPoints.toFixed(1)} pts</span>
            <span className="text-xs text-muted-foreground">na temporada</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MeusTimes() {
  const [createOpen, setCreateOpen] = useState(false);
  const { user, isLoading: authLoading } = useAuth();
  const { openPaywall } = usePaywall();
  const { isPro } = useAuth();
  const { data, isLoading } = useGetUserTeams();
  const teams = data?.teams ?? [];

  const handleNewTeam = () => {
    if (!isPro && teams.length >= 1) {
      openPaywall();
      return;
    }
    setCreateOpen(true);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Meus Times</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-12">
            Acompanhe o desempenho do seu time rodada a rodada.
          </p>
        </div>
        {user && (
          <Button
            onClick={handleNewTeam}
            className="rounded-xl bg-gradient-to-r from-primary to-accent font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all self-start sm:self-auto"
          >
            {!isPro && teams.length >= 1 ? (
              <Sparkles className="w-4 h-4 mr-2" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            Novo Time
          </Button>
        )}
      </div>

      {/* Content */}
      {authLoading || isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : !user ? (
        // Not logged in
        <Card className="border-dashed border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Trophy className="w-8 h-8 text-primary opacity-60" />
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">Faça login para ver seus times</p>
              <p className="text-sm text-muted-foreground mt-1">Entre com sua conta para registrar e acompanhar seus times.</p>
            </div>
          </CardContent>
        </Card>
      ) : teams.length === 0 ? (
        // Empty state
        <Card className="border-dashed border-border/50 hover:border-primary/30 transition-colors">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-5">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <ClipboardList className="w-10 h-10 text-primary opacity-50" />
            </div>
            <div className="space-y-1.5">
              <p className="text-lg font-semibold text-foreground">Nenhum time registrado ainda</p>
              <p className="text-sm text-muted-foreground max-w-sm">
                Registre seu time desta rodada e descubra se você bateu o modelo.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mt-1">
              <Link to="/escalacao">
                <Button className="rounded-xl bg-gradient-to-r from-primary to-accent font-semibold">
                  <Shield className="w-4 h-4 mr-2" />
                  Gerar Escalação
                </Button>
              </Link>
              <Button variant="outline" className="rounded-xl" onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Time Manualmente
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        // Teams list
        <div className="space-y-3">
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} />
          ))}
          {/* Free tier notice */}
          {!isPro && teams.length >= 1 && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-primary/5 border border-primary/20 text-sm">
              <Sparkles className="w-4 h-4 text-primary shrink-0" />
              <span className="text-muted-foreground">
                Usuários gratuitos podem ter 1 time.{" "}
                <button className="text-primary font-semibold hover:underline" onClick={openPaywall}>
                  Assine o Pro
                </button>{" "}
                para times ilimitados.
              </span>
            </div>
          )}
        </div>
      )}

      <CreateTeamDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
