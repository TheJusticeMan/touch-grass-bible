#!/usr/bin/env bash
set -euo pipefail

echo "Building Electron app..."
npm run build:electron

echo "Installing dependencies in dist folder..."
npm install --prefix ./dist

echo "Running Electron make..."
if ! npm run --prefix ./dist make; then
  echo "Electron make skipped (requires full native packaging toolchain)."
fi
