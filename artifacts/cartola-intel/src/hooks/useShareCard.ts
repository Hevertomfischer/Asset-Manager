import { useRef, useState } from "react";
import { useTrack } from "./useTrack";
import { downloadBlob, elementToPngBlob } from "@/lib/shareImage";

/**
 * Hook reutilizável para gerar e baixar um card de compartilhamento via html-to-image.
 *
 * @param ref       - Ref apontando para o elemento HTML a capturar (off-screen).
 * @param filename  - Nome do arquivo PNG. Pode ser string fixa ou função chamada no momento do share.
 * @param cardType  - Identificador do tipo de card para analytics (share_clicked / share_completed).
 */
export function useShareCard(
  ref: React.RefObject<HTMLElement | null>,
  filename: string | (() => string),
  cardType: string,
) {
  const [isSharing, setIsSharing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const track = useTrack();

  async function share() {
    if (!ref.current) return;
    setErrorMsg(null);
    setIsSharing(true);
    track("share_clicked", { cardType });
    try {
      const blob = await elementToPngBlob(ref.current);
      const name = typeof filename === "function" ? filename() : filename;
      downloadBlob(blob, name);
      track("share_completed", { cardType });
    } catch (err) {
      console.error("[useShareCard]", cardType, err);
      setErrorMsg("Não foi possível gerar a imagem. Tente novamente.");
    } finally {
      setIsSharing(false);
    }
  }

  return { share, isSharing, errorMsg };
}
