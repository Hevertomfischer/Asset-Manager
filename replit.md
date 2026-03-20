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

- **Dashboard** (`/`) — Round status, top projections by position, diferenciais da rodada, armadilhas da rodada, risk alerts, data pipeline status
- **Players** (`/jogadores`) — Searchable/filterable player table with projections, club badges, position badges
- **Lineup Builder** (`/escalacao`) — Formation/strategy/budget selector, visual pitch display, save lineup (4 strategies)
- **Confrontos** (`/confrontos`) — Match-by-match difficulty analysis: offensive/defensive strength bars, xG (expected goals) from Gato Mestre articles, difficulty level (fácil/médio/difícil), recommended positions to exploit
- **System Admin** (`/admin`) — Projection weight sliders, sync controls, provider status, data collection logs

## API Endpoints

All endpoints under `/api`:

- `GET /api/healthz` — Health check
- `GET /api/round/current` — Current round + market status
- `GET /api/players` — Player list with filters (position, clubId, minPrice, maxPrice, probableOnly, minProjection, round)
- `GET /api/players/:id` — Player detail
- `GET /api/players/projections/current` — All projections for current round (sorted by recommendationScore)
- `GET /api/matches/current` — Current round matches
- `GET /api/matches/confrontos` — Match difficulty analysis (offensive/defensive strength, goal expectation, recommended positions)
- `GET /api/availability` — Player availability (playProbability, injury, suspension)
- `POST /api/lineup/generate` — Generate lineup (body: budget, formation, strategy [`safe`|`aggressive`|`cost-benefit`|`antimassa`], round?)
- `GET /api/lineup` — Saved lineups (filter by round)
- `POST /api/lineup/:id/save` — Save a lineup
- `GET /api/admin/providers/status` — Data provider status
- `POST /api/admin/sync/full` — Trigger full ETL sync
- `POST /api/admin/sync/market` — Trigger market-only sync
- `GET /api/admin/projection-weights` — Get configurable projection weights
- `POST /api/admin/projection-weights` — Update projection weights
- `POST /api/admin/recalculate-projections` — Recalculate projections for current round
- `GET /api/admin/logs` — Data collection logs (limit=20)
- `POST /api/admin/sync/xg` — Sync xG (expected goals) from Gato Mestre article URL for current round

## Data Providers

| Provider | Source | Data |
|---|---|---|
| `cartolaApiProvider` | api.cartola.globo.com | Players, clubs, market status |
| `cartolaStatusProvider` | api.cartola.globo.com/atletas/mercado | Player availability by status_id |
| `geProbablesProvider` | ge.globo.com | Probable starters (scraped HTML) |
| `gatoMestreProvider` | gatomestre.com.br | Player stats |
| `historicalCartolaProvider` | api.cartola.globo.com | Historical round scouts |

All providers: fetch → Zod validation → transform → snapshot save → upsert → log. On failure: use last snapshot, mark as degraded.

## Engines

- **availabilityEngine**: Calculates `playProbability`, `expectedMinutes`, `riskScore` per player based on status, probable lists, injury/suspension, recent minutes. Enriched by `cartolaStatusProvider` for structured availability data.
- **projectionEngine**: Multi-window form scoring (3/5/8 rounds weighted 40/35/25%), volatility (std deviation), position-specific scout re-scoring (GOL: saves/CS, ZAG: tackles/CS, LAT: assists/tackles, MEI: goals+assists, ATA: goals+shots). Outputs `expectedPoints`, `floorPoints`, `ceilingPoints`, `riskScore`, `formScore`, `valueScore`, `differentialScore`, `isTrap`, `recommendationScore`.
- **matchupScore** is data-driven: base home/away factor + momentum bonus from `aproveitamento` form array (V=+0.03, E=+0.01 per game, max +0.15) + opponent defensive weakness bonus (+0.05 if opponent `defensiveStrength < 0.4`).

## Lineup Optimizer

4 strategies:
- `safe` — high floor, minimizes risk
- `aggressive` — high ceiling, accepts volatility
- `cost-benefit` — best value/cartoleta ratio
- `antimassa` — diferencial players: high projection × (1 - popularity_normalized), avoids armadilhas

Captain is selected strategy-aware (for antimassa: best expected × (1 - pop×0.5)). Expected points include captain doubling (captainExpectedPointsDoubled). Respects: budget, formation, position limits, max 5 per club, 1 GK, 1 coach.

## Scheduled Jobs

- Every 6 hours: full ETL sync
- Every 2 hours: lightweight market status check

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. Root `tsconfig.json` lists all packages as project references.

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — only emit `.d.ts` files during typecheck

## Observability

Central logger at `artifacts/api-server/src/lib/logger.ts`. Usage:
```ts
const log = createLogger("my-tag");
log.info("message", { extra: "data" });
```
Level controlled via `LOG_LEVEL=debug|info|warn|error` env var.

## Resiliência

`artifacts/api-server/src/lib/circuitBreaker.ts`:
- `withCircuitBreaker(name, fn, options)` — opens after N failures, retries after `openDurationMs`
- `fetchWithRetry(name, fn, retries, delayMs)` — linear backoff retry

## Auth

`artifacts/api-server/src/middlewares/adminAuth.ts`:
- If `ADMIN_SECRET` env var is set, guards all `/admin/*` routes with `x-admin-secret` header check
- Middleware is a no-op if env var is not set (safe default)

## ML Preparação

`artifacts/api-server/src/engines/IProjectionEngine.ts` — interface que qualquer motor futuro deve implementar.
`artifacts/api-server/src/lib/featureExtractor.ts` — extrai PlayerFeatures padronizadas de dados brutos.

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
