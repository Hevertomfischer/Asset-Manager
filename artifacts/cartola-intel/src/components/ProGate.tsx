import { type ReactNode, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTrack } from "@/hooks/useTrack";

interface ProGateProps {
  children: ReactNode;
  message?: string;
  variant?: "overlay" | "inline";
}

export function ProGate({ children, message, variant = "overlay" }: ProGateProps) {
  const { isPro, isLoading } = useAuth();
  const navigate = useNavigate();
  const track = useTrack();
  const trackedRef = useRef(false);

  useEffect(() => {
    if (isLoading || isPro || variant !== "overlay" || trackedRef.current) return;
    trackedRef.current = true;
    track("paywall_viewed", { source: "overlay" });
  }, [isLoading, isPro, variant, track]);

  if (isLoading || isPro) return <>{children}</>;

  if (variant === "inline") {
    return (
      <button
        className="inline-flex items-center gap-1 text-muted-foreground/40 hover:text-primary/70 transition-colors cursor-pointer"
        title="Disponível no plano Pro"
        onClick={() => navigate("/planos")}
      >
        <Lock className="w-3 h-3" />
      </button>
    );
  }

  return (
    <div className="relative rounded-xl overflow-hidden">
      <div className="blur-sm pointer-events-none select-none" aria-hidden="true">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/75 backdrop-blur-[1px] z-10 rounded-xl">
        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Lock className="w-5 h-5 text-primary" />
        </div>
        <div className="text-center px-4">
          <p className="text-sm font-semibold text-foreground">Exclusivo Pro</p>
          {message && (
            <p className="text-xs text-muted-foreground mt-0.5">{message}</p>
          )}
        </div>
        <Button
          size="sm"
          className="mt-1 bg-gradient-to-r from-primary to-accent font-semibold text-xs h-8 px-4"
          onClick={() => navigate("/planos")}
        >
          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
          Assinar o Pro
        </Button>
      </div>
    </div>
  );
}
