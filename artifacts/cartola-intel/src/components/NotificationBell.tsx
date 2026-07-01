import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  TrendingUp,
  Zap,
  CheckCircle2,
  Clock,
  Loader2,
  BellOff,
  User,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AppNotification {
  id: number;
  userId: number | null;
  type: "status_change" | "price" | "trap" | "market_open" | "market_close" | string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  notifications: AppNotification[];
  unreadCount: number;
  limit: number;
  offset: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function typeIcon(type: string) {
  switch (type) {
    case "status_change":
      return <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />;
    case "price":
      return <TrendingUp className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />;
    case "trap":
      return <Zap className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />;
    case "market_open":
      return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />;
    case "market_close":
      return <Clock className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />;
    default:
      return <Bell className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />;
  }
}

function timeAgo(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return "";
  }
}

/** Sort priority: personal-unread → global-unread → read (stable within each group). */
function sortPriority(n: AppNotification): number {
  if (n.readAt === null && n.userId !== null) return 0;
  if (n.readAt === null && n.userId === null) return 1;
  return 2;
}

// ── NotificationItem ──────────────────────────────────────────────────────────

function NotificationItem({
  notification,
  onRead,
}: {
  notification: AppNotification;
  onRead: (id: number) => void;
}) {
  const isUnread = notification.readAt === null;
  const isPersonal = notification.userId !== null;

  return (
    <button
      onClick={() => isUnread && onRead(notification.id)}
      className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors ${
        isPersonal ? "border-l-2 border-primary" : "border-l-2 border-transparent"
      } ${
        isUnread
          ? "bg-primary/5 hover:bg-primary/10"
          : "hover:bg-secondary/40"
      }`}
    >
      {typeIcon(notification.type)}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <p
              className={`text-sm leading-snug ${
                isUnread ? "font-semibold text-foreground" : "font-medium text-muted-foreground"
              }`}
            >
              {notification.title}
            </p>
            {isPersonal && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[9px] font-bold border border-primary/20 shrink-0">
                <User className="w-2.5 h-2.5" />
                Pessoal
              </span>
            )}
          </div>
          {isUnread && (
            <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
          {notification.body}
        </p>
        <p className="text-[10px] text-muted-foreground/60 mt-1">
          {timeAgo(notification.createdAt)}
        </p>
      </div>
    </button>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-10 px-4 py-1.5 bg-secondary/70 backdrop-blur-sm border-b border-border/20">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        {label}
      </p>
    </div>
  );
}

// ── NotificationBell ──────────────────────────────────────────────────────────

export function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<NotificationsResponse>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications?limit=30", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!user,
    // Poll every 60 s and also re-fetch whenever the user focuses the tab
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: invalidate,
  });

  const markAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/notifications/read-all", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: invalidate,
  });

  const rawNotifications = data?.notifications ?? [];
  // unreadCount comes from the server — counts both personal and global, unchanged
  const unreadCount = data?.unreadCount ?? 0;
  const hasUnread = unreadCount > 0;

  // ── Sort client-side: personal-unread → global-unread → read ───────────────
  // Stable sort: items that share priority keep their original (API) order.
  // Must be called before any early return to comply with Rules of Hooks.
  const notifications = useMemo(
    () => [...rawNotifications].sort((a, b) => sortPriority(a) - sortPriority(b)),
    [rawNotifications],
  );

  // Whether to show section headers (only useful when personal notifications exist)
  const hasPersonal = notifications.some((n) => n.userId !== null);

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative flex items-center justify-center w-9 h-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
          aria-label="Notificações"
        >
          <Bell className="w-5 h-5" />
          {hasUnread && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center leading-none">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[340px] sm:w-[380px] p-0 shadow-2xl border-border/60"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              Notificações
            </span>
            {hasUnread && (
              <span className="px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold">
                {unreadCount} nova{unreadCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {hasUnread && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
            >
              {markAllMutation.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <CheckCheck className="w-3 h-3 mr-1" />
              )}
              Marcar todas
            </Button>
          )}
        </div>

        {/* List */}
        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <p className="text-xs">Carregando...</p>
            </div>
          ) : notifications.length === 0 ? (
            /* ── Empty state ── */
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground px-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center">
                <BellOff className="w-6 h-6 opacity-40" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Tudo tranquilo</p>
                <p className="text-xs mt-0.5 leading-relaxed">
                  Alertas de mercado, variações de preço e armadilhas aparecerão aqui.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/20">
              {notifications.map((n, i) => {
                // ── Optional section header logic ────────────────────────────
                // Only rendered when there are personal notifications so the
                // grouping text is meaningful.  We insert the header just before
                // the first item of each section, not on every item.
                const prevPriority = i > 0 ? sortPriority(notifications[i - 1]!) : -1;
                const thisPriority = sortPriority(n);
                const showHeader = hasPersonal && thisPriority !== prevPriority;

                let headerLabel: string | null = null;
                if (showHeader) {
                  if (thisPriority === 0) headerLabel = "Sobre seu time";
                  else if (thisPriority === 1) headerLabel = "Mercado geral";
                  else if (thisPriority === 2 && hasPersonal) headerLabel = "Lidas";
                }

                return (
                  <div key={n.id}>
                    {headerLabel && <SectionHeader label={headerLabel} />}
                    <NotificationItem
                      notification={n}
                      onRead={(id) => markReadMutation.mutate(id)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer — only when there are notifications */}
        {notifications.length > 0 && (
          <>
            <Separator className="opacity-30" />
            <div className="px-4 py-2 text-center">
              <p className="text-[10px] text-muted-foreground/60">
                Mostrando as últimas {notifications.length} notificações
              </p>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
