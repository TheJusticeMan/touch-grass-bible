#!/usr/bin/env node
/* eslint-disable security/detect-non-literal-fs-filename */
import { existsSync, mkdirSync, readdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const sourceDir = join(root, "processing");
const destDir = join(root, "dist", "assets");
const translationsSourceDir = join(root, "data", "translations");
const translationsDestDir = join(destDir, "translations");
const mapSourcePath = join(root, "data", "bible-map-umap.json");
const mapDestPath = join(destDir, "bible-map-umap.json");
mkdirSync(destDir, { recursive: true });
mkdirSync(translationsDestDir, { recursive: true });

let copied = 0;
const manifestEntries = [];

if (existsSync(sourceDir)) {
  const metaFiles = readdirSync(sourceDir).filter(
    file => file.endsWith(".meta.json") && file.startsWith("bible-embeddings."),
  );
  for (const file of metaFiles) {
    const sourceMeta = join(sourceDir, file);
    const targetMeta = join(destDir, file);
    copyFileSync(sourceMeta, targetMeta);
    copied += 1;

    const baseName = file.replace(/\.meta\.json$/, "");
    const sourceBin = join(sourceDir, `${baseName}.bin`);
    const targetBin = join(destDir, `${baseName}.bin`);
    if (existsSync(sourceBin)) {
      copyFileSync(sourceBin, targetBin);
      copied += 1;
    }

    const meta = JSON.parse(readFileSync(sourceMeta, "utf8"));
    if (meta.provider && meta.model) {
      manifestEntries.push(
        JSON.stringify({
          provider: meta.provider,
          model: meta.model,
          metaUrl: `/assets/${file}`,
          binUrl: `/assets/${baseName}.bin`,
        }),
      );
    }
  }
}

const legacyAssets = ["bible-embeddings.meta.json", "bible-embeddings.bin", "bible-embeddings.json"];
for (const asset of legacyAssets) {
  const sourceAsset = join(sourceDir, asset);
  const targetAsset = join(destDir, asset);
  if (existsSync(sourceAsset)) {
    copyFileSync(sourceAsset, targetAsset);
    copied += 1;
  }
}

if (existsSync(translationsSourceDir)) {
  const translationFiles = readdirSync(translationsSourceDir).filter(file => file.endsWith(".json"));
  for (const file of translationFiles) {
    copyFileSync(join(translationsSourceDir, file), join(translationsDestDir, file));
    copied += 1;
  }
}

if (existsSync(mapSourcePath)) {
  copyFileSync(mapSourcePath, mapDestPath);
  copied += 1;
}

if (manifestEntries.length > 0) {
  const manifest = { databases: manifestEntries.map(entry => JSON.parse(entry)) };
  const manifestPath = join(destDir, "bible-embeddings-manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Wrote manifest with ${manifestEntries.length} database(s) -> ${manifestPath}`);
} else if (copied === 0) {
  console.log("No data assets found to copy.");
}

if (copied > 0) {
  console.log(`Copied ${copied} asset(s) into ${destDir}`);
}
