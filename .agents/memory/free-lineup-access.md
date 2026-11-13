---
name: Free lineup access
description: Initial strategies, anonymous access and generation quota after Founder Access expires
---

Free users must start with an accessible strategy and their first generation must not open a Pro paywall. The only Free strategy is safe. Use the saved preference for entitled users, with an explicit URL strategy taking precedence.

**Why:** The user requires the generation flow to work after Founder Access expires; the historical cost-benefit default otherwise starts Free users on a paid strategy.

**How to apply:** Keep the stored preference intact when temporarily downgrading effective access. Normalize the auth response and initial selection, wait for auth resolution, and block paid-strategy clicks before sending generation requests.

Anonymous generation requires login by default; administrators may explicitly allow it. The default Free quota is one persisted generation per round and is configurable. Formation comparison remains outside this quota.

**Why:** The user requires a Google login invitation for visitors rather than unrestricted anonymous generation that bypasses per-account limits.

**How to apply:** Enforce policy in the backend independently of the selector, distinguish login-required responses from upgrade-required responses, and record generation-blocked reasons.
