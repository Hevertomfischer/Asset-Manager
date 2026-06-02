import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PaywallProvider } from "@/context/PaywallContext";
import NotFound from "@/pages/not-found";

import { AppLayout } from "@/components/layout/AppLayout";
import Dashboard from "@/pages/dashboard";
import Players from "@/pages/players";
import Lineup from "@/pages/lineup";
import Admin from "@/pages/admin";
import Confrontos from "@/pages/confrontos";
import Historico from "@/pages/historico";
import Conta from "@/pages/conta";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter basename={BASE}>
          <PaywallProvider>
          <AppLayout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/jogadores" element={<Players />} />
              <Route path="/escalacao" element={<Lineup />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/confrontos" element={<Confrontos />} />
              <Route path="/historico" element={<Historico />} />
              <Route path="/conta" element={<Conta />} />
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
