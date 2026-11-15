import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return <div role="status" className="p-6 text-muted-foreground">Verificando acesso...</div>;
  }
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}
