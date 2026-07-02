/**
 * FeedbackWidget — botão flutuante + Sheet lateral para envio de feedback.
 *
 * Discreto, não-bloqueante, acessível em qualquer página via AppLayout.
 * Captura a rota atual via window.location.pathname.
 * Rate-limit de UI: desabilita o botão por 30 s após envio bem-sucedido.
 */

import { useState } from "react";
import { MessageSquarePlus, X, Loader2, Bug, Lightbulb, Star, HelpCircle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useTrack } from "@/hooks/useTrack";

// ── Types ─────────────────────────────────────────────────────────────────────

type FeedbackType = "bug" | "ideia" | "elogio" | "duvida";

interface TypeOption {
  value: FeedbackType;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const TYPES: TypeOption[] = [
  { value: "bug",    label: "Problema",  icon: <Bug    className="w-4 h-4" />, description: "Algo não está funcionando" },
  { value: "ideia",  label: "Ideia",     icon: <Lightbulb className="w-4 h-4" />, description: "Sugestão de melhoria" },
  { value: "elogio", label: "Elogio",    icon: <Star   className="w-4 h-4" />, description: "Algo que você adorou" },
  { value: "duvida", label: "Dúvida",    icon: <HelpCircle className="w-4 h-4" />, description: "Precisa de ajuda" },
];

const PLACEHOLDERS: Record<FeedbackType, string> = {
  bug:    "Descreva o problema com detalhes: o que aconteceu, em qual página, o que esperava ver…",
  ideia:  "Descreva sua sugestão: qual funcionalidade faria falta, qual problema resolveria…",
  elogio: "Conte o que mais gostou — isso nos motiva muito! 🙌",
  duvida: "Qual é sua dúvida? Tentaremos responder em breve.",
};

const MIN_LEN = 10;
const MAX_LEN = 2000;

// ── FeedbackWidget ────────────────────────────────────────────────────────────

export function FeedbackWidget() {
  const { toast } = useToast();
  const track = useTrack();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("ideia");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  const charCount = message.length;
  const isValid = charCount >= MIN_LEN && charCount <= MAX_LEN;

  function handleOpen() {
    if (cooldown) return;
    setOpen(true);
  }

  function handleClose() {
    if (loading) return;
    setOpen(false);
    setMessage("");
    setType("ideia");
  }

  async function handleSubmit() {
    if (!isValid || loading) return;

    setLoading(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          message,
          page: window.location.pathname,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Erro ao enviar feedback.");
      }

      track("feedback_submitted", { type, page: window.location.pathname });
      toast({
        title: "Feedback enviado! 🙏",
        description: "Obrigado pela sua contribuição. Vamos analisar em breve.",
      });
      handleClose();
      setCooldown(true);
      setTimeout(() => setCooldown(false), 30_000);
    } catch (err: unknown) {
      toast({
        title: "Erro ao enviar",
        description: (err as Error).message ?? "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* ── Floating trigger button ─────────────────────────────────────── */}
      <button
        onClick={handleOpen}
        disabled={cooldown}
        title="Enviar feedback"
        aria-label="Abrir widget de feedback"
        className={`
          fixed bottom-5 right-4 z-40
          flex items-center gap-2
          h-10 px-3.5 rounded-full
          border border-primary/30
          bg-card/90 backdrop-blur-md
          text-primary text-xs font-semibold
          shadow-lg shadow-black/20
          transition-all duration-200
          hover:bg-primary/10 hover:border-primary/60 hover:shadow-primary/10
          active:scale-95
          sm:bottom-6 sm:right-6
          ${cooldown ? "opacity-40 cursor-not-allowed" : ""}
        `}
      >
        <MessageSquarePlus className="w-4 h-4 shrink-0" />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      {/* ── Sheet panel ─────────────────────────────────────────────────── */}
      <Sheet open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-sm flex flex-col gap-0 p-0 border-l border-border/60 bg-card"
        >
          {/* Header */}
          <SheetHeader className="px-6 pt-5 pb-4 border-b border-border/30 space-y-1.5">
            <div className="flex items-center justify-between">
              <SheetTitle className="flex items-center gap-2 text-base font-semibold">
                <MessageSquarePlus className="w-4 h-4 text-primary" />
                Enviar Feedback
              </SheetTitle>
              <button
                onClick={handleClose}
                className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <SheetDescription className="text-xs text-muted-foreground">
              Sua opinião melhora o Mitometro. Obrigado por compartilhar!
            </SheetDescription>
          </SheetHeader>

          {/* Body */}
          <div className="flex-1 overflow-auto px-6 py-5 space-y-5">

            {/* ── Type selector ──────────────────────────────────────────── */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Tipo
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={`
                      flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all
                      ${type === t.value
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border/40 bg-secondary/40 text-muted-foreground hover:border-border hover:text-foreground"
                      }
                    `}
                  >
                    <span className={type === t.value ? "text-primary" : "text-muted-foreground"}>
                      {t.icon}
                    </span>
                    <span className="text-xs font-semibold">{t.label}</span>
                    <span className="text-[10px] leading-tight opacity-80">{t.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Message ────────────────────────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="fb-message" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Mensagem
                </Label>
                <span className={`text-[10px] font-mono tabular-nums ${charCount > MAX_LEN ? "text-red-400" : charCount > MAX_LEN * 0.85 ? "text-yellow-400" : "text-muted-foreground"}`}>
                  {charCount}/{MAX_LEN}
                </span>
              </div>
              <Textarea
                id="fb-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={PLACEHOLDERS[type]}
                rows={6}
                className="rounded-xl border-border/60 bg-secondary resize-none text-sm leading-relaxed focus:border-primary/40"
                maxLength={MAX_LEN + 50}
              />
              {charCount > 0 && charCount < MIN_LEN && (
                <p className="text-[11px] text-yellow-500/80">
                  Mínimo {MIN_LEN} caracteres ({MIN_LEN - charCount} restante{MIN_LEN - charCount !== 1 ? "s" : ""})
                </p>
              )}
            </div>

            {/* ── Page indicator (read-only) ─────────────────────────────── */}
            <p className="text-[10px] text-muted-foreground/60">
              Página capturada automaticamente: <code className="font-mono">{window.location.pathname}</code>
            </p>
          </div>

          {/* Footer */}
          <div className="px-6 pb-6 pt-4 border-t border-border/30">
            <Button
              className="w-full rounded-xl bg-gradient-to-r from-primary to-accent font-semibold h-10"
              disabled={!isValid || loading}
              onClick={handleSubmit}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <MessageSquarePlus className="w-4 h-4 mr-2" />
              )}
              {loading ? "Enviando…" : "Enviar Feedback"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
