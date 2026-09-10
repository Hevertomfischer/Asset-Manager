import { Sparkles } from "lucide-react";

interface ProBadgeProps {
  className?: string;
}

export function ProBadge({ className = "" }: ProBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border border-foreground/40 px-1.5 py-0.5 text-xs font-semibold text-foreground ${className}`}
    >
      <Sparkles className="h-3 w-3" />
      Pro
    </span>
  );
}