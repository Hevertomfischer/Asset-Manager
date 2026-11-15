---
name: Cartola scout semantics and historical repair
description: Why old scouts must be refetched and why victory scoring must not be inferred
---

Correct historical scouts by fetching the source again, not by swapping or remapping existing database columns with UPDATE.

**Why:** Previously stored columns mixed unrelated event meanings, and the meaning of aggregate shots changed; existing values cannot safely recover the original events.

**How to apply:** Historical repairs must explicitly refetch official final scores and raw scouts. Never swap old columns or reconstruct official points by summing scouts; preserve official zero and negative scores.

Victory (V) remains intentionally unscored until an approved scoring value is defined.

**Why:** The user approved preserving the existing scoring table without inventing a value for V. Older schema comments are not an authoritative scoring source.

**How to apply:** Preserve V during ingestion, but do not introduce a numerical score from assumptions or old comments. Treat scoring-value changes as a separate decision.
