# GitHub Issue #102: add npm script wrapping ImageMagick favicon regeneration

**Issue:** [#102](https://github.com/denhamparry/djrequests/issues/102)
**Status:** Planning
**Date:** 2026-04-17

## Problem Statement

The favicon regeneration pipeline — rasterising `public/favicon.svg`
into four PNGs plus a multi-resolution `favicon.ico` — currently lives
only inside the `docs/plan/issues/098_improve_favicon_design_small_sizes.md`
plan document. Future favicon tweaks require copy-pasting the
ImageMagick commands from the plan by hand.

### Current Behavior

- No `scripts/` directory exists in the repo.
- `package.json` has no favicon-build script.
- To regenerate favicons after editing `public/favicon.svg`, a
  contributor has to read the #98 plan, copy eight `magick` commands
  into a shell, and run them one-by-one.

### Expected Behavior

- A checked-in shell script (e.g. `scripts/build-favicons.sh`)
  reproduces the full raster pipeline from `public/favicon.svg`.
- An npm script `favicons:build` invokes the shell script.
- One command — `npm run favicons:build` — regenerates all five raster
  assets from the SVG source.
- Script documents the `magick` dependency and fails fast with a clear
  error message if it is missing.

## Current State Analysis

### Relevant Code/Config

- `public/favicon.svg` — hand-authored vector source (truth).
- `public/favicon.ico` — multi-resolution (16/32/48).
- `public/favicon-96x96.png` — 96×96.
- `public/apple-touch-icon.png` — 180×180.
- `public/web-app-manifest-192x192.png` — 192×192.
- `public/web-app-manifest-512x512.png` — 512×512.
- `package.json` — existing `scripts` block; no `scripts/` directory.
- `docs/plan/issues/098_improve_favicon_design_small_sizes.md` — contains
  the canonical ImageMagick invocations (see plan Step 2).

### Related Context

- Issue #98 introduced the current favicon pipeline (merged as
  `02f5e95`).
- Issue #102 is the nice-to-have follow-up from that PR's review.
- Tile background is `#1a1a1a` (matches `theme_color` in
  `public/site.webmanifest`).
- `.ico` must contain 16, 32, and 48 pixel tiles.

## Solution Design

### Approach

Create `scripts/build-favicons.sh` that mirrors the ImageMagick commands
from the #98 plan, plus a `favicons:build` entry in `package.json`'s
`scripts` block that calls the shell script. Keep the script minimal
and POSIX-shell-compatible; fail fast if `magick` (ImageMagick v7) is
not on `PATH`.

### Implementation

Shell script structure:

```bash
#!/usr/bin/env bash
# Regenerate all raster favicon variants from public/favicon.svg.
set -euo pipefail

if ! command -v magick >/dev/null 2>&1; then
  echo "error: 'magick' (ImageMagick v7) not found on PATH" >&2
  echo "install with: brew install imagemagick" >&2
  exit 1
fi

SVG=public/favicon.svg
BG='#1a1a1a'
DENSITY=1024

magick -background "$BG" -density "$DENSITY" "$SVG" \
  -resize 512x512 public/web-app-manifest-512x512.png
magick -background "$BG" -density "$DENSITY" "$SVG" \
  -resize 192x192 public/web-app-manifest-192x192.png
magick -background "$BG" -density "$DENSITY" "$SVG" \
  -resize 180x180 public/apple-touch-icon.png
magick -background "$BG" -density "$DENSITY" "$SVG" \
  -resize 96x96  public/favicon-96x96.png

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
magick -background "$BG" -density "$DENSITY" "$SVG" \
  -resize 16x16 "$tmpdir/fav-16.png"
magick -background "$BG" -density "$DENSITY" "$SVG" \
  -resize 32x32 "$tmpdir/fav-32.png"
magick -background "$BG" -density "$DENSITY" "$SVG" \
  -resize 48x48 "$tmpdir/fav-48.png"
magick "$tmpdir/fav-16.png" "$tmpdir/fav-32.png" "$tmpdir/fav-48.png" \
  public/favicon.ico

echo "favicons regenerated from $SVG"
```

`package.json` script addition:

```json
"favicons:build": "bash scripts/build-favicons.sh"
```

### Benefits

- Single source of truth for the raster pipeline.
- One command regenerates all icons after SVG edits.
- Missing dependency produces a clear error, not cryptic shell failures.
- No new runtime dependencies (uses `magick` that #98 already required).

## Implementation Plan

### Step 1: Create `scripts/build-favicons.sh`

**File:** `scripts/build-favicons.sh` (new).

**Changes:**

- Contents as shown in "Implementation" above.
- Use `set -euo pipefail` for strict failure modes.
- Check for `magick` on `PATH`; fail fast with a helpful message.
- Use `mktemp -d` + `trap` for the intermediate 16/32/48 PNGs so no
  junk is left in `public/` or `/tmp`.
- Make executable via `chmod +x`.

### Step 2: Wire `favicons:build` into `package.json`

**File:** `package.json`.

**Changes:**

- Add `"favicons:build": "bash scripts/build-favicons.sh"` to the
  `scripts` object, alphabetical order (between `dev` and `lint`
  makes no sense alphabetically — existing scripts are grouped
  logically, so append at the end of the dev/test block).

### Step 3: Update `CLAUDE.md` "Common Development Tasks"

**File:** `CLAUDE.md`.

**Changes:**

- Add a short subsection explaining `npm run favicons:build`:
  when to run it (after editing `public/favicon.svg`), what it does,
  and the `magick` dependency.

### Step 4: Verify the script regenerates byte-identical (or equivalent) output

**Testing:**

```bash
# Snapshot current assets
cp public/favicon.ico /tmp/favicon.ico.before
cp public/favicon-96x96.png /tmp/favicon-96x96.png.before
cp public/apple-touch-icon.png /tmp/apple-touch-icon.png.before
cp public/web-app-manifest-192x192.png /tmp/web-192.png.before
cp public/web-app-manifest-512x512.png /tmp/web-512.png.before

# Run the new script
npm run favicons:build

# Verify output dimensions
magick identify public/favicon-96x96.png public/apple-touch-icon.png \
  public/web-app-manifest-192x192.png public/web-app-manifest-512x512.png
file public/favicon.ico

# Diff (may differ by a few bytes due to encoder metadata — the goal
# is "visually identical", not byte-identical. Visual diff via
# `compare` if needed).
```

### Step 5: Verify `magick`-missing failure path

**Testing:**

```bash
PATH=/usr/bin env -i PATH=/usr/bin bash scripts/build-favicons.sh
# Expect: "error: 'magick' (ImageMagick v7) not found on PATH" on stderr
# Expect: exit code 1
```

## Testing Strategy

### Unit Testing

Not applicable. The script is a build tool; no runtime logic to
unit-test. Existing `npm run test:unit` remains unaffected.

### Integration Testing

**Test Case 1: Clean regeneration**

1. Run `npm run favicons:build`.
2. Expected: exits 0; all five raster files updated; `file
   public/favicon.ico` reports `MS Windows icon resource - 3 icons,
   16x16, 32x32, 48x48`.

**Test Case 2: PNG dimensions match filenames**

1. `magick identify public/<each>.png`.
2. Expected: 96×96, 180×180, 192×192, 512×512 respectively.

**Test Case 3: Missing ImageMagick fails fast**

1. Run the script with `magick` removed from `PATH`.
2. Expected: stderr contains the `"error: 'magick' …"` message;
   exit code 1.

**Test Case 4: Script cleans up temp files**

1. Run the script.
2. Expected: no `/tmp/fav-*.png` left behind (the `mktemp -d` /
   `trap` cleanup handles this).

### Regression Testing

- `npm run build` still succeeds and `dist/` contains the favicon
  assets (no Vite config changes).
- `npm run test:unit`, `npm run test:e2e` unchanged.

## Success Criteria

- [ ] `scripts/build-favicons.sh` exists, is executable, and
      regenerates all five raster assets.
- [ ] `npm run favicons:build` runs the script end-to-end.
- [ ] Script fails fast with a clear error when `magick` is missing.
- [ ] Script uses `mktemp -d` + `trap` to clean up intermediate files.
- [ ] `CLAUDE.md` mentions the new script.
- [ ] Pre-commit hooks pass (shellcheck if configured).
- [ ] Output dimensions verified via `magick identify` / `file`.

## Files Modified

1. `scripts/build-favicons.sh` (new) — ImageMagick pipeline.
2. `package.json` — add `favicons:build` script.
3. `CLAUDE.md` — document the new npm script.

## Related Issues and Tasks

### Depends On

- None.

### Related

- #98 — favicon design overhaul that produced the pipeline being wrapped.

### Enables

- Low-friction future favicon tweaks.

## References

- [GitHub Issue #102](https://github.com/denhamparry/djrequests/issues/102)
- `docs/plan/issues/098_improve_favicon_design_small_sizes.md` — source
  of the ImageMagick commands.

## Notes

### Key Insights

- Keeping the pipeline as a **shell script** (not a JS/Node script)
  avoids adding a dependency on an ImageMagick wrapper library. The
  pipeline is fundamentally shell-native (multiple `magick`
  invocations), so shell is the right tool.
- The regenerated PNGs/ICO will **not** be byte-identical to the
  originals because ImageMagick's encoder metadata varies by
  invocation. "Visually identical output" is the correct acceptance
  criterion; `compare` or a human eyeball is sufficient.

### Alternative Approaches Considered

1. **Node script using `sharp`** — introduces a heavy native
   dependency (`sharp`) just for a tool that runs rarely and only
   locally. ❌
2. **Embed the commands in an npm script as a semicolon-chained
   one-liner** — quickly becomes unreadable; no room for the `magick`
   precondition check. ❌
3. **Shell script + npm alias** — minimal, readable, reproducible,
   no new deps. ✅

### Best Practices

- Build scripts that shell out to external tools should *check the
  tool exists* and exit with a helpful message — silent "command not
  found" is the kind of paper cut that wastes new contributors' time.
- Use `mktemp -d` + `trap` for intermediate files, never hard-coded
  `/tmp/...` paths (collision risk if the script runs concurrently).
