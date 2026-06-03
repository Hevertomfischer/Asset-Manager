---
name: Swap simulation design
description: Architecture of the lineup swap simulator (POST /lineup/simulate + SwapSimulator UI)
---

## Rule
POST /api/lineup/simulate lives in routes/lineup.ts. All validation logic is in
services/swapValidation.ts (pure, no DB). Invalid swaps return HTTP 200 with
`{ valid: false, reason: "..." }` — NOT an HTTP error — so the before metrics
are always available for display.

**Why:** The UI always wants to show the "before" state even when the swap is
invalid (to explain what the team looks like without the swap).

## UI design
SwapSimulator.tsx is a shadcn Sheet (side="right") with two internal phases:
- "select": candidate list (useGetPlayers filtered by position, excluding
  current lineup members, sorted by expectedPoints). Auto-simulates on click.
- "result": Before × Depois comparison table with color-coded DeltaCell.
  Invalid → red alert with API reason string.

**Pro gate:** checked in Lineup component (handleSwapRequest), not inside
SwapSimulator. Free users get openPaywall() immediately; sheet never opens.

## Key decisions
- SwapSimulator is conditionally rendered (not just hidden), so useGetPlayers
  only fires when a player is clicked — no need for `enabled` option.
- useGetPlayers second-arg `query.enabled` causes TS error because generated
  types require queryKey. Solution: conditional first param instead.
- onApply callback signature: (outId, inPlayer: Player, after: LineupMetrics)
  — parent Lineup converts Player → LineupPlayer and patches currentLineup state.
