import { toPng } from "html-to-image";

export interface ShareImageOptions {
  width?: number;
  height?: number;
  pixelRatio?: number;
}

export async function elementToPngBlob(
  element: HTMLElement,
  options: ShareImageOptions = {},
): Promise<Blob> {
  const { width, height, pixelRatio = 2 } = options;
  const dataUrl = await toPng(element, {
    cacheBust: true,
    pixelRatio,
    width,
    height,
    style: width && height
      ? { width: `${width}px`, height: `${height}px` }
      : undefined,
  });
  const response = await fetch(dataUrl);
  return response.blob();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.download = filename;
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function shareOrDownloadPng(
  blob: Blob,
  filename: string,
  shareData: Pick<ShareData, "title" | "text"> = {},
): Promise<"native" | "download"> {
  const file = new File([blob], filename, { type: "image/png" });
  const canShareFile =
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] });

  if (canShareFile) {
    await navigator.share({ ...shareData, files: [file] });
    return "native";
  }

  downloadBlob(blob, filename);
  return "download";
}