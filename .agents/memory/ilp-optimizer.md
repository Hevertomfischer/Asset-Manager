---
name: ILP lineup optimizer
description: Architecture and key decisions for the ILP-based lineup selector in api-server.
---

## Rule
`lineupOptimizer.ts` now delegates team selection to `solveLineupILP()` in `ilpSolver.ts`. The greedy loop was removed entirely.

## Why
ILP gives a provably-optimal lineup under the same constraints (formation, budget, club cap, 1/club-pos, opponent, captain). The greedy was myopic — budget lookahead only reserved the minimum cost, not the optimal allocation.

## How to apply
- All pure scoring functions (`getScoringFn`, `samplePenalty`, etc.) live unchanged in `lineupOptimizer.ts`.
- `computeCaptainScore()` mirrors `selectCaptain` sort key as a scalar value — passed to ILP as `captainScore` on each `IlpCandidate`.
- `solveLineupILP()` is a pure function (no DB) — fully unit-testable with synthetic data.
- **Library**: `javascript-lp-solver` imported via `createRequire(import.meta.url)` because api-server is ESM (`"type":"module"`) and the package is CJS.
- **Pre-filter**: top 25 by strategy score + cheapest 5 per position = ≤30 per position before building the model. Keeps solve time < 200ms.
- **Captain objective**: `(captainScore + eligibilityBonus) × CAPTAIN_EPSILON` where `CAPTAIN_EPSILON=1e-3` and `eligibilityBonus=1_000_000` for `gamesPlayed ≥ 3`. Ensures eligible players are always preferred; never affects team selection.
- **c_i ≤ x_i** encoded as shared constraint row `cx_{id}: { max:0 }` with x contributing -1 and c contributing +1.
- **Vitest**: `pnpm --filter @workspace/api-server run test`. Config at `artifacts/api-server/vitest.config.ts`. Tests in `src/__tests__/ilpOptimizer.test.ts` (8 tests, all pure in-memory).
- **selectCaptain** kept as fallback if ILP returns `captainId=null` (should never happen in normal operation).
