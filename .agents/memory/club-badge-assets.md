---
name: Club badge assets pipeline
description: Where club badge/jersey images live in cartola-intel and how to process uploaded AI-generated badges.
---

# Club badge assets

- USER DECISION: AI-generated stylized jersey-shield images are used ONLY in the field view (escalação + reservas), served from `public/jerseys/{ABBR}.png`, gated by the `JERSEY_PNG_CLUBS` allowlist in `FieldView.tsx`. New clubs must be added to that set or the SVG fallback renders.
- Cards, tables, and pages must use the official Globo CDN crest (`club.badgeUrl` from the API). `CLUB_BADGE_OVERRIDES`/`CLUB_BADGE_SCALE` in `lib/clubColors.ts` are intentionally EMPTY — do not re-add jersey images there; the user rejected mixing them into player lists.
- `public/badges/` holds the processed 1024px sources; `jerseys/` holds 240px derivatives.
- Override paths are relative (no leading slash) and prefixed with `import.meta.env.BASE_URL` — root-relative paths 404 under the `/cartola-intel` sub-path.

## Processing uploaded AI badge images
AI-generated badges come with gray gradient backgrounds and faint drop shadows extending to the edges.
- `-transparent <color>` misses gradients; use corner floodfill: `-alpha set -fuzz 12% -fill none -draw "alpha 0,0 floodfill"` (all 4 corners).
- `-trim` alone barely crops because near-invisible shadow reaches the edges. Compute the bbox of substantially opaque content instead: `bbox=$(magick img -alpha extract -threshold 50% -format "%@" info:)` then `-crop "$bbox" +repage`.
- Target: square-ish ~1024 for badges/, 240x240 for jerseys/ (matches existing files).

**Why:** shields that occupy only ~70% of the frame look visibly smaller than other clubs in circular Avatars; CSS `transform: scale()` on AvatarImage is clipped by the Avatar's `overflow-hidden` (needs `overflow-visible` on the Avatar).
