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

render_icon() {
  local size=$1
  local output=$2

  magick -background "$BG" -density "$DENSITY" "$SVG" \
    -resize "${size}x${size}" \
    -gravity center \
    -background "$BG" \
    -extent "${size}x${size}" \
    "$output"
}

render_icon 512 public/web-app-manifest-512x512.png
render_icon 192 public/web-app-manifest-192x192.png
render_icon 180 public/apple-touch-icon.png
render_icon 96 public/favicon-96x96.png

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

render_icon 16 "$tmpdir/fav-16.png"
render_icon 32 "$tmpdir/fav-32.png"
render_icon 48 "$tmpdir/fav-48.png"
magick "$tmpdir/fav-16.png" "$tmpdir/fav-32.png" "$tmpdir/fav-48.png" \
  public/favicon.ico

echo "favicons regenerated from $SVG"
