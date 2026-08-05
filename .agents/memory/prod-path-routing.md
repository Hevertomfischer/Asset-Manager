---
name: Production path-based routing
description: Only paths listed in an artifact's artifact.toml `paths` reach that service in production; everything else is served by the static SPA.
---

Production deployment routes by path prefix. The api-server receives only the prefixes in its `paths` list; cartola-intel is served **static** with rewrite `/* → /index.html` for everything else. Any Express route mounted outside those prefixes works in dev (Express serves everything) but silently returns the SPA in production.

**Why:** MCP OAuth endpoints (`/authorize`, `/token`, `/.well-known/*`) appeared "not deployed" — they never reached Express; republishing didn't help until the paths were added to the api-server service.

**How to apply:** When adding any server route outside `/api`, also add its path prefix to the api-server service `paths` in artifact.toml (via the temp-file + verifyAndReplaceArtifactToml flow) and republish.
