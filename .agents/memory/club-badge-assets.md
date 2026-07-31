---
name: Club badge assets pipeline
description: Where club badge/jersey images live in cartola-intel and how to process uploaded AI-generated badges.
---

# Club badge assets

- Badges are served from TWO directories in `artifacts/cartola-intel/public/`:
  - `badges/{ABBR}.png` — used by `getBadgeUrl()` overrides (`CLUB_BADGE_OVERRIDES` in `lib/clubColors.ts`) for cards/tables/pages.
  - `jerseys/{ABBR}.png` — used by FieldView (pitch view), gated by the `JERSEY_PNG_CLUBS` allowlist inside `FieldView.tsx`. New clubs must be added to that set or the SVG fallback renders.
- Override paths are relative (no leading slash) and prefixed with `import.meta.env.BASE_URL` — root-relative paths 404 under the `/cartola-intel` sub-path.

## Processing uploaded AI badge images
AI-generated badges come with gray gradient backgrounds and faint drop shadows extending to the edges.
- `-transparent <color>` misses gradients; use corner floodfill: `-alpha set -fuzz 12% -fill none -draw "alpha 0,0 floodfill"` (all 4 corners).
- `-trim` alone barely crops because near-invisible shadow reaches the edges. Compute the bbox of substantially opaque content instead: `bbox=$(magick img -alpha extract -threshold 50% -format "%@" info:)` then `-crop "$bbox" +repage`.
- Target: square-ish ~1024 for badges/, 240x240 for jerseys/ (matches existing files).

**Why:** shields that occupy only ~70% of the frame look visibly smaller than other clubs in circular Avatars; CSS `transform: scale()` on AvatarImage is clipped by the Avatar's `overflow-hidden` (needs `overflow-visible` on the Avatar).
