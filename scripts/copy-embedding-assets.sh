#!/bin/bash

# Copy embedding assets from processing/ to dist/data/
# Discovers and copies embedding meta/bin pairs and generates a manifest.json

set -e

ROOT="$(pwd)"
SOURCE_DIR="$ROOT/processing"
DEST_DIR="$ROOT/dist/data"

mkdir -p "$DEST_DIR"

COPIED=0
declare -a MANIFEST_ENTRIES

# Discover and copy per-endpoint embedding databases
# Pattern: bible-embeddings.{provider}.{model}.meta.json (excluding bible-embeddings.meta.json)
if [ -d "$SOURCE_DIR" ]; then
  for meta_file in "$SOURCE_DIR"/bible-embeddings.*.meta.json; do
    [ -e "$meta_file" ] || continue
    [ "$(basename "$meta_file")" = "bible-embeddings.meta.json" ] && continue
    
    base_name=$(basename "$meta_file")
    target_meta="$DEST_DIR/$base_name"
    
    cp "$meta_file" "$target_meta"
    ((COPIED+=1))
    echo "Copied $meta_file -> $target_meta"
    
    # Derive and copy the corresponding .bin file
    bin_file="${meta_file%.meta.json}.bin"
    bin_name="${base_name%.meta.json}.bin"
    target_bin="$DEST_DIR/$bin_name"
    
    if [ -f "$bin_file" ]; then
      cp "$bin_file" "$target_bin"
      ((COPIED+=1))
      echo "Copied $bin_file -> $target_bin"
    fi
    
    # Extract provider/model from meta file for manifest
    provider=$(node -e "try { const m = require('$target_meta'); console.log(m.provider || ''); } catch(e) { process.exit(0); }")
    model=$(node -e "try { const m = require('$target_meta'); console.log(m.model || ''); } catch(e) { process.exit(0); }")
    
    if [ -n "$provider" ] && [ -n "$model" ]; then
      MANIFEST_ENTRIES+=("{\"provider\":\"$provider\",\"model\":\"$model\",\"metaUrl\":\"/data/$base_name\",\"binUrl\":\"/data/$bin_name\"}")
    fi
  done
fi

# Write manifest if we have any entries
if [ ${#MANIFEST_ENTRIES[@]} -gt 0 ]; then
  manifest_path="$DEST_DIR/bible-embeddings-manifest.json"
  manifest_json="{"
  for i in "${!MANIFEST_ENTRIES[@]}"; do
    if [ $i -eq 0 ]; then
      manifest_json+="\"databases\":["
    else
      manifest_json+=","
    fi
    manifest_json+="${MANIFEST_ENTRIES[$i]}"
  done
  manifest_json+="]}"
  
  echo "$manifest_json" | node -e "const fs = require('fs'); const json = JSON.parse(require('fs').readFileSync(0, 'utf8')); fs.writeFileSync('$manifest_path', JSON.stringify(json, null, 2)); console.log('Wrote manifest with ${#MANIFEST_ENTRIES[@]} database(s) -> $manifest_path');"
fi

# Backward-compat: copy legacy assets if they exist
legacy_assets=(
  "bible-embeddings.meta.json"
  "bible-embeddings.bin"
  "bible-embeddings.json"
)

for asset in "${legacy_assets[@]}"; do
  source_asset="$SOURCE_DIR/$asset"
  target_asset="$DEST_DIR/$asset"
  
  if [ -f "$source_asset" ]; then
    cp "$source_asset" "$target_asset"
    ((COPIED+=1))
    echo "Copied $source_asset -> $target_asset"
  fi
done

if [ $COPIED -eq 0 ]; then
  echo "No embedding assets found in processing/. Nothing copied."
fi
