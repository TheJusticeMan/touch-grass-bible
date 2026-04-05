#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$script_dir/with-android-sdk.sh" --require bash -c '
npm run build:capacitor && (npx cap run android || echo "run:android skipped (no Android device/emulator detected).")
'
