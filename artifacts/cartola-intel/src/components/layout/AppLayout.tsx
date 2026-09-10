import { FC, ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Activity } from "lucide-react";
import { UserMenu } from "@/components/layout/UserMenu";
import { BottomNav } from "@/components/layout/BottomNav";
import { NotificationBell } from "@/components/NotificationBell";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { AutoSync } from "@/components/AutoSync";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { FounderCampaignBanner } from "@/components/FounderCampaignBanner";
import { ProBadge } from "@/components/ProBadge";
import { useAuth } from "@/hooks/useAuth";
import { useGetAdminFeedbackNewCount } from "@workspace/api-client-react";
import {
  ACCOUNT_NAV_ITEM,
  ADMIN_NAV_ITEM,
  isNavItemActive,
  NAV_GROUPS,
  PLANS_NAV_ITEM,
  type AppNavItem,
} from "@/components/layout/navigation";

export const AppSidebar = () => {
  const location = useLocation();
  const { isPro, user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: feedbackCountData } = useGetAdminFeedbackNewCount(isAdmin);
  const newFeedbackCount = feedbackCountData?.count ?? 0;

  return (
    <Sidebar className="border-r border-border bg-sidebar">
      <SidebarContent>
        <div className="p-6 flex items-center gap-3">
          <div className="bg-primary/20 p-2 rounded-xl border border-primary/30">
            <Activity className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl text-foreground tracking-tight leading-none">
              Mito<span className="text-primary">metro</span>
            </h1>
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              Escalação com explicação
            </p>
          </div>
        </div>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label} className="py-1">
            <SidebarGroupLabel className="mb-1 px-6 text-xs font-semibold text-muted-foreground">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="px-3">
                {group.items.map((item) => (
                  <SidebarNavItem
                    key={item.url}
                    item={item}
                    active={isNavItemActive(location.pathname, item.url)}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-border/50 p-3">
        <SidebarMenu>
          {!isPro && (
            <SidebarNavItem
              item={PLANS_NAV_ITEM}
              active={isNavItemActive(location.pathname, PLANS_NAV_ITEM.url)}
              showProBadge
            />
          )}
          <SidebarNavItem
            item={ACCOUNT_NAV_ITEM}
            active={isNavItemActive(location.pathname, ACCOUNT_NAV_ITEM.url)}
          />
          {isAdmin && (
            <SidebarNavItem
              item={ADMIN_NAV_ITEM}
              active={isNavItemActive(location.pathname, ADMIN_NAV_ITEM.url)}
              badgeCount={newFeedbackCount}
            />
          )}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};

function SidebarNavItem({
  item,
  active,
  badgeCount = 0,
  showProBadge = false,
}: {
  item: AppNavItem;
  active: boolean;
  badgeCount?: number;
  showProBadge?: boolean;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        className={`mb-1 h-11 rounded-xl px-3 motion-safe:transition-all motion-safe:duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          active
            ? "bg-primary/15 font-semibold text-primary hover:bg-primary/20"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        }`}
      >
        <Link to={item.url} className="flex items-center gap-3" aria-current={active ? "page" : undefined}>
          <item.icon className={`h-5 w-5 ${active ? "text-primary" : "opacity-70"}`} />
          <span className="flex-1">{showProBadge ? "Planos" : item.title}</span>
          {showProBadge && <ProBadge />}
          {badgeCount > 0 && (
            <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-danger px-1 text-xs tabular-nums font-bold leading-none text-danger-foreground">
              {badgeCount > 99 ? "99+" : badgeCount}
            </span>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export const AppLayout: FC<{ children: ReactNode }> = ({ children }) => {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <AutoSync />
      <div className="flex min-h-screen w-full bg-background selection:bg-primary/30 selection:text-primary-foreground text-foreground">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <header className="h-16 flex items-center justify-between px-6 border-b border-border/50 bg-background/80 backdrop-blur-md sticky top-0 z-40">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <UserMenu />
            </div>
          </header>
          <FounderCampaignBanner />
          <main className="relative flex-1 overflow-auto p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto w-full">{children}</div>
          </main>
          <FeedbackWidget />
          <BottomNav />
        </div>
      </div>
    </SidebarProvider>
  );
};
