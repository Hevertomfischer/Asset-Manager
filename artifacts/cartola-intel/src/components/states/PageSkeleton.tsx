import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type PageSkeletonVariant = "list" | "cards" | "pitch" | "chart";

interface PageSkeletonProps {
  variant: PageSkeletonVariant;
  className?: string;
  "aria-label"?: string;
}

export function PageSkeleton({
  variant,
  className,
  "aria-label": ariaLabel = "Carregando conteúdo",
}: PageSkeletonProps) {
  return (
    <div
      role="status"
      aria-label={ariaLabel}
      aria-busy="true"
      className={cn("w-full", className)}
    >
      {variant === "list" && <ListSkeleton />}
      {variant === "cards" && <CardsSkeleton />}
      {variant === "pitch" && <PitchSkeleton />}
      {variant === "chart" && <ChartSkeleton />}
      <span className="sr-only">{ariaLabel}</span>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 sm:flex-row">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-full sm:w-40" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
        <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 border-b border-border/50 p-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20 justify-self-end" />
        </div>
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="flex min-h-16 items-center gap-3 border-b border-border/30 p-4 last:border-0"
          >
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-36 max-w-full" />
              <Skeleton className="h-3 w-24 max-w-[60%]" />
            </div>
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CardsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-3 rounded-2xl border border-border/60 bg-card p-5">
            <Skeleton className="size-9 rounded-xl" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="space-y-4 rounded-2xl border border-border/60 bg-card p-5">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 4 }).map((__, row) => (
              <div key={row} className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-5 w-14" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PitchSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="relative min-h-[560px] overflow-hidden rounded-3xl border border-positive/20 bg-positive/10 p-6">
        <div className="absolute inset-x-6 top-1/2 border-t border-white/20" />
        <div className="absolute left-1/2 top-1/2 size-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20" />
        <div className="flex h-full min-h-[510px] flex-col justify-between">
          {[3, 4, 4, 2].map((count, row) => (
            <div key={row} className="flex justify-around">
              {Array.from({ length: count }).map((_, player) => (
                <div key={player} className="flex flex-col items-center gap-2">
                  <Skeleton className="size-11 rounded-full bg-white/15" />
                  <Skeleton className="h-3 w-14 bg-white/15" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-3 rounded-2xl border border-border/60 bg-card p-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="space-y-3 rounded-2xl border border-border/60 bg-card p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-3 w-32 max-w-full" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <Skeleton className="mb-6 h-5 w-48 max-w-full" />
        <div className="flex h-72 items-end gap-3 border-b border-l border-border/50 px-3 pt-6">
          {[42, 68, 54, 82, 63, 74, 48, 88, 70, 58].map((height, index) => (
            <Skeleton
              key={index}
              className="flex-1 rounded-b-none"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}