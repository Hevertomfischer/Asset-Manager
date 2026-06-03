import { useState } from "react";
import { Link } from "react-router-dom";
import { LogIn, LogOut, UserCircle, FlaskConical } from "lucide-react";
import { useAuth } from "@/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

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

function DevLoginPopover() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [plan, setPlan] = useState<"free" | "pro">("free");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, name: name || undefined, plan }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Erro ao fazer login");
        return;
      }
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    } catch {
      setError("Erro de rede");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30 border border-amber-300 dark:border-amber-700">
          <FlaskConical className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-xs font-medium">Dev</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-4">
        <div className="mb-3">
          <p className="text-sm font-semibold flex items-center gap-1.5">
            <FlaskConical className="w-3.5 h-3.5 text-amber-500" />
            Dev Login
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Apenas em ambiente de desenvolvimento</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="dev-email" className="text-xs">Email *</Label>
            <Input
              id="dev-email"
              type="email"
              placeholder="usuario@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dev-name" className="text-xs">Nome (opcional)</Label>
            <Input
              id="dev-name"
              type="text"
              placeholder="Nome do usuário"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Plano</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPlan("free")}
                className={`flex-1 h-8 rounded-md border text-xs font-medium transition-colors ${
                  plan === "free"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-input bg-background hover:bg-accent"
                }`}
              >
                Free
              </button>
              <button
                type="button"
                onClick={() => setPlan("pro")}
                className={`flex-1 h-8 rounded-md border text-xs font-medium transition-colors ${
                  plan === "pro"
                    ? "bg-amber-500 text-white border-amber-500"
                    : "border-input bg-background hover:bg-accent"
                }`}
              >
                Pro
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" size="sm" className="w-full h-8 text-xs" disabled={loading || !email}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function UserMenu() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();

  if (isLoading) {
    return <Skeleton className="h-8 w-8 rounded-full" />;
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center gap-2">
        {import.meta.env.DEV && <DevLoginPopover />}
        <Button asChild variant="outline" size="sm">
          <a href="/api/auth/google">
            <LogIn className="w-4 h-4" />
            <span className="hidden sm:inline">Entrar com Google</span>
          </a>
        </Button>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar className="h-8 w-8">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name ?? user.email} />}
            <AvatarFallback className="text-xs font-semibold">
              {getInitials(user.name, user.email)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden md:block text-sm font-medium max-w-[120px] truncate text-foreground">
            {user.name ?? user.email}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="font-normal">
          <p className="font-semibold text-sm truncate">{user.name ?? "Usuário"}</p>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/conta" className="flex items-center gap-2 cursor-pointer">
            <UserCircle className="w-4 h-4" />
            Minha conta
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={logout}
          className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
