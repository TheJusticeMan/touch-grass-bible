import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join, basename } from "path";

const ROOT = process.cwd();
const sourceDir = join(ROOT, "processing");
const destinationDir = join(ROOT, "dist", "data");

mkdirSync(destinationDir, { recursive: true });

let copied = 0;
const manifestDatabases = [];

// Discover all per-endpoint embedding databases: bible-embeddings.{provider}.{model}.meta.json
const metaFiles = existsSync(sourceDir)
  ? readdirSync(sourceDir).filter(
      f =>
        f.startsWith("bible-embeddings.") && f.endsWith(".meta.json") && f !== "bible-embeddings.meta.json",
    )
  : [];

for (const metaFile of metaFiles) {
  const sourceMeta = join(sourceDir, metaFile);
  const targetMeta = join(destinationDir, metaFile);

  copyFileSync(sourceMeta, targetMeta);
  copied += 1;
  console.log(`Copied ${sourceMeta} -> ${targetMeta}`);

  // Derive the .bin filename from the meta filename
  const binFile = metaFile.replace(/\.meta\.json$/, ".bin");
  const sourceBin = join(sourceDir, binFile);
  const targetBin = join(destinationDir, binFile);

  if (existsSync(sourceBin)) {
    copyFileSync(sourceBin, targetBin);
    copied += 1;
    console.log(`Copied ${sourceBin} -> ${targetBin}`);
  }

  // Read provider/model from meta file and add manifest entry
  try {
    const meta = JSON.parse(readFileSync(sourceMeta, "utf8"));
    if (meta.provider && meta.model) {
      manifestDatabases.push({
        provider: meta.provider,
        model: meta.model,
        metaUrl: `/data/${basename(targetMeta)}`,
        binUrl: `/data/${binFile}`,
      });
    }
  } catch {
    // skip malformed meta files
  }
}

// Write manifest if we found any databases
if (manifestDatabases.length > 0) {
  const manifestPath = join(destinationDir, "bible-embeddings-manifest.json");
  writeFileSync(manifestPath, JSON.stringify({ databases: manifestDatabases }, null, 2), "utf8");
  console.log(`Wrote manifest with ${manifestDatabases.length} database(s) -> ${manifestPath}`);
}

// Backward-compat: copy legacy bible-embeddings.meta.json + .bin if they exist
const legacyAssets = [
  {
    source: join(sourceDir, "bible-embeddings.meta.json"),
    target: join(destinationDir, "bible-embeddings.meta.json"),
  },
  {
    source: join(sourceDir, "bible-embeddings.bin"),
    target: join(destinationDir, "bible-embeddings.bin"),
  },
  {
    source: join(sourceDir, "bible-embeddings.json"),
    target: join(destinationDir, "bible-embeddings.json"),
  },
];

for (const asset of legacyAssets) {
  if (!existsSync(asset.source)) continue;
  copyFileSync(asset.source, asset.target);
  copied += 1;
  console.log(`Copied ${asset.source} -> ${asset.target}`);
}

if (!copied) {
  console.log("No embedding assets found in processing/. Nothing copied.");
}
