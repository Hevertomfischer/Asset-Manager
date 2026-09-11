import { AlertTriangle, RefreshCw } from "lucide-react";
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

interface ErrorStateProps {
  title: string;
  description: string;
  onRetry: () => void | Promise<unknown>;
  className?: string;
  retryLabel?: string;
}

export function ErrorState({
  title,
  description,
  onRetry,
  className,
  retryLabel = "Tentar de novo",
}: ErrorStateProps) {
  return (
    <Empty className={cn("border border-danger/25 bg-danger/5", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-danger/10 text-danger">
          <AlertTriangle aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" variant="outline" onClick={() => void onRetry()}>
          <RefreshCw aria-hidden="true" />
          {retryLabel}
        </Button>
      </EmptyContent>
    </Empty>
  );
}