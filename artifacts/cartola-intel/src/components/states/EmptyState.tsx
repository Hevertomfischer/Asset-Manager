import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

type EmptyStateAction =
  | {
      actionLabel: string;
      onAction: () => void;
      actionHref?: never;
    }
  | {
      actionLabel: string;
      actionHref: string;
      onAction?: never;
    };

type EmptyStateProps = EmptyStateAction & {
  title: string;
  description: string;
  icon: LucideIcon;
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon: Icon,
  actionLabel,
  onAction,
  actionHref,
  className,
}: EmptyStateProps) {
  return (
    <Empty className={cn("border border-border/60 bg-card/50", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-primary/10 text-primary">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {actionHref ? (
          <Button asChild>
            <a href={actionHref}>{actionLabel}</a>
          </Button>
        ) : (
          <Button type="button" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </EmptyContent>
    </Empty>
  );
}