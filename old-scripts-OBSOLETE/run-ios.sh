#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "run:ios requires macOS. Skipping execution."
  exit 0
fi

echo "Building Capacitor assets..."
npm run build:capacitor

echo "Running iOS project..."
npx cap run ios
