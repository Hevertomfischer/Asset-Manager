import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PaywallProvider } from "@/context/PaywallContext";
import { OnboardingDialog } from "@/components/OnboardingDialog";
import { useAuth } from "@/hooks";
import { useTrack } from "@/hooks/useTrack";
import NotFound from "@/pages/not-found";

import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "@/pages/dashboard";
import Players from "@/pages/players";
import Lineup from "@/pages/lineup";
import Admin from "@/pages/admin";
import Confrontos from "@/pages/confrontos";
import Historico from "@/pages/historico";
import Conta from "@/pages/conta";
import Planos from "@/pages/planos";
import Fronteira from "@/pages/fronteira";
import Desempenho from "@/pages/desempenho";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Fires a single login or signup event per browser session.
 * Uses localStorage to distinguish first-ever login (signup) from returning
 * logins, and sessionStorage to prevent re-firing within the same tab session.
 */
function SessionTracker() {
  const { user, isLoading } = useAuth();
  const track = useTrack();

  useEffect(() => {
    if (isLoading || !user) return;

    const sessionKey = "ci_session_tracked";
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, "1");

    const seenKey = `ci_seen_${user.id}`;
    if (!localStorage.getItem(seenKey)) {
      localStorage.setItem(seenKey, "1");
      track("signup", { plan: user.plan });
    } else {
      track("login", { plan: user.plan });
    }
  }, [user, isLoading, track]);

  return null;
}

function OnboardingGate() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  if (isLoading || !isAuthenticated || dismissed) return null;
  if (user?.preferences?.onboardingCompleted) return null;
  return <OnboardingDialog onClose={() => setDismissed(true)} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter basename={BASE}>
          <PaywallProvider>
            <SessionTracker />
            <OnboardingGate />
            <Routes>
              {/* Public standalone page — rendered without AppLayout (no sidebar) */}
              <Route path="/desempenho" element={<Desempenho />} />

              {/* All other routes — wrapped in AppLayout (sidebar + header) */}
              <Route
                path="*"
                element={
                  <AppLayout>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/jogadores" element={<Players />} />
                      <Route path="/escalacao" element={<Lineup />} />
                      <Route path="/admin" element={<Admin />} />
                      <Route path="/confrontos" element={<Confrontos />} />
                      <Route path="/historico" element={<Historico />} />
                      <Route path="/conta" element={<Conta />} />
                      <Route path="/planos" element={<Planos />} />
                      <Route path="/fronteira" element={<Fronteira />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AppLayout>
                }
              />
            </Routes>
          </PaywallProvider>
        </BrowserRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
