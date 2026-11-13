---
name: Administrative access policy
description: Authorization boundaries between private admin data, script access and public synchronization health
---

All administrative API methods, including reads and preflight requests, require an admin-role session or a valid script secret header. Ordinary authenticated users receive 403; unauthenticated requests without a valid header receive 401.

**Why:** The user explicitly requires admin-only access because administrative reads expose user identities, feedback, funnel information and internal logs. Script access must remain usable independently of browser sessions.

**How to apply:** Do not reopen administrative read endpoints to support ordinary pages. Place public, non-sensitive aggregate health information in the public sync status response instead, without raw provider logs or configuration.

The ordinary user's dashboard must retain access to synchronization health even when Pro projections are unavailable.

**Why:** Data health is a public product feature, not administrative data or a Pro entitlement.

**How to apply:** Keep dashboard status independent from private admin hooks and Pro-only projection requests.
