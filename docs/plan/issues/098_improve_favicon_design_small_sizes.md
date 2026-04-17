# GitHub Issue #98: Improve favicon design for better rendering at small sizes

**Issue:** [#98](https://github.com/denhamparry/djrequests/issues/98)
**Status:** Planning
**Date:** 2026-04-17
**Labels:** enhancement

## Problem Statement

The current favicon renders poorly in browser tabs at the typical 16–32px size.
The design is hard to read and does not give the site a recognisable identity.

### Current Behavior

- `public/favicon.svg` is an 87KB file that is *not* a real vector graphic —
  it is an `<svg>` wrapper around a base64-encoded PNG (500×500 raster). At
  16–32px, the browser rasterises a down-scaled version of that PNG, producing
  a blurry, detail-heavy icon.
- The derived raster assets (`favicon.ico`, `favicon-96x96.png`,
  `apple-touch-icon.png`, `web-app-manifest-192x192.png`,
  `web-app-manifest-512x512.png`) all appear to share the same detailed source
  artwork, so they suffer from the same legibility loss at small sizes.
- The site has no strong tab-level identity on either light or dark browser
  chrome.

### Expected Behavior

- A bold, high-contrast silhouette that remains legible at 16×16.
- A true SVG source (vector paths only, no embedded raster), so the tab icon
  stays crisp on high-DPI displays and at any rasterisation size.
- Light-/dark-mode awareness in `favicon.svg` via `prefers-color-scheme` so the
  icon looks deliberate on both light and dark browser tab chrome.
- All derived raster sizes regenerated consistently from the same source.

## Current State Analysis

### Relevant Code/Config

- **`index.html`** — favicon wiring (already correct, no changes needed):

  ```html
  <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="shortcut icon" href="/favicon.ico" />
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
  <link rel="manifest" href="/site.webmanifest" />
  <meta name="theme-color" content="#1a1a1a" />
  ```

- **`public/site.webmanifest`** — already uses `#1a1a1a` for both
  `theme_color` and `background_color`, and marks the 192/512 icons as
  `maskable`. The dark palette matches the site's existing tone.

- **`public/favicon.svg`** — 87KB raster-in-SVG (the root cause of small-size
  blur). Will be replaced with a true vector SVG.

### Related Context

- **Prior plan:** `docs/plan/issues/011_add_squirrel_favicon_based_on_site_logo.md`
  introduced the current squirrel-based favicon set. That plan solved the
  "no favicon" problem; this plan solves the "favicon doesn't scale" problem
  that emerged because the source artwork was a raster crest, not a
  silhouette.
- **Source logo:** `src/squirrels.jpeg` — a detailed Rhiwbina R.F.C. crest
  with text. The text and fine detail are what fail at 16px.

### Tooling available in this repo's dev environment

- `magick` / `convert` (ImageMagick) are on PATH — sufficient to rasterise SVG
  → PNG and to build multi-resolution `.ico`. No new dependencies required.

## Solution Design

### Approach

1. **Replace `favicon.svg` with a true vector silhouette.** Hand-author a
   small, minimal SVG using simple `<path>` shapes (no embedded raster).
   The silhouette keeps the existing squirrel identity but simplifies it to
   a chunky, high-contrast form that survives down-scaling to 16×16.
2. **Add light/dark awareness** in the SVG via a `<style>` block with a
   `@media (prefers-color-scheme: dark)` rule. The icon fill flips between
   a dark glyph (for light browser chrome) and a light glyph (for dark
   browser chrome), while the background stays transparent so the tab
   colour shows through.
3. **Regenerate all raster variants** from the new SVG via ImageMagick,
   ensuring all sizes share one source of truth. For raster variants the
   background stays `#1a1a1a` (matches `theme_color`) with a white glyph —
   raster files can't respond to `prefers-color-scheme`, so we pick the
   version that works on both light and dark tab backgrounds (white glyph
   on dark tile is the safer default, and matches the existing PWA
   appearance).
4. **Leave `site.webmanifest` colours unchanged.** `#1a1a1a` remains the
   correct theme/background colour given the raster tile choice above.
   Reviewed and kept as-is (no change).

### Why a silhouette instead of redrawing the crest

At 16×16 there are only 256 pixels. Text, fine strokes, and small internal
details cannot be represented. The industry-standard technique (GitHub,
Spotify, Apple Music, etc.) is a single bold glyph on a solid field. We keep
the squirrel motif for continuity with prior branding (issue #11) but drop
the text ring and simplify internal detail.

### Trade-offs considered

- **Switch motif to headphones / turntable / musical note** — more literal
  for "DJ requests," but breaks continuity with the existing Rhiwbina
  Squirrels branding that issue #11 deliberately introduced. Rejected.
- **Keep the current raster-in-SVG and just regenerate at higher quality** —
  does not fix the root cause (detail density too high for 16px). Rejected.
- **Use an online favicon generator (realfavicongenerator.net)** — would
  work but adds an out-of-repo manual step that is hard to reproduce on
  another machine. We have ImageMagick locally, so we can keep the pipeline
  reproducible. Rejected in favour of local tooling.

### Benefits

- Crisp tab icon at all sizes on all DPIs (true vector primary source).
- Better legibility in narrow-tab and pinned-tab scenarios.
- Reproducible raster pipeline: any future tweak to the silhouette
  regenerates all sizes from one command.
- Preserves existing brand identity (still a squirrel).

## Implementation Plan

### Step 1: Author the new vector `favicon.svg`

**File:** `public/favicon.svg` (replace existing 87KB raster-wrapper).

**Content:** A small, hand-authored SVG containing:

- `viewBox="0 0 32 32"` — authored at the target small-tab size so every
  path decision is made with 16–32px legibility in mind.
- A single chunky squirrel silhouette path (tail curl, body, ear, eye
  cutout). No text, no fine detail.
- A `<style>` block with `prefers-color-scheme` handling:

  ```xml
  <style>
    .glyph { fill: #1a1a1a; }
    @media (prefers-color-scheme: dark) {
      .glyph { fill: #ffffff; }
    }
  </style>
  ```

- The glyph path tagged `class="glyph"`, background transparent.

**Testing:**

- Open `public/favicon.svg` directly in a browser at native size, confirm
  it renders as a solid shape (no raster blur, no "image" element in devtools).
- Shrink to 16×16 in a tab and confirm the silhouette is still recognisable.

### Step 2: Regenerate raster variants from the new SVG

**Files:**

- `public/favicon-96x96.png`
- `public/apple-touch-icon.png` (180×180)
- `public/web-app-manifest-192x192.png`
- `public/web-app-manifest-512x512.png`
- `public/favicon.ico` (contains 16, 32, 48)

**Approach:** Use ImageMagick to rasterise the new SVG onto a `#1a1a1a`
background with the light glyph variant (matching current PWA tile
appearance and `theme_color`). For the `.ico`, generate 16/32/48 PNG tiles
from the same SVG and combine them.

Example commands (exact flags finalised during implementation):

```bash
# Render the light-glyph-on-dark variant at a high resolution first,
# then downscale for crispness (ImageMagick SVG → PNG).
magick -background '#1a1a1a' -density 1024 public/favicon.svg \
  -resize 512x512 public/web-app-manifest-512x512.png
magick -background '#1a1a1a' -density 1024 public/favicon.svg \
  -resize 192x192 public/web-app-manifest-192x192.png
magick -background '#1a1a1a' -density 1024 public/favicon.svg \
  -resize 180x180 public/apple-touch-icon.png
magick -background '#1a1a1a' -density 1024 public/favicon.svg \
  -resize 96x96  public/favicon-96x96.png

# Multi-resolution .ico from three PNG tiles
magick -background '#1a1a1a' -density 1024 public/favicon.svg \
  -resize 16x16  /tmp/fav-16.png
magick -background '#1a1a1a' -density 1024 public/favicon.svg \
  -resize 32x32  /tmp/fav-32.png
magick -background '#1a1a1a' -density 1024 public/favicon.svg \
  -resize 48x48  /tmp/fav-48.png
magick /tmp/fav-16.png /tmp/fav-32.png /tmp/fav-48.png public/favicon.ico
```

Because ImageMagick rasterises the SVG *before* applying
`prefers-color-scheme` (it has no concept of it), we render the white-glyph
variant for the raster tiles by temporarily overriding the fill during
rasterisation — either by passing a variant SVG through stdin, or by
authoring the SVG so its default fill (white) is what raster tools pick up
and letting the CSS media query only affect in-browser rendering.

**Testing:**

- `file public/favicon.ico` reports `MS Windows icon resource - 3 icons,
  16x16, 32x32, 48x48`.
- Each PNG opens and shows the silhouette centred, no transparent padding
  issues, no fringing.

### Step 3: Confirm `site.webmanifest` colours still match

**File:** `public/site.webmanifest`

**Changes:** None expected. The chosen tile background `#1a1a1a` already
matches `theme_color` and `background_color`. Document this decision in the
plan rather than editing the file. If during step 2 we decide to shift the
tile colour, update both keys here to match.

**Testing:** `cat public/site.webmanifest` sanity-check.

### Step 4: Manual cross-browser verification

**What:** Load the built site locally and verify the tab icon renders as
intended.

**How:**

```bash
npm run build
npm run preview
```

Open `http://localhost:4173` in:

- Chrome (light + dark OS theme)
- Safari (light + dark OS theme)
- Firefox (light + dark OS theme)

Plus, on an iOS device, use "Add to Home Screen" and confirm the
apple-touch-icon renders without black bars or scaling artefacts.

Record observations in the PR body (acceptance criteria checklist).

## Testing Strategy

### Unit Testing

Not applicable — favicon assets are static files with no runtime logic to
unit-test. The test suite is unaffected; `npm run test:unit` should continue
to pass unchanged.

### Integration Testing

**Test Case 1: SVG is vector, not raster**

1. Open `public/favicon.svg` in a text editor.
2. Expected: file is < 5KB, contains `<path>` elements, contains **no**
   `<image>` element and no `data:image/png;base64,` payload.

**Test Case 2: `.ico` contains multiple resolutions**

1. Run: `file public/favicon.ico`
2. Expected output contains `16x16`, `32x32`, and `48x48`.

**Test Case 3: PNG dimensions match filenames**

1. For each PNG, run: `magick identify <file>`
2. Expected: `favicon-96x96.png` is 96×96,
   `apple-touch-icon.png` is 180×180,
   `web-app-manifest-192x192.png` is 192×192,
   `web-app-manifest-512x512.png` is 512×512.

**Test Case 4: Build still succeeds**

1. Run: `npm run build`
2. Expected: build completes; `dist/` contains all favicon assets.

### Regression Testing

- Existing unit and e2e tests should continue to pass unchanged
  (`npm run test:unit`, `npm run test:e2e`) — favicon changes are
  orthogonal to app logic.
- `site.webmanifest` remains valid JSON and references existing files.
- `index.html` is unchanged (wiring was already correct per issue #11).

## Success Criteria

- [ ] `public/favicon.svg` is a true vector SVG (no embedded raster, < 5KB).
- [ ] `public/favicon.svg` includes `prefers-color-scheme` handling for
      light and dark tab chrome.
- [ ] `public/favicon.ico` is a multi-resolution ICO (16/32/48).
- [ ] `public/favicon-96x96.png` is 96×96.
- [ ] `public/apple-touch-icon.png` is 180×180.
- [ ] `public/web-app-manifest-192x192.png` is 192×192.
- [ ] `public/web-app-manifest-512x512.png` is 512×512.
- [ ] All raster variants visually share the same silhouette as the SVG.
- [ ] `site.webmanifest` theme/background colours reviewed; updated if
      needed to match the new tile colour.
- [ ] Verified in Chrome, Safari, and Firefox (light + dark) that the icon
      is legible and crisp.
- [ ] iOS "Add to Home Screen" renders the apple-touch-icon correctly.
- [ ] `npm run build` succeeds.
- [ ] Pre-commit hooks pass.

## Files Modified

1. `public/favicon.svg` — replaced with hand-authored vector SVG using
   `prefers-color-scheme`.
2. `public/favicon.ico` — regenerated as multi-resolution (16/32/48) ICO.
3. `public/favicon-96x96.png` — regenerated from new SVG.
4. `public/apple-touch-icon.png` — regenerated from new SVG at 180×180.
5. `public/web-app-manifest-192x192.png` — regenerated from new SVG.
6. `public/web-app-manifest-512x512.png` — regenerated from new SVG.
7. `public/site.webmanifest` — reviewed; update only if tile colour changes.
8. `docs/plan/issues/098_improve_favicon_design_small_sizes.md` — this
   plan document.

## Related Issues and Tasks

### Depends On

- None.

### Blocks

- None.

### Related

- [#11 — Add squirrel favicon based on site logo](https://github.com/denhamparry/djrequests/issues/11)
  (established the current favicon set; this issue refines its scalability).

### Enables

- A cleaner pinned-tab / bookmark appearance.
- Future light-mode site design (the SVG will already adapt).

## References

- [GitHub Issue #98](https://github.com/denhamparry/djrequests/issues/98)
- [MDN: `<link rel="icon">`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/link)
- [MDN: `prefers-color-scheme` in SVG](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme)
- Prior plan: `docs/plan/issues/011_add_squirrel_favicon_based_on_site_logo.md`

## Notes

### Key Insights

- The root cause is that `favicon.svg` is not actually vector — it is a
  raster PNG wrapped in an SVG. Replacing it with a true vector silhouette
  is the single highest-impact change.
- Raster tiles (PNG/ICO) cannot respond to `prefers-color-scheme`; only the
  SVG can. That is acceptable because browsers prefer the SVG entry when
  available (`<link rel="icon" type="image/svg+xml" ...>`), and rasters are
  only used as fallbacks.

### Alternative Approaches Considered

1. **Redraw at higher resolution, keep raster source** — does not solve
   the 16px legibility problem (detail density is the issue, not
   resolution). ❌
2. **Switch motif to headphones/turntable/music note** — more on-theme for
   "DJ requests" but breaks the Rhiwbina-Squirrels continuity issue #11
   established. ❌
3. **Use an online favicon generator** — workable but adds a
   non-reproducible manual step. ❌
4. **Hand-author vector SVG + regenerate rasters with ImageMagick** —
   reproducible, keeps brand continuity, fixes root cause. ✅

### Best Practices

- Author favicons at `viewBox="0 0 32 32"` so small-tab decisions are
  front-of-mind from the first stroke.
- Keep the SVG under 5KB; favicons should not be a perceivable network
  cost.
- Re-run the ImageMagick regeneration commands as a single shell block
  when updating the SVG so raster variants never drift from source.
