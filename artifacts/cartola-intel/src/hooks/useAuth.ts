import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface UserPreferences {
  defaultStrategy: string;
  onboardingCompleted: boolean;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  provider: string | null;
  plan: "free" | "pro";
  isPro: boolean;
  preferences: UserPreferences;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isPro: boolean;
  plan: "free" | "pro";
  logout: () => Promise<void>;
}

async function fetchMe(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error("Erro ao verificar sessão");
  const data = await res.json();
  return data as AuthUser;
}

export function useAuth(): AuthState {
  const queryClient = useQueryClient();

  const { data: user = null, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchMe,
    staleTime: 60_000,
    retry: false,
  });

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    queryClient.clear();
    window.location.reload();
  }

  return {
    user,
    isLoading,
    isAuthenticated: user !== null,
    isPro: user?.isPro ?? false,
    plan: user?.plan ?? "free",
    logout,
  };
}
