---
name: Formation comparison semantics
description: Product boundaries for comparing formation suggestions and counting generation usage
---

Compare suggestions produced by the user's selected strategy, not a new pure-points objective. “Melhor” means the highest projected points among the evaluated suggestions, with the captain bonus already included; it is not a guaranteed score or a global mathematical maximum.

**Why:** Each strategy deliberately optimizes a different balance of floor, ceiling, value and risk. Replacing that objective during comparison would make the recommendation inconsistent with normal generation.

**How to apply:** Keep budget, round, locks, exclusions and strategy identical across alternatives. Preserve these semantics when adding comparison metrics or changing the optimizer.

Comparing formations must not save suggestions/reserves or consume generation quota. Selecting a result changes the requested formation only; generating the team remains explicit and subject to existing plan limits.

**Why:** This is an evaluation step before choosing one team, not seven separate team generations.

**How to apply:** Preserve the separation between read-only evaluation and persisted generation. Keep free/Pro strategy and constraint limits enforced in both flows.
