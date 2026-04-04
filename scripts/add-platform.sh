#!/usr/bin/env bash
set -euo pipefail

platform="${1:-}"

if [[ "$platform" != "android" && "$platform" != "ios" ]]; then
  echo 'Please specify a valid platform: "android" or "ios"' >&2
  exit 1
fi

if [[ "$platform" == "android" && -f "android/app/src/main/AndroidManifest.xml" ]]; then
  echo "ANDROID platform already present. Skipping."
  exit 0
fi

if [[ "$platform" == "ios" && -f "ios/App/App.xcodeproj/project.pbxproj" ]]; then
  echo "IOS platform already present. Skipping."
  exit 0
fi

echo "Adding ${platform} platform via Capacitor..."
npx cap add "$platform"
