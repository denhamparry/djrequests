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
  -resize 96x96 public/favicon-96x96.png

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
