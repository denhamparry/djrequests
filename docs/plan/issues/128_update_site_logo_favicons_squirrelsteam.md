# GitHub Issue #128: update site logo and favicons from squirrelsteam assets

**Issue:** [#128](https://github.com/denhamparry/djrequests/issues/128)
**Status:** Complete
**Date:** 2026-06-06

## Problem Statement

The DJ Requests site should use the current Rhiwbina Squirrels icon artwork
from `github.com/denhamparry/squirrelsteam` for both the visible site logo and
the browser/PWA icon set.

The source repository is already cloned locally at:

```text
/Users/lewis/git/denhamparry/squirrelsteam/main
```

Relevant source files:

```text
src/assets/logo/squirrel-mark.svg
src/assets/logo/rhiwbina-rfc-logo.svg
```

## Acceptance Criteria

- The site header/logo uses the updated `squirrelsteam` squirrel artwork.
- Browser favicon, Apple touch icon, and web app manifest icons render from the
  updated artwork.
- Generated icon files are committed in the expected `public/` paths.
- Local build passes after the asset update.

## Current State Analysis

- `src/App.tsx` imports `../squirrels.jpeg` and renders it as the header logo.
- `public/favicon.svg` is the source for generated raster favicons, but it is
  currently a text-based `14/15` mark rather than the `squirrelsteam` squirrel
  icon.
- `scripts/build-favicons.sh` regenerates the raster favicon set from
  `public/favicon.svg`.
- `public/site.webmanifest` already references the expected 192px and 512px
  manifest icons and uses the same dark theme/background colour as the favicon
  build script.

## Implementation Steps

1. Add the `squirrelsteam` squirrel mark SVG to this app as a local source
   asset.
2. Update `src/App.tsx` so the header image imports the new local SVG instead
   of the legacy `squirrels.jpeg`.
3. Replace `public/favicon.svg` with the same squirrel mark artwork, adapted
   for browser favicon usage while preserving light/dark colour handling.
4. Update `scripts/build-favicons.sh` so non-square source artwork is centered
   on exact square output canvases before each PNG/ICO file is written.
5. Run `npm run favicons:build` to regenerate:
   - `public/favicon-96x96.png`
   - `public/favicon.ico`
   - `public/apple-touch-icon.png`
   - `public/web-app-manifest-192x192.png`
   - `public/web-app-manifest-512x512.png`
6. Confirm `public/site.webmanifest` still points at the regenerated manifest
   icon paths and that no manifest metadata changes are needed.

## Files Expected To Change

- `docs/plan/issues/128_update_site_logo_favicons_squirrelsteam.md`
- `src/App.tsx`
- `src/assets/squirrel-mark.svg`
- `scripts/build-favicons.sh`
- `public/favicon.svg`
- `public/favicon-96x96.png`
- `public/favicon.ico`
- `public/apple-touch-icon.png`
- `public/web-app-manifest-192x192.png`
- `public/web-app-manifest-512x512.png`

## Validation Steps

```bash
npm run favicons:build
magick identify public/favicon-96x96.png public/apple-touch-icon.png \
  public/web-app-manifest-192x192.png public/web-app-manifest-512x512.png
file public/favicon.ico
npm run build
npm run lint
```

## Risks And Open Questions

- The `squirrelsteam` SVG is detailed. It is a direct requested asset, but very
  small 16px favicon renderings may be less readable than the prior simplified
  mark.
- `squirrels.jpeg` and `squirrels_fav.png` are not removed in this issue to
  avoid unrelated asset cleanup unless later confirmed unused across the repo.
