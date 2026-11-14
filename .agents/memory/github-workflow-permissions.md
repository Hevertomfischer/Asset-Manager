---
name: GitHub workflow permissions
description: Distinguish repository access from permission to publish CI workflow files
---

When sending CI changes, check the OAuth `workflow` scope separately from
repository permissions. Repository admin access and the OAuth `repo` scope
do not authorize creating or updating GitHub Actions workflow files.

**Why:** An authorized push was rejected despite repository admin access because
the GitHub connection lacked the separate workflow permission.

**How to apply:** Inspect non-secret scope metadata, not credentials. Preserve
the requested workflow and branch isolation. If the integration reports
`canReconnect: false`, use the documented user-driven reconnection flow rather
than retrying the same push, removing CI, or requesting a token in chat.
