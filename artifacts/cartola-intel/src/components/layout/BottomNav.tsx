import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Menu, Shield, Trophy, Users } from "lucide-react";
import { ProBadge } from "@/components/ProBadge";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/useAuth";
import {
  ACCOUNT_NAV_ITEM,
  ADMIN_NAV_ITEM,
  isNavItemActive,
  NAV_GROUPS,
  PLANS_NAV_ITEM,
  type AppNavItem,
} from "@/components/layout/navigation";

const PRIMARY_ITEMS: AppNavItem[] = [
  { title: "Rodada", url: "/", icon: LayoutDashboard },
  { title: "Escalar", url: "/escalacao", icon: Shield },
  { title: "Jogadores", url: "/jogadores", icon: Users },
  { title: "Meu time", url: "/meus-times", icon: Trophy },
];

const PRIMARY_URLS = new Set(PRIMARY_ITEMS.map((item) => item.url));

export function BottomNav() {
  const isMobile = useIsMobile();
  const location = useLocation();
  const { isPro, user } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  if (!isMobile) return null;

  const remainingGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !PRIMARY_URLS.has(item.url)),
  })).filter((group) => group.items.length > 0);

  const footerItems = [
    ...(!isPro ? [PLANS_NAV_ITEM] : []),
    ACCOUNT_NAV_ITEM,
    ...(user?.role === "admin" ? [ADMIN_NAV_ITEM] : []),
  ];

  const moreIsActive = [...remainingGroups.flatMap((group) => group.items), ...footerItems]
    .some((item) => isNavItemActive(location.pathname, item.url));

  return (
    <>
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 px-1 pt-1 backdrop-blur-md md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="grid grid-cols-5">
          {PRIMARY_ITEMS.map((item) => {
            const active = isNavItemActive(location.pathname, item.url);
            return (
              <Link
                key={item.url}
                to={item.url}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 min-w-11 flex-col items-center justify-center gap-1 rounded-lg px-1 text-xs font-medium motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.title}</span>
              </Link>
            );
          })}
          <button
            type="button"
            aria-label="Abrir mais opções"
            aria-current={moreIsActive ? "page" : undefined}
            onClick={() => setMoreOpen(true)}
            className={`flex min-h-14 min-w-11 flex-col items-center justify-center gap-1 rounded-lg px-1 text-xs font-medium motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              moreIsActive ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Menu className="h-5 w-5" />
            <span>Mais</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] overflow-y-auto rounded-t-2xl border-border bg-card pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="mb-5 text-left">
            <SheetTitle>Mais opções</SheetTitle>
            <SheetDescription className="sr-only">
              Navegue para as demais áreas do Mitometro.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-5">
            {remainingGroups.map((group) => (
              <section key={group.label}>
                <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{group.label}</h2>
                <div className="grid gap-1">
                  {group.items.map((item) => (
                    <MobileMenuLink
                      key={item.url}
                      item={item}
                      active={isNavItemActive(location.pathname, item.url)}
                    />
                  ))}
                </div>
              </section>
            ))}
            <div className="border-t border-border pt-3">
              {footerItems.map((item) => (
                <MobileMenuLink
                  key={item.url}
                  item={item}
                  active={isNavItemActive(location.pathname, item.url)}
                  showProBadge={item.url === "/planos"}
                />
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function MobileMenuLink({
  item,
  active,
  showProBadge = false,
}: {
  item: AppNavItem;
  active: boolean;
  showProBadge?: boolean;
}) {
  return (
    <SheetClose asChild>
      <Link
        to={item.url}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          active ? "bg-primary/15 text-primary" : "text-foreground hover:bg-secondary"
        }`}
      >
        <item.icon className="h-5 w-5 shrink-0" />
        <span className="flex-1">{showProBadge ? "Planos" : item.title}</span>
        {showProBadge && <ProBadge />}
      </Link>
    </SheetClose>
  );
}