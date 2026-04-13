/**
 * Reads quantized Bible verse embeddings from the binary file produced by
 * generate-bible-embeddings.ts, averages them per chapter, runs UMAP to
 * produce 2D coordinates, clusters the result with k-means, and writes
 * data/bible-map-umap.json consumed by BibleMapView.
 *
 * Usage:
 *   npm run generate:map-coords
 *
 * Env overrides:
 *   EMBED_META        path to .meta.json  (default: chapter-level qwen3 file)
 *   EMBED_BIN         path to .bin file   (default: chapter-level qwen3 file)
 *
 * If the meta file contains granularity="chapter", the binary is treated as
 * one vector per chapter and the per-verse averaging step is skipped.
 *   TRANSLATION_PATH  KJV source JSON     (default: data/translations/KJV.json)
 *   MAP_OUTPUT        output JSON path    (default: data/bible-map-umap.json)
 *   N_CLUSTERS        k-means clusters    (default: 12)
 *   UMAP_N_NEIGHBORS  UMAP nNeighbors     (default: 15)
 *   UMAP_MIN_DIST     UMAP minDist        (default: 0.1)
 */

import { readFileSync, writeFileSync } from "fs";
import { UMAP } from "umap-js";
import { kmeans } from "ml-kmeans";

type BibleData = Record<string, Array<Array<string | null> | null>>;

type EmbeddingMeta = {
  provider: string;
  model: string;
  dimensions: number;
  granularity?: "verse" | "chapter";
  quantScale?: number;
};

type MapPoint = {
  book: string;
  chapter: number;
  x: number;
  y: number;
  cluster: number;
};

const META_PATH =
  process.env.EMBED_META ?? "processing/bible-chapter-embeddings.ollama.qwen3-embedding-0-6b.meta.json";
const BIN_PATH =
  process.env.EMBED_BIN ?? "processing/bible-chapter-embeddings.ollama.qwen3-embedding-0-6b.bin";
const TRANSLATION_PATH = process.env.TRANSLATION_PATH ?? "data/translations/KJV.json";
const OUTPUT_PATH = process.env.MAP_OUTPUT ?? "dist/data/bible-map-umap.json";
const N_CLUSTERS = Math.max(2, parseInt(process.env.N_CLUSTERS ?? "24", 10));
const UMAP_N_NEIGHBORS = Math.max(2, parseInt(process.env.UMAP_N_NEIGHBORS ?? "15", 10));
const UMAP_MIN_DIST = parseFloat(process.env.UMAP_MIN_DIST ?? "0.8");

/** Mirrors flattenBible from generate-bible-embeddings.ts — must stay in sync. */
function buildVerseIndex(bible: BibleData): Array<{ book: string; chapter: number }> {
  const rows: Array<{ book: string; chapter: number }> = [];

  for (const book of Object.keys(bible)) {
    const chapters = bible[book];
    for (let ci = 1; ci < chapters.length; ci++) {
      const chapter = chapters[ci];
      if (!Array.isArray(chapter)) continue;
      for (let vi = 1; vi < chapter.length; vi++) {
        if (!chapter[vi]) continue;
        rows.push({ book, chapter: ci });
      }
    }
  }

  return rows;
}

/** One entry per chapter (order must match generate-chapter-embeddings.ts). */
function buildChapterIndex(bible: BibleData): Array<{ book: string; chapter: number }> {
  const rows: Array<{ book: string; chapter: number }> = [];

  for (const book of Object.keys(bible)) {
    const chapters = bible[book];
    for (let ci = 1; ci < chapters.length; ci++) {
      if (!Array.isArray(chapters[ci])) continue;
      const hasVerse = (chapters[ci] as Array<string | null>).slice(1).some(v => v);
      if (hasVerse) rows.push({ book, chapter: ci });
    }
  }

  return rows;
}

async function run(): Promise<void> {
  // ── 1. Load metadata ──────────────────────────────────────────────────────
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const meta = JSON.parse(readFileSync(META_PATH, "utf8")) as EmbeddingMeta;
  const dims = meta.dimensions;
  const scale = meta.quantScale ?? 10000;
  console.log(`Model: ${meta.model}  |  dims: ${dims}  |  quant scale: ${scale}`);

  // ── 2. Load binary embeddings ─────────────────────────────────────────────
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const binBuf = readFileSync(BIN_PATH);
  const int16 = new Int16Array(binBuf.buffer, binBuf.byteOffset, binBuf.byteLength / 2);
  const totalVectors = int16.length / dims;

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const bible = JSON.parse(readFileSync(TRANSLATION_PATH, "utf8")) as BibleData;

  let chapters: Array<{ book: string; chapter: number }>;
  let matrix: number[][];

  if (meta.granularity === "chapter") {
    // ── 3a. Chapter-level binary: one vector per chapter ─────────────────────
    chapters = buildChapterIndex(bible);
    console.log(`Loaded ${totalVectors} chapter vectors from binary`);

    if (chapters.length !== totalVectors) {
      throw new Error(
        `Chapter count mismatch: translation has ${chapters.length} chapters, binary has ${totalVectors} vectors`,
      );
    }

    matrix = chapters.map((_, i) => {
      const offset = i * dims;
      const vec = new Array<number>(dims);
      for (let d = 0; d < dims; d++) vec[d] = int16[offset + d] / scale;
      return vec;
    });
    console.log(`Using ${chapters.length} chapter embeddings directly`);
  } else {
    // ── 3b. Verse-level binary: average embeddings per chapter ───────────────
    const verseIndex = buildVerseIndex(bible);
    console.log(`Loaded ${totalVectors} verse vectors from binary`);

    if (verseIndex.length !== totalVectors) {
      throw new Error(
        `Verse count mismatch: translation has ${verseIndex.length} verses, binary has ${totalVectors} vectors`,
      );
    }

    const chapterMap = new Map<string, { sum: Float64Array; count: number; book: string; chapter: number }>();
    for (let i = 0; i < verseIndex.length; i++) {
      const { book, chapter } = verseIndex[i];
      const key = `${book}\x00${chapter}`;
      if (!chapterMap.has(key)) {
        chapterMap.set(key, { sum: new Float64Array(dims), count: 0, book, chapter });
      }
      const entry = chapterMap.get(key)!;
      const offset = i * dims;
      for (let d = 0; d < dims; d++) entry.sum[d] += int16[offset + d] / scale;
      entry.count++;
    }

    chapters = [...chapterMap.values()];
    matrix = chapters.map(c => {
      const mean = new Array<number>(dims);
      for (let d = 0; d < dims; d++) mean[d] = c.sum[d] / c.count;
      return mean;
    });
    console.log(`Aggregated into ${chapters.length} chapter embeddings`);
  }

  // ── 4. UMAP → 2D ─────────────────────────────────────────────────────────
  console.log(`Running UMAP  nNeighbors=${UMAP_N_NEIGHBORS}  minDist=${UMAP_MIN_DIST} …`);
  const umap = new UMAP({
    nComponents: 2,
    nNeighbors: Math.min(UMAP_N_NEIGHBORS, chapters.length - 1),
    minDist: UMAP_MIN_DIST,
    spread: 2.0, // wider global layout → more ocean between continents
    repulsionStrength: 1.8, // stronger inter-cluster push-apart
    nEpochs: 500, // more iterations to let repulsion fully settle
  });
  const embedding = umap.fit(matrix);
  console.log("UMAP done");

  // ── 5. K-means clustering ─────────────────────────────────────────────────
  console.log(`Clustering into ${N_CLUSTERS} groups …`);
  const { clusters } = kmeans(embedding, N_CLUSTERS, {
    initialization: "kmeans++",
    maxIterations: 300,
  });
  console.log("Clustering done");

  // ── 6. Assemble and write output ──────────────────────────────────────────
  const output: MapPoint[] = chapters.map((c, i) => ({
    book: c.book,
    chapter: c.chapter,
    x: embedding[i][0],
    y: embedding[i][1],
    cluster: clusters[i],
  }));

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  writeFileSync(OUTPUT_PATH, JSON.stringify(output));
  console.log(`Wrote ${output.length} chapter points → ${OUTPUT_PATH}`);
}

run().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
