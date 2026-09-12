import { Ban, LockKeyhole } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlayerConstraintActionsProps {
  playerName: string;
  isLocked: boolean;
  isExcluded: boolean;
  onToggleLocked: () => void;
  onToggleExcluded: () => void;
  className?: string;
}

export function PlayerConstraintActions({
  playerName,
  isLocked,
  isExcluded,
  onToggleLocked,
  onToggleExcluded,
  className,
}: PlayerConstraintActionsProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button
        type="button"
        aria-label={`${isLocked ? "Destravar" : "Travar"} ${playerName}`}
        aria-pressed={isLocked}
        title={isLocked ? "Destravar" : "Travar"}
        onClick={(event) => {
          event.stopPropagation();
          onToggleLocked();
        }}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-lg border motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isLocked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border/60 text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
        )}
      >
        <LockKeyhole className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label={`${isExcluded ? "Incluir" : "Excluir"} ${playerName}`}
        aria-pressed={isExcluded}
        title={isExcluded ? "Incluir novamente" : "Excluir"}
        onClick={(event) => {
          event.stopPropagation();
          onToggleExcluded();
        }}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-lg border motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isExcluded
            ? "border-danger bg-danger text-danger-foreground"
            : "border-border/60 text-muted-foreground hover:border-danger/40 hover:bg-danger/10 hover:text-danger",
        )}
      >
        <Ban className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}