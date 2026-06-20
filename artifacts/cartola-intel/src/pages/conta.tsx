import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut, Mail, User, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase();
  }
  return email[0].toUpperCase();
}

export default function Conta() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [resetLoading, setResetLoading] = useState(false);

  async function handleRedoOnboarding() {
    setResetLoading(true);
    try {
      await fetch("/api/users/me/preferences", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingCompleted: false }),
      });
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      navigate("/");
    } finally {
      setResetLoading(false);
    }
  }

  if (!isLoading && !isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-muted-foreground">Você não está logado.</p>
        <Button asChild variant="outline">
          <a href="/api/auth/google">Entrar com Google</a>
        </Button>
      </div>
    );
  }

  if (isLoading || !user) {
    return (
      <div className="max-w-lg mx-auto mt-8">
        <Card>
          <CardHeader>
            <div className="h-6 w-32 animate-pulse rounded-md bg-primary/10" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="h-4 w-full animate-pulse rounded-md bg-primary/10" />
              <div className="h-4 w-3/4 animate-pulse rounded-md bg-primary/10" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto mt-8 px-2">
      <h1 className="text-2xl font-bold mb-6">Minha Conta</h1>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {user.avatarUrl && (
                <AvatarImage src={user.avatarUrl} alt={user.name ?? user.email} />
              )}
              <AvatarFallback className="text-lg font-semibold">
                {getInitials(user.name, user.email)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <CardTitle className="text-lg truncate">{user.name ?? "Usuário"}</CardTitle>
              <p className="text-sm text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <Separator />

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <User className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Nome</span>
              <span className="ml-auto font-medium truncate">{user.name ?? "—"}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">E-mail</span>
              <span className="ml-auto font-medium truncate">{user.email}</span>
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Plano atual</p>
              <p className="text-xs text-muted-foreground">
                {user.isPro
                  ? "Acesso completo às funcionalidades Pro"
                  : "Acesso às funcionalidades básicas"}
              </p>
            </div>
            {user.isPro ? (
              <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">Pro</Badge>
            ) : (
              <Badge variant="secondary">Gratuito</Badge>
            )}
          </div>

          <Separator />

          <Button
            variant="outline"
            className="w-full"
            disabled={resetLoading}
            onClick={() => void handleRedoOnboarding()}
          >
            {resetLoading ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Refazer tour de boas-vindas
          </Button>

          <Button
            variant="outline"
            className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
            onClick={logout}
          >
            <LogOut className="w-4 h-4" />
            Sair da conta
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
