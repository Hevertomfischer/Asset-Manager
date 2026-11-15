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

Unavailable connector credentials do not prove that native Git is disconnected.
Replit's secure Git proxy can remain usable independently of connector SDK access.

**Why:** Native Git successfully fetched the repository and completed a push
dry-run while the attached connector withheld its SDK credentials.

**How to apply:** Check native Git connectivity before requesting another
connection. A successful push dry-run does not prove GitHub will accept changes
to workflow files; distinguish preflight success from an actual completed push.
