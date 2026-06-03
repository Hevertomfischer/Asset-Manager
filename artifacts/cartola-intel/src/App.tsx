import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PaywallProvider } from "@/context/PaywallContext";
import { OnboardingDialog } from "@/components/OnboardingDialog";
import { useAuth } from "@/hooks";
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
          <OnboardingGate />
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
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AppLayout>
          </PaywallProvider>
        </BrowserRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
