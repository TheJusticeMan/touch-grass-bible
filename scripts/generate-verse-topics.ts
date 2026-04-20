/**
 * Reads quantized verse embeddings from generate-bible-embeddings.ts,
 * clusters all verses into topics with k-means, extracts center verses,
 * and writes JSON files with topic assignments and center verses.
 *
 * Usage:
 *   npm run generate:verse-topics
 *
 * Env overrides:
 *   EMBED_META           path to verse .meta.json  (default: qwen3 verse file)
 *   EMBED_BIN            path to verse .bin        (default: qwen3 verse file)
 *   TRANSLATION_PATH     KJV source JSON           (default: data/translations/KJV.json)
 *   VERSE_TOPICS_OUTPUT  output JSON path          (default: data/bible-verse-topics.json)
 *   TOPIC_CENTERS_OUTPUT center verses JSON path   (default: data/bible-topic-centers.json)
 *   VERSE_TOPIC_COUNT    number of k-means topics  (default: 200)
 *   PCA_COMPONENTS       PCA output dimensions     (default: 64)
 *   PCA_ENABLED          use PCA before kmeans     (default: true)
 *   TOPIC_CENTER_COUNT   verses per topic          (default: 5)
 */

import { readFileSync, writeFileSync } from "fs";
import { kmeans } from "ml-kmeans";
import { PCA } from "ml-pca";
import type {
  DataBibleTranslationFile,
  DataTopicCentersFile,
  DataVerseRefWithText,
  DataVerseTopicEntry,
} from "../src/models/DataTypes";

type BibleData = DataBibleTranslationFile;

type EmbeddingMeta = {
  provider: string;
  model: string;
  dimensions: number;
  granularity?: "verse" | "chapter";
  quantScale?: number;
};

type VerseRecord = DataVerseRefWithText;

type VerseTopic = DataVerseTopicEntry;

type TopicCentersOutput = DataTopicCentersFile;

const META_PATH =
  process.env.EMBED_META ?? "processing/bible-embeddings.ollama.qwen3-embedding-0-6b.meta.json";
const BIN_PATH = process.env.EMBED_BIN ?? "processing/bible-embeddings.ollama.qwen3-embedding-0-6b.bin";
const TRANSLATION_PATH = process.env.TRANSLATION_PATH ?? "data/translations/KJV.json";
const OUTPUT_PATH = process.env.VERSE_TOPICS_OUTPUT ?? "data/bible-verse-topics.json";
const CENTERS_OUTPUT_PATH = process.env.TOPIC_CENTERS_OUTPUT ?? "data/bible-topic-centers.json";
const VERSE_TOPIC_COUNT = Math.max(2, parseInt(process.env.VERSE_TOPIC_COUNT ?? "200", 10));
const PCA_COMPONENTS = Math.max(2, parseInt(process.env.PCA_COMPONENTS ?? "64", 10));
const PCA_ENABLED = (process.env.PCA_ENABLED ?? "true").toLowerCase() !== "false";
const TOPIC_CENTER_COUNT = Math.max(1, parseInt(process.env.TOPIC_CENTER_COUNT ?? "5", 10));

/** Mirrors flattenBible from generate-bible-embeddings.ts — must stay in sync. */
function buildVerseIndex(bible: BibleData): VerseRecord[] {
  const rows: VerseRecord[] = [];

  for (const book of Object.keys(bible)) {
    const chapters = bible[book];
    for (let chapterIndex = 1; chapterIndex < chapters.length; chapterIndex++) {
      const chapter = chapters[chapterIndex];
      if (!Array.isArray(chapter)) continue;

      for (let verseIndex = 1; verseIndex < chapter.length; verseIndex++) {
        const text = chapter[verseIndex];
        if (!text) continue;
        rows.push({
          book,
          chapter: chapterIndex,
          verse: verseIndex,
          text,
        });
      }
    }
  }

  return rows;
}

function loadMatrix(int16: Int16Array, rows: number, dims: number, scale: number): number[][] {
  const matrix = new Array<number[]>(rows);

  for (let i = 0; i < rows; i++) {
    const offset = i * dims;
    const vec = new Array<number>(dims);
    for (let d = 0; d < dims; d++) vec[d] = int16[offset + d] / scale;
    matrix[i] = vec;
  }

  return matrix;
}

function squaredDistance(left: number[], right: number[]): number {
  let sum = 0;

  for (let i = 0; i < left.length; i++) {
    const delta = left[i] - right[i];
    sum += delta * delta;
  }

  return sum;
}

async function run(): Promise<void> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const meta = JSON.parse(readFileSync(META_PATH, "utf8")) as EmbeddingMeta;
  const dims = meta.dimensions;
  const scale = meta.quantScale ?? 10000;

  if (meta.granularity === "chapter") {
    throw new Error("Topic generation expects verse-level embeddings, but meta granularity is chapter");
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const binBuf = readFileSync(BIN_PATH);
  const int16 = new Int16Array(binBuf.buffer, binBuf.byteOffset, binBuf.byteLength / 2);

  if (int16.length % dims !== 0) {
    throw new Error(
      `Embedding binary length is not divisible by dimensions: ${int16.length} values for dims=${dims}`,
    );
  }

  const totalVectors = int16.length / dims;

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const bible = JSON.parse(readFileSync(TRANSLATION_PATH, "utf8")) as BibleData;
  const verses = buildVerseIndex(bible);

  console.log(`Model: ${meta.model}  |  dims: ${dims}  |  quant scale: ${scale}`);
  console.log(`Loaded ${totalVectors} vectors from binary`);

  if (verses.length !== totalVectors) {
    throw new Error(
      `Verse count mismatch: translation has ${verses.length} verses, binary has ${totalVectors} vectors`,
    );
  }

  const topicCount = Math.min(VERSE_TOPIC_COUNT, verses.length);
  const matrix = loadMatrix(int16, verses.length, dims, scale);

  let features = matrix;
  let pcaComponentsUsed: number | null = null;

  if (PCA_ENABLED) {
    const pcaComponents = Math.min(PCA_COMPONENTS, dims, verses.length);

    if (pcaComponents < dims) {
      console.log(`Running PCA reduction ${dims} -> ${pcaComponents} dimensions ...`);
      const pca = new PCA(matrix, { center: true, scale: false });
      features = pca.predict(matrix, { nComponents: pcaComponents }).to2DArray();
      pcaComponentsUsed = pcaComponents;

      const cumulativeVariance = pca.getCumulativeVariance();
      const retained = ((cumulativeVariance[pcaComponents - 1] ?? 0) * 100).toFixed(2);
      console.log(`PCA done (retained variance: ${retained}%)`);
    } else {
      console.log(`Skipping PCA because dims=${dims} <= PCA_COMPONENTS=${pcaComponents}`);
    }
  } else {
    console.log("Skipping PCA because PCA_ENABLED=false");
  }

  console.log(`Clustering ${verses.length} verses into ${topicCount} topics ...`);
  const { clusters } = kmeans(features, topicCount, {
    initialization: "kmeans++",
    maxIterations: 300,
  });

  // Write verse topic assignments
  const topicAssignments: VerseTopic[] = verses.map((v, i) => ({
    book: v.book,
    chapter: v.chapter,
    verse: v.verse,
    topic: clusters[i],
  }));

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  writeFileSync(OUTPUT_PATH, JSON.stringify(topicAssignments));
  console.log(`Wrote ${topicAssignments.length} verse topics -> ${OUTPUT_PATH}`);

  // Extract center verses per topic
  console.log(`Extracting center verses for each topic ...`);
  const topicToIndices = new Map<number, number[]>();
  for (let i = 0; i < topicAssignments.length; i++) {
    const topic = topicAssignments[i].topic;
    const indices = topicToIndices.get(topic);
    if (indices) {
      indices.push(i);
    } else {
      topicToIndices.set(topic, [i]);
    }
  }

  const featureDims = features[0]?.length ?? 0;
  const outputTopics = [...topicToIndices.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([topic, indices]) => {
      const centroid = new Array<number>(featureDims).fill(0);

      for (const index of indices) {
        const feature = features[index];
        for (let d = 0; d < featureDims; d++) centroid[d] += feature[d];
      }

      for (let d = 0; d < featureDims; d++) centroid[d] /= indices.length;

      const centerVerses = indices
        .map(index => ({
          ...verses[index],
          distance: squaredDistance(features[index], centroid),
        }))
        .sort((left, right) => left.distance - right.distance)
        .slice(0, TOPIC_CENTER_COUNT);

      return {
        topic,
        size: indices.length,
        centerVerses,
      };
    });

  const centersOutput: TopicCentersOutput = {
    provider: meta.provider,
    model: meta.model,
    centerCount: TOPIC_CENTER_COUNT,
    pcaEnabled: PCA_ENABLED,
    pcaComponents: pcaComponentsUsed,
    topics: outputTopics,
  };

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  writeFileSync(CENTERS_OUTPUT_PATH, JSON.stringify(centersOutput, null, 2), "utf8");
  console.log(`Wrote ${centersOutput.topics.length} topic center sets -> ${CENTERS_OUTPUT_PATH}`);
}

run().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
