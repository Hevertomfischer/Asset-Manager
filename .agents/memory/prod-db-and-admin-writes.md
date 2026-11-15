---
name: Production DB is separate; how to mutate prod data
description: Dev and production use SEPARATE Postgres databases; privileged prod writes go through the prod API, not direct SQL.
---

# Dev and production are SEPARATE databases

A row written via the dev DB does NOT appear in production, and vice versa.
Always verify prod state with `executeSql({ ..., environment: "production" })`
(read-only) before assuming a record exists.

**Why:** A user showed as "free" in the prod UI while a `pro` subscription
existed — but only in the dev DB. Prod had none. Hours were lost assuming a
shared DB.

# Mutating production data

`executeSql` against production is READ-ONLY. To change prod data you must go
through the deployed prod API (it has write access to its own DB) — e.g. an admin
HTTP endpoint — then redeploy and call it over HTTPS.

**Secret hygiene:** Do NOT use `setEnvVars(..., environment:"production")` for a
credential — it writes the value in PLAINTEXT into `.replit` (versioned). Treat
any value put there as compromised. Use a real secret store, or gate admin
mutations on session `role === "admin"` instead of a token.

**How to apply:** After a prod plan/role change, the frontend caches the value
from `/api/auth/me` per session — the user must re-login or hard-refresh to see it.

# Preserve the session table during development schema changes

Use pure SQL migrations, never `drizzle-kit push`, in this project.

**Why:** The user reported that schema push tries to delete the externally managed
`session` table. Losing it would invalidate sessions and disrupt authentication.

**How to apply:** Apply reviewed SQL only in development, rebuild DB declarations,
and let the managed Publish flow apply production schema differences.
