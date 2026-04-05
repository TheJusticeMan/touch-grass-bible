#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" == "Linux" && -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then
  echo "No display server detected; skipping run:electron."
  exit 0
fi

echo "Building Electron app..."
npm run build:electron

echo "Installing dependencies in dist folder..."
npm install --prefix ./dist

echo "Starting Electron..."
npm run --prefix ./dist start
