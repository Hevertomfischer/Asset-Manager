---
name: User teams feature
description: Schema, lib extraction, and API routes for user_teams/user_team_rounds/user_team_round_players.
---

## Tables
- `user_teams` (id, userId→users, name, createdAt)
- `user_team_rounds` (id, userTeamId→user_teams, round, budgetUsed, captainPlayerId, coachPlayerId, source, lineupSuggestionId nullable→lineup_suggestion, createdAt)
- `user_team_round_players` (id, userTeamRoundId→user_team_rounds, playerId, position, price)
- Schema file: `lib/db/src/schema/userTeams.ts`, exported from `lib/db/src/schema/index.ts`
- Migration applied via raw SQL (`lib/db/drizzle/0002_add_user_teams.sql`) — do NOT use `drizzle-kit push` because it tries to drop the `session` table.

## hindsightOptimal lib
- `src/lib/hindsightOptimal.ts` in api-server
- Exports: `greedyHindsight(candidates, budget)`, `computeEfficiency(candidates, budget, ourActualPoints)`
- Returns `{ optimalActualPoints, ourActualPoints, efficiencyPct }`
- history.ts still defines its own local `greedyHindsight` — both must stay in sync if logic changes.

## Routes
- `GET /api/user-teams` — lists teams for logged-in user with seasonPoints + roundCount
- `GET /api/user-teams/:id/rounds` — round history with per-round efficiency via computeEfficiency
- `POST /api/user-teams` — creates team; free users limited to 1 (same pattern as lineup/generate)
- Registered in `routes/index.ts` via `router.use(userTeamsRouter)`

## @workspace/db rebuild pattern
- Package uses `composite: true` + `emitDeclarationOnly` → produces `.d.ts` in `dist/`
- After adding new schema exports, run: `pnpm --filter @workspace/db exec tsc --build`
- Without this, downstream packages see "has no exported member" TS errors even though source is correct.

**Why:** The package.json exports point to `.ts` source, but TypeScript project references consume the compiled `.d.ts`. The source change alone is invisible to consumers until `tsc --build` runs.
