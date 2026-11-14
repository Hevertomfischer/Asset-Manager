---
name: Production path-based routing
description: Only paths listed in an artifact's artifact.toml `paths` reach that service in production; everything else is served by the static SPA.
---

Production deployment routes by path prefix. The api-server receives only the prefixes in its `paths` list; cartola-intel is served **static** with rewrite `/* → /index.html` for everything else. A handler working directly in Express does not prove that the published proxy forwards that path.

**Why:** MCP OAuth endpoints (`/authorize`, `/token`, `/.well-known/*`) appeared "not deployed" — they never reached Express; republishing didn't help until the paths were added to the api-server service.

**How to apply:** When adding any server route outside `/api`, also add its path prefix to the api-server service `paths` in artifact.toml (via the temp-file + verifyAndReplaceArtifactToml flow) and republish.

Validate the asset chain as well as the HTML when Express serves built frontend
pages alongside the Vite preview.

**Why:** Correct OG HTML can still produce a blank page: the Vite fallback may
answer a hashed build-script request with HTTP 200 and `text/html`, not JavaScript.

**How to apply:** Ensure public HTML and its referenced hashed assets resolve
against the same build. Check script/CSS content types through the shared proxy,
and verify missing assets return 404 rather than SPA HTML.
