# Cartola Intel

## Overview

Full-stack Cartola FC fantasy football intelligence app. Suggests the best lineup for each round using real data from the Cartola FC API and other sources.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Data fetching**: Axios + Cheerio
- **Scheduling**: node-cron

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/          # Express API server
│   ├── cartola-intel/       # React + Vite frontend (served at /)
│   │   └── src/
│   │       ├── pages/       # Dashboard, Players, Lineup, Admin
│   │       ├── components/  # AppLayout, Pitch (formation display)
│   │       └── hooks/       # use-custom-api.ts (React Query hooks)
│   └── api-server/          # Express API server
│       └── src/
│           ├── providers/   # Data providers (Cartola API, GE, GatoMestre, Historical)
│           ├── etl/         # ETL pipeline orchestrator
│           ├── engines/     # Availability + Projection engines
│           ├── optimizers/  # Lineup optimizer (3 strategies)
│           ├── repositories/# DB access layer
│           ├── routes/      # Express route handlers
│           ├── jobs/        # Cron jobs
│           └── config/      # Weights and formation config
├── lib/
│   ├── api-spec/            # OpenAPI spec + Orval codegen config
│   ├── api-client-react/    # Generated React Query hooks
│   ├── api-zod/             # Generated Zod schemas from OpenAPI
│   └── db/                  # Drizzle ORM schema + DB connection
│       └── src/schema/
│           ├── clubs.ts
│           ├── players.ts
│           ├── matches.ts
│           ├── playerAvailability.ts
│           ├── playerScoutRound.ts
│           ├── playerProjection.ts
│           ├── lineupSuggestion.ts
│           ├── roundSnapshot.ts
│           └── dataCollectionLog.ts
├── scripts/                 # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Frontend Pages

- **Dashboard** (`/`) — Round status, top projections by position, data pipeline status, quick sync button
- **Players** (`/players`) — Searchable/filterable player table with projections, club badges, position badges
- **Lineup Builder** (`/lineup`) — Formation/strategy/budget selector, visual pitch display, save lineup
- **System Admin** (`/admin`) — Projection weight sliders, sync controls, provider status, data collection logs

## API Endpoints

All endpoints under `/api`:

- `GET /api/healthz` — Health check
- `GET /api/round/current` — Current round + market status
- `GET /api/players` — Player list with filters (position, clubId, minPrice, maxPrice, probableOnly, minProjection, round)
- `GET /api/players/:id` — Player detail
- `GET /api/players/projections/current` — All projections for current round (sorted by recommendationScore)
- `GET /api/matches` — Matches (filter by round)
- `GET /api/availability` — Player availability (playProbability, injury, suspension)
- `POST /api/lineup/generate` — Generate lineup (body: budget, formation, strategy, round?)
- `GET /api/lineup` — Saved lineups (filter by round)
- `POST /api/lineup/:id/save` — Save a lineup
- `GET /api/admin/providers/status` — Data provider status
- `POST /api/admin/sync/full` — Trigger full ETL sync
- `POST /api/admin/sync/market` — Trigger market-only sync
- `GET /api/admin/projection-weights` — Get configurable projection weights
- `POST /api/admin/projection-weights` — Update projection weights
- `POST /api/admin/recalculate-projections` — Recalculate projections for current round
- `GET /api/admin/logs` — Data collection logs (limit=20)

## Data Providers

| Provider | Source | Data |
|---|---|---|
| `cartolaApiProvider` | api.cartola.globo.com | Players, clubs, market status |
| `geProbablesProvider` | ge.globo.com | Probable starters |
| `gatoMestreProvider` | gatomestre.com.br | Player stats |
| `historicalCartolaProvider` | api.cartola.globo.com | Historical round scouts |

All providers: fetch → Zod validation → transform → snapshot save → upsert → log. On failure: use last snapshot, mark as degraded.

## Engines

- **availabilityEngine**: Calculates `playProbability`, `expectedMinutes`, `riskScore` per player based on status, probable lists, injury/suspension, recent minutes
- **projectionEngine**: Calculates `expectedPoints`, `floorPoints`, `ceilingPoints`, `riskScore`, `formScore`, `matchupScore`, `valueScore`, `cleanSheetProbability`, `recommendationScore` using configurable weights (no AI)

## Lineup Optimizer

3 strategies: `safe` (high floor), `aggressive` (high ceiling), `cost-benefit` (value/cartoleta). Respects: budget, formation, position limits, max 5 per club, 1 GK, 1 coach.

## Scheduled Jobs

- Every 6 hours: full ETL sync
- Every 2 hours: lightweight market status check

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. Root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — only emit `.d.ts` files during typecheck

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Database Migrations (Development)

```bash
pnpm --filter @workspace/db run push
```

## First Sync

```bash
curl -X POST localhost:80/api/admin/sync/current-round
```
