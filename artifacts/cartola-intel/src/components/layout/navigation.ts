import {
  GitCompare,
  GitFork,
  History,
  LayoutDashboard,
  Settings,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  UserCircle,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface AppNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
}

export interface AppNavGroup {
  label: string;
  items: AppNavItem[];
}

export const NAV_GROUPS: AppNavGroup[] = [
  {
    label: "Rodada",
    items: [
      { title: "Painel", url: "/", icon: LayoutDashboard },
      { title: "Escalação", url: "/escalacao", icon: Shield },
      { title: "Confrontos", url: "/confrontos", icon: Swords },
    ],
  },
  {
    label: "Análise",
    items: [
      { title: "Jogadores", url: "/jogadores", icon: Users },
      { title: "Comparar", url: "/comparar", icon: GitCompare },
      { title: "Opções de risco", url: "/fronteira", icon: GitFork },
    ],
  },
  {
    label: "Meu desempenho",
    items: [
      { title: "Meus times", url: "/meus-times", icon: Trophy },
      { title: "Histórico", url: "/historico", icon: History },
    ],
  },
  {
    label: "Transparência",
    items: [
      { title: "Desempenho do modelo", url: "/desempenho", icon: LayoutDashboard },
    ],
  },
];

export const ACCOUNT_NAV_ITEM: AppNavItem = {
  title: "Minha conta",
  url: "/conta",
  icon: UserCircle,
};

export const PLANS_NAV_ITEM: AppNavItem = {
  title: "Planos Pro",
  url: "/planos",
  icon: Sparkles,
};

export const ADMIN_NAV_ITEM: AppNavItem = {
  title: "Admin",
  url: "/admin",
  icon: Settings,
};

export function isNavItemActive(pathname: string, url: string): boolean {
  return url === "/" ? pathname === "/" : pathname.startsWith(url);
}