#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_SVG="$ROOT_DIR/assets/TG.svg"
ASSETS_DIR="$ROOT_DIR/assets"
DIST_DIR="$ROOT_DIR/dist"

if [[ ! -f "$SOURCE_SVG" ]]; then
  echo "Missing source icon: $SOURCE_SVG" >&2
  exit 1
fi

mkdir -p "$ASSETS_DIR" "$DIST_DIR"

# Capacitor assets easy mode expects logo.(png|svg) in assets directory.
cp "$SOURCE_SVG" "$ASSETS_DIR/logo.svg"

# Generate runtime web/electron icons from a single SVG source.
magick -background none "$SOURCE_SVG" -resize 192x192 "$DIST_DIR/icon-192.png"
magick -background none "$SOURCE_SVG" -resize 512x512 "$DIST_DIR/icon-512.png"
magick -background none "$SOURCE_SVG" -define icon:auto-resize=16,32,48,64,128,256 "$DIST_DIR/favicon.ico"

echo "Generated icons from assets/TG.svg"
