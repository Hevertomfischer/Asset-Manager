import { FC, ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Shield, Settings, Activity, Swords, History, UserCircle, Sparkles } from "lucide-react";
import { UserMenu } from "@/components/layout/UserMenu";
import {
  Sidebar,
  SidebarContent,
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

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Jogadores", url: "/jogadores", icon: Users },
  { title: "Escalação", url: "/escalacao", icon: Shield },
  { title: "Confrontos", url: "/confrontos", icon: Swords },
  { title: "Histórico", url: "/historico", icon: History },
  { title: "Planos Pro", url: "/planos", icon: Sparkles },
  { title: "Admin", url: "/admin", icon: Settings },
  { title: "Minha conta", url: "/conta", icon: UserCircle },
];

export const AppSidebar = () => {
  const location = useLocation();

  return (
    <Sidebar className="border-r border-border bg-sidebar">
      <SidebarContent>
        <div className="p-6 flex items-center gap-3">
          <div className="bg-primary/20 p-2 rounded-xl border border-primary/30">
            <Activity className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-bold text-xl text-foreground tracking-tight leading-none">
              Cartola<span className="text-primary">Intel</span>
            </h1>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5 font-medium">Pro Analytics</p>
          </div>
        </div>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground font-semibold px-6 mb-2">Plataforma</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="px-3">
              {navItems.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      className={`
                        mb-1 h-11 px-3 rounded-xl transition-all duration-200
                        ${isActive
                          ? "bg-primary/15 text-primary font-semibold hover:bg-primary/20"
                          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                        }
                      `}
                    >
                      <Link to={item.url} className="flex items-center gap-3">
                        <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : "opacity-70"}`} />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
};

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
              <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors" />
            </div>
            <div className="flex items-center gap-3">
              <div className="px-3 py-1 rounded-full bg-secondary text-xs font-semibold text-muted-foreground border border-border hidden sm:block">
                v0.2.0-beta
              </div>
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 relative">
            <div className="max-w-7xl mx-auto w-full">{children}</div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
