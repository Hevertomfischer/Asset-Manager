import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Image, Loader2, Share2, ClipboardCopy } from "lucide-react";
import type { LineupPlayer, LineupSuggestion } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pitch } from "@/components/Pitch";
import { useToast } from "@/hooks/use-toast";
import { useTrack } from "@/hooks/useTrack";
import { elementToPngBlob, shareOrDownloadPng } from "@/lib/shareImage";

const POSITION_ORDER = ["GOL", "LAT", "ZAG", "MEI", "ATA", "TEC"] as const;
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;

interface ExportLineupSheetProps {
  lineup: LineupSuggestion;
}

function formatCartoletas(value: number) {
  return `C$ ${value.toFixed(2).replace(".", ",")}`;
}

function orderedPlayers(players: LineupPlayer[]) {
  return [...players].sort((a, b) => {
    const aIndex = POSITION_ORDER.indexOf((a.position ?? "") as typeof POSITION_ORDER[number]);
    const bIndex = POSITION_ORDER.indexOf((b.position ?? "") as typeof POSITION_ORDER[number]);
    return (aIndex === -1 ? POSITION_ORDER.length : aIndex) -
      (bIndex === -1 ? POSITION_ORDER.length : bIndex);
  });
}

function buildClipboardText(lineup: LineupSuggestion, players: LineupPlayer[]) {
  const totalCost = lineup.totalCost ?? players.reduce((sum, player) => sum + (player.price ?? 0), 0);
  const balance = Math.max(0, (lineup.budgetLimit ?? totalCost) - totalCost);
  const lines = POSITION_ORDER.flatMap((position) => {
    const group = players.filter((player) => player.position === position);
    if (!group.length) return [];
    return [
      position,
      ...group.map((player) => {
        const captain = player.playerId === lineup.captainPlayerId ? " (C)" : "";
        return `${player.nickname ?? player.name ?? "Jogador"}${captain} — ${player.clubAbbr ?? player.clubName ?? "Sem clube"} — ${formatCartoletas(player.price ?? 0)}`;
      }),
      "",
    ];
  });
  return [
    `Escalação Mitômetro — Rodada ${lineup.round ?? "—"}`,
    `Formação ${lineup.formation ?? "—"}`,
    "",
    ...lines,
    `Total: ${formatCartoletas(totalCost)}`,
    `Saldo: ${formatCartoletas(balance)}`,
  ].join("\n");
}

export function ExportLineupSheet({ lineup }: ExportLineupSheetProps) {
  const { toast } = useToast();
  const track = useTrack();
  const imageRef = useRef<HTMLDivElement>(null);
  const players = useMemo(() => orderedPlayers(lineup.players ?? []), [lineup.players]);
  const [checkedPlayers, setCheckedPlayers] = useState<Set<number>>(new Set());
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    setCheckedPlayers(new Set());
  }, [lineup.id, lineup.players]);

  const totalCost = lineup.totalCost ?? players.reduce((sum, player) => sum + (player.price ?? 0), 0);
  const balance = Math.max(0, (lineup.budgetLimit ?? totalCost) - totalCost);
  const pitchPlayers = players.map((player, index) => ({
    id: player.playerId ?? index,
    name: player.name ?? "Jogador",
    nickname: player.nickname,
    position: player.position ?? "",
    expectedPoints: player.expectedPoints ?? undefined,
    price: player.price ?? undefined,
    isCaptain: player.playerId === lineup.captainPlayerId,
    club: { abbreviation: player.clubAbbr ?? undefined },
  }));

  const copyList = async () => {
    try {
      await navigator.clipboard.writeText(buildClipboardText(lineup, players));
      track("lineup_copied");
      toast({ title: "Lista copiada" });
    } catch {
      toast({
        title: "Não foi possível copiar",
        description: "Verifique a permissão da área de transferência e tente novamente.",
        variant: "destructive",
      });
    }
  };

  const shareImage = async () => {
    if (!imageRef.current || isSharing) return;
    setIsSharing(true);
    try {
      const blob = await elementToPngBlob(imageRef.current, {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        pixelRatio: 1,
      });
      const method = await shareOrDownloadPng(
        blob,
        `escalacao-rodada-${lineup.round ?? "x"}.png`,
        {
          title: "Minha escalação no Mitômetro",
          text: `Escalação da rodada ${lineup.round ?? ""}`,
        },
      );
      track("lineup_shared", { method });
      if (method === "download") toast({ title: "Imagem baixada" });
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") {
        toast({
          title: "Não foi possível gerar a imagem",
          description: "Tente novamente em alguns instantes.",
          variant: "destructive",
        });
      }
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs rounded-lg border-primary/40 bg-primary/5 text-primary hover:bg-primary hover:text-primary-foreground motion-safe:transition-all"
        >
          <ExternalLink className="w-3 h-3" />
          <span className="ml-1">Levar para o Cartola</span>
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto rounded-t-3xl px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:left-1/2 sm:right-auto sm:w-[min(720px,calc(100vw-2rem))] sm:-translate-x-1/2"
      >
        <SheetHeader className="pr-8 text-left">
          <SheetTitle>Levar para o Cartola</SheetTitle>
          <SheetDescription>
            Use a lista como guia para escalar no app oficial. O Mitômetro nunca pede suas credenciais Globo.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="list" className="mt-5">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list">Lista</TabsTrigger>
            <TabsTrigger value="image">Imagem</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-4 space-y-4">
            <div className="max-h-[48dvh] space-y-4 overflow-y-auto pr-1">
              {POSITION_ORDER.map((position) => {
                const group = players.filter((player) => player.position === position);
                if (!group.length) return null;
                return (
                  <section key={position} aria-labelledby={`export-${position}`}>
                    <h3 id={`export-${position}`} className="mb-2 text-xs font-bold text-primary">{position}</h3>
                    <div className="space-y-1.5">
                      {group.map((player, index) => {
                        const key = player.playerId ?? index;
                        const checked = checkedPlayers.has(key);
                        const name = `${player.nickname ?? player.name ?? "Jogador"}${player.playerId === lineup.captainPlayerId ? " (C)" : ""}`;
                        return (
                          <label
                            key={`${position}-${key}`}
                            className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 bg-card px-3 py-2.5"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => {
                                setCheckedPlayers((current) => {
                                  const next = new Set(current);
                                  if (value === true) next.add(key);
                                  else next.delete(key);
                                  return next;
                                });
                              }}
                              aria-label={`Marcar ${name} como escalado`}
                            />
                            <span className={`min-w-0 flex-1 ${checked ? "text-muted-foreground line-through" : ""}`}>
                              <span className="block truncate text-sm font-semibold">{name}</span>
                              <span className="block text-xs text-muted-foreground">
                                {player.clubAbbr ?? player.clubName ?? "Sem clube"}
                              </span>
                            </span>
                            <span className="shrink-0 text-sm font-mono tabular-nums">
                              {formatCartoletas(player.price ?? 0)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-xl bg-secondary/50 p-3 text-sm">
              <div>
                <span className="block text-xs text-muted-foreground">Total</span>
                <strong className="font-mono tabular-nums">{formatCartoletas(totalCost)}</strong>
              </div>
              <div>
                <span className="block text-xs text-muted-foreground">Saldo</span>
                <strong className="font-mono tabular-nums text-positive">{formatCartoletas(balance)}</strong>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={copyList}>
                <ClipboardCopy className="mr-2 h-4 w-4" />
                Copiar lista
              </Button>
              <Button asChild onClick={() => track("cartola_opened")}>
                <a href="https://cartola.globo.com" target="_blank" rel="noopener">
                  Abrir o Cartola
                  <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="image" className="mt-4 space-y-4">
            <div className="mx-auto w-full max-w-[432px] overflow-hidden rounded-2xl border border-border shadow-xl">
              <div
                ref={imageRef}
                className="flex aspect-[4/5] w-full flex-col bg-[#071510] p-[4%] text-white"
                style={{ containerType: "inline-size" }}
              >
                <div className="mb-[2.5%] flex items-end justify-between">
                  <div>
                    <p className="text-[2.2cqw] font-semibold text-[#8ce8bd]">MITÔMETRO</p>
                    <h3 className="text-[4.6cqw] font-bold leading-tight">
                      Minha escalação
                    </h3>
                  </div>
                  <p className="text-[2.4cqw] font-semibold">Rodada {lineup.round ?? "—"}</p>
                </div>

                <div className="flex min-h-0 flex-1 gap-[2.5%]">
                  <div className="flex min-w-0 flex-1 items-center justify-center [&>div]:mx-0 [&>div]:h-full [&>div]:w-auto [&>div]:max-w-none [&>div]:aspect-[2/3]">
                    <Pitch formation={lineup.formation ?? "4-3-3"} players={pitchPlayers} />
                  </div>

                  <div className="flex w-[29%] shrink-0 flex-col rounded-[2cqw] border border-white/10 bg-white/[0.04] p-[2%]">
                    <p className="mb-[5%] text-[2.1cqw] font-bold text-[#8ce8bd]">RESERVAS</p>
                    <div className="flex flex-1 flex-col justify-evenly gap-[1.5%]">
                      {(lineup.reserves ?? []).map((reserve, index) => (
                        <div
                          key={reserve.playerId ?? index}
                          className="rounded-[1.3cqw] border border-white/10 bg-black/25 px-[6%] py-[5%]"
                        >
                          <div className="flex items-start justify-between gap-[4%]">
                            <div className="min-w-0">
                              <p className="truncate text-[1.9cqw] font-bold leading-tight">
                                {reserve.nickname ?? reserve.name ?? "Reserva"}
                              </p>
                              <p className="mt-[2%] text-[1.45cqw] font-semibold text-white/55">
                                {reserve.position ?? "—"} · {reserve.clubAbbr ?? reserve.clubName ?? "—"}
                              </p>
                            </div>
                            {reserve.isLuxuryReserve && (
                              <span className="shrink-0 rounded-full bg-[#a855f7] px-[5%] py-[2%] text-[1.25cqw] font-bold">
                                ★
                              </span>
                            )}
                          </div>
                          <p className="mt-[4%] font-mono text-[1.55cqw] font-semibold tabular-nums text-[#58e6a1]">
                            {formatCartoletas(reserve.price ?? 0)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-[2.5%] flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[2cqw] text-white/65">Pontos esperados</p>
                    <p className="font-mono text-[5.5cqw] font-bold leading-none tabular-nums text-[#58e6a1]">
                      {(lineup.expectedPoints ?? 0).toFixed(1)}
                    </p>
                  </div>
                  <p className="pb-1 text-[2.4cqw] font-semibold text-white/80">mitometro.com.br</p>
                </div>
              </div>
            </div>
            <Button className="w-full" onClick={shareImage} disabled={isSharing}>
              {isSharing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
              {isSharing ? "Gerando imagem…" : "Compartilhar"}
            </Button>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}