#!/usr/bin/env bash
set -euo pipefail

require_sdk="false"
if [[ "${1:-}" == "--require" ]]; then
  require_sdk="true"
  shift
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
local_props="$repo_root/android/local.properties"

sdk_from_local=""
if [[ -f "$local_props" ]]; then
  sdk_from_local="$(sed -n 's/^sdk\.dir=//p' "$local_props" | head -n1)"
fi

sdk_dir="${sdk_from_local:-${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}}"

if [[ -z "$sdk_dir" && "$require_sdk" == "true" ]]; then
  echo "Android SDK not set (missing android/local.properties sdk.dir and ANDROID_HOME/ANDROID_SDK_ROOT); skipping."
  exit 0
fi

if [[ -n "$sdk_dir" ]]; then
  export ANDROID_HOME="$sdk_dir"
  export ANDROID_SDK_ROOT="$sdk_dir"
  echo "Using Android SDK: $sdk_dir"
fi

if [[ "$#" -eq 0 ]]; then
  exit 0
fi

exec "$@"
