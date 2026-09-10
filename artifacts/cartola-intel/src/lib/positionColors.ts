/** Single source of truth for player-position badge colors. */
export const POSITION_COLOR_CLASS: Record<string, string> = {
  GOL: "text-attention bg-attention/10 border-attention/30",
  ZAG: "text-differential bg-differential/10 border-differential/30",
  LAT: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  MEI: "text-purple-400 bg-purple-500/10 border-purple-500/30",
  ATA: "text-danger bg-danger/10 border-danger/30",
  TEC: "text-positive bg-positive/10 border-positive/30",
};

const DEFAULT_POSITION_COLOR = "text-muted-foreground bg-muted/10 border-border/30";

export function getPositionColor(pos: string): string {
  return POSITION_COLOR_CLASS[pos.toUpperCase()] ?? DEFAULT_POSITION_COLOR;
}