# Historical repair rollout

Production schema is managed by Publish. Do not run schema SQL against production,
do not use `drizzle-kit push`, and do not put migrations in startup or deploy hooks.
The journal lists every migration, including the staged 0008. Registration does
not mean it has been applied: do not run the entire journal during stage 1.

1. Apply **0007 only** to development; rebuild `@workspace/db` declarations.
   **0008 is deliberately not applied to development yet**: Publish introspects
   the actual development database, so the first publication must not add the
   unique index to the still-duplicated production table.
2. Publish. `locked_at` is added; old projections remain NULL (legacy).
3. As admin, POST `/api/admin/sync/closed-rounds` (or use the existing
   `x-admin-secret` script mode). GET the same path to monitor progress.
   This force-fetches all rounds preceding the official current round, upserts
   canonical final scores, removes old live-source rows, consolidates duplicate
   player/round records and calibrates weights only after every round succeeds.
   A failed job can be repeated safely. Never calibrate over a partial repair.
4. Check `status=completed`, investigate missing player mappings, verify a random
   official sample and read-only duplicate counts on production.
5. Once production duplicates are zero, apply **0008 to DEVELOPMENT only**,
   rebuild declarations and publish again. Publish applies the now-safe unique
   index to production. Do not use Publish's overwrite-data option.

The repository uses transaction-scoped player/round advisory locks and merges
duplicates during stage 1, without relying on the future index. The final index
protects other insert paths too. A failed or interrupted repair never marks
legacy projections as frozen or includes them in trusted performance.

Legacy training pairs may still be used to calibrate weights, as requested,
but are explicitly identified and are not prospective backtest evidence.
