#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

"$script_dir/with-android-sdk.sh" bash -lc '
if command -v studio >/dev/null 2>&1; then
  npx cap open android
else
  echo "Android Studio CLI not found; skipping open:android."
fi
'
