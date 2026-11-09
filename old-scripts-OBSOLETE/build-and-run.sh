#!/bin/bash

# Generic build-and-run helper for TypeScript scripts
# Usage: ./scripts/build-and-run.sh <input-file> [post-run-command]
# Example: ./scripts/build-and-run.sh scripts/generate-topic-labels.ts
# Example: ./scripts/build-and-run.sh scripts/generate-bible-embeddings.ts "bash ./scripts/copy-embedding-assets.sh"

set -e

if [ -z "$1" ]; then
  echo "Usage: ./scripts/build-and-run.sh <input-file> [post-run-command]"
  exit 1
fi

INPUT_FILE="$1"
POST_RUN_COMMAND="$2"

# Get the output file path by replacing extension with .cjs.
# This runner emits CommonJS so Node dependencies that use dynamic require work.
OUTPUT_FILE="${INPUT_FILE%.*}.cjs"
FILENAME=$(basename "$INPUT_FILE")

echo "Building and running: $FILENAME"

# Build with esbuild
esbuild "$INPUT_FILE" --bundle --platform=node --format=cjs --outfile="$OUTPUT_FILE"

# Run the generated file
node "$OUTPUT_FILE"

# Run post-run command if provided
if [ -n "$POST_RUN_COMMAND" ]; then
  eval "$POST_RUN_COMMAND"
fi

# Clean up
rm -f "$OUTPUT_FILE"
