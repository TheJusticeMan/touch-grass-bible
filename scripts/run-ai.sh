#!/usr/bin/env bash
set -euo pipefail

if ! command -v ollama >/dev/null 2>&1; then
  echo "Ollama CLI not found; skipping AI processing."
  exit 0
fi

echo "Running AI file-to-chat processing..."
if ! node ./processing/filetochat.mjs; then
  echo ""
  echo "AI processing skipped (requires reachable Ollama models)."
  exit 0
fi
