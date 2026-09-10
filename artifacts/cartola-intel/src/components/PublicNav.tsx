import { Link } from "react-router-dom";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PublicNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 rounded-lg bg-positive/10 border border-positive/30 flex items-center justify-center group-hover:bg-positive/20 motion-safe:transition-colors">
            <Activity className="h-3.5 w-3.5 text-positive" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-sm font-bold text-foreground tracking-tight">Mitometro</span>
            <span className="text-xs text-muted-foreground">Pro Analytics</span>
          </div>
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground hidden sm:flex">
            <a href="/api/auth/google">Entrar</a>
          </Button>
          <Button size="sm" asChild className="bg-positive hover:bg-positive/90 text-positive-foreground shadow-lg shadow-positive/20 text-xs">
            <a href="/api/auth/google">Criar conta grátis</a>
          </Button>
        </div>
      </div>
    </nav>
  );
}
