---
name: Cartola scout semantics and historical repair
description: Why old scouts must be refetched and why victory scoring must not be inferred
---

Correct historical scouts by fetching the source again, not by swapping or remapping existing database columns with UPDATE.

**Why:** The user explicitly reserved resynchronization for a separate request. Previously stored columns mixed unrelated event meanings, and the meaning of aggregate shots changed; existing values cannot safely recover the original events.

**How to apply:** Keep code corrections separate from historical repair and projection regeneration. Do not execute importers or trigger a resynchronization just to validate mapper changes.

Victory (V) remains intentionally unscored until an approved scoring value is defined.

**Why:** The user approved preserving the existing scoring table without inventing a value for V. Older schema comments are not an authoritative scoring source.

**How to apply:** Preserve V during ingestion, but do not introduce a numerical score from assumptions or old comments. Treat scoring-value changes as a separate decision.
