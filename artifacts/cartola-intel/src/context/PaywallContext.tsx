import { createContext, useContext, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles } from "lucide-react";

interface PaywallContextValue {
  openPaywall: () => void;
}

const PaywallContext = createContext<PaywallContextValue>({
  openPaywall: () => {},
});

export function usePaywall(): PaywallContextValue {
  return useContext(PaywallContext);
}

export function PaywallProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <PaywallContext.Provider value={{ openPaywall: () => setOpen(true) }}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Lock className="w-7 h-7 text-primary" />
            </div>
            <DialogHeader className="items-center space-y-1">
              <DialogTitle className="text-xl">Recurso exclusivo do Pro</DialogTitle>
              <DialogDescription className="text-center text-sm leading-relaxed">
                Faça upgrade para o plano Pro e desbloqueie estratégias avançadas,
                backtest completo e projeções detalhadas.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-2 w-full mt-1">
              <Button
                className="w-full bg-gradient-to-r from-primary to-accent font-bold"
                onClick={() => { setOpen(false); navigate("/planos"); }}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Ver planos
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setOpen(false)}>
                Agora não
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PaywallContext.Provider>
  );
}
