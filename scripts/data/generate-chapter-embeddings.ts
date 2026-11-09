/**
 * Embeds each Bible chapter as a single unit by concatenating all its verses
 * before calling the embedding model. Produces a binary file in the same
 * quantized Int16 format as generate-bible-embeddings.ts, but with one vector
 * per chapter instead of one per verse. If a chapter exceeds the model input
 * limit, it is retried by paragraph chunks (using "#" paragraph markers when
 * present) and merged into a single chapter embedding via weighted averaging.
 *
 * Usage:
 *   npm run generate:chapter-embeddings
 *
 * Env overrides:
 *   OLLAMA_URL          Ollama endpoint       (default: http://localhost:11434/api/embeddings)
 *   OLLAMA_MODEL        model name            (default: qwen3-embedding:0.6b)
 *   EMBED_TRANSLATION_PATH  KJV source JSON   (default: data/translations/KJV.json)
 *   EMBED_QUANT_SCALE   quantization scale    (default: 10000)
 *   EMBED_OUTPUT_META   output .meta.json     (default: processing/bible-chapter-embeddings.{slug}.meta.json)
 *   EMBED_OUTPUT_BIN    output .bin           (default: processing/bible-chapter-embeddings.{slug}.bin)
 */

import { readFileSync, writeFileSync } from "fs";
import type { DataBibleTranslationFile } from "../../src/models/DataTypes";

type BibleData = DataBibleTranslationFile;

type EmbeddingMetaOutput = {
  provider: "ollama";
  model: string;
  dimensions: number;
  granularity: "chapter";
  quantScale?: number;
  translation?: string;
};

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434/api/embeddings";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3-embedding:0.6b";
const EMBED_TRANSLATION_PATH = process.env.EMBED_TRANSLATION_PATH ?? "data/translations/KJV.json";
const EMBED_QUANT_SCALE = Math.max(
  1,
  Math.min(32767, parseInt(process.env.EMBED_QUANT_SCALE ?? "10000", 10) || 10000),
);

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function resolveTranslationCode(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const fileName = normalized.split("/").pop() ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  const stem = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  return stem.toUpperCase();
}

function appendNormalizedText(parts: string[], value: string): void {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return;
  parts.push(cleaned);
}

function chapterParagraphsFromVerses(verses: string[]): string[] {
  const paragraphs: string[] = [];
  let currentParagraphParts: string[] = [];

  for (const verse of verses) {
    const segments = verse.split("#");
    appendNormalizedText(currentParagraphParts, segments[0] ?? "");

    if (segments.length <= 1) continue;

    for (let si = 1; si < segments.length; si++) {
      const paragraphText = currentParagraphParts.join(" ").trim();
      if (paragraphText) {
        paragraphs.push(paragraphText);
      }
      currentParagraphParts = [];
      appendNormalizedText(currentParagraphParts, segments[si] ?? "");
    }
  }

  const trailing = currentParagraphParts.join(" ").trim();
  if (trailing) {
    paragraphs.push(trailing);
  }

  if (!paragraphs.length) {
    return verses
      .map(v => v.replace(/#/g, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }
  return paragraphs;
}

function splitTextForFallback(text: string): string[] {
  const bySentence = text
    .split(/(?<=[.!?])\s+/)
    .map(part => part.trim())
    .filter(Boolean);
  if (bySentence.length > 1) {
    return bySentence;
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return [text.trim()];

  const midpoint = Math.ceil(words.length / 2);
  const first = words.slice(0, midpoint).join(" ");
  const second = words.slice(midpoint).join(" ");
  return [first, second].map(part => part.trim()).filter(Boolean);
}

function mergeEmbeddingsWeighted(chunks: Array<{ embedding: number[]; weight: number }>, label: string): number[] {
  if (!chunks.length) {
    throw new Error(`No chunk embeddings to merge for ${label}`);
  }

  const dimensions = chunks[0].embedding.length;
  const merged = new Array<number>(dimensions).fill(0);
  let totalWeight = 0;

  for (const chunk of chunks) {
    if (chunk.embedding.length !== dimensions) {
      throw new Error(
        `Dimension mismatch while merging ${label}: expected ${dimensions}, got ${chunk.embedding.length}`,
      );
    }
    totalWeight += chunk.weight;
    for (let i = 0; i < dimensions; i++) {
      merged[i] += chunk.embedding[i] * chunk.weight;
    }
  }

  if (totalWeight <= 0) {
    throw new Error(`Invalid chunk weight while merging ${label}`);
  }

  for (let i = 0; i < merged.length; i++) {
    merged[i] /= totalWeight;
  }
  return merged;
}

function embeddingWeight(text: string): number {
  const weight = text.replace(/\s+/g, "").length;
  return Math.max(1, weight);
}

function isLikelyInputTooLongError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("too long") ||
    message.includes("maximum context length") ||
    message.includes("context length") ||
    message.includes("input length") ||
    message.includes("token")
  );
}

function buildChapterTexts(
  bible: BibleData,
): Array<{ book: string; chapter: number; text: string; paragraphs: string[] }> {
  const rows: Array<{ book: string; chapter: number; text: string; paragraphs: string[] }> = [];

  for (const book of Object.keys(bible)) {
    const chapters = bible[book];
    for (let ci = 1; ci < chapters.length; ci++) {
      const chapter = chapters[ci];
      if (!Array.isArray(chapter)) continue;

      const verses: string[] = [];
      for (let vi = 1; vi < chapter.length; vi++) {
        const v = chapter[vi];
        if (v) verses.push(v);
      }
      if (!verses.length) continue;

      const paragraphs = chapterParagraphsFromVerses(verses);
      const text = paragraphs.join("\n\n");
      if (!text) continue;

      rows.push({ book, chapter: ci, text, paragraphs });
    }
  }

  return rows;
}

async function embedChapter(text: string): Promise<number[]> {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt: text }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama embedding request failed: ${response.status} ${response.statusText} ${body}`);
  }

  const payload = (await response.json()) as { embedding?: number[] };
  if (!payload.embedding || !Array.isArray(payload.embedding)) {
    throw new Error("Ollama embedding response missing embedding");
  }
  return payload.embedding;
}

async function embedTextWithFallback(
  text: string,
  label: string,
  preSplitChunks?: string[],
): Promise<number[]> {
  try {
    return await embedChapter(text);
  } catch (error) {
    if (!isLikelyInputTooLongError(error)) {
      throw error;
    }

    const chunks = (preSplitChunks ?? splitTextForFallback(text)).filter(Boolean);
    if (chunks.length <= 1) {
      throw error;
    }

    console.warn(`Input too long for ${label}; splitting into ${chunks.length} chunk(s)`);

    const mergedChunks: Array<{ embedding: number[]; weight: number }> = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkEmbedding = await embedTextWithFallback(chunk, `${label} chunk ${i + 1}/${chunks.length}`);
      mergedChunks.push({ embedding: chunkEmbedding, weight: embeddingWeight(chunk) });
    }
    return mergeEmbeddingsWeighted(mergedChunks, label);
  }
}

async function embedChapterWithFallback(
  chapterData: { book: string; chapter: number; text: string; paragraphs: string[] },
): Promise<number[]> {
  const label = `${chapterData.book} ${chapterData.chapter}`;
  return embedTextWithFallback(chapterData.text, label, chapterData.paragraphs);
}

function quantizeEmbedding(embedding: number[], scale: number): Int16Array {
  const out = new Int16Array(embedding.length);
  for (let i = 0; i < embedding.length; i++) {
    const q = Math.round(embedding[i] * scale);
    out[i] = Math.max(-32768, Math.min(32767, q));
  }
  return out;
}

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

async function run(): Promise<void> {
  const slug = `ollama.${slugify(OLLAMA_MODEL)}`;
  const META_PATH = process.env.EMBED_OUTPUT_META ?? `processing/bible-chapter-embeddings.${slug}.meta.json`;
  const BIN_PATH = process.env.EMBED_OUTPUT_BIN ?? `processing/bible-chapter-embeddings.${slug}.bin`;

  const translationCode = resolveTranslationCode(EMBED_TRANSLATION_PATH);

  // -- 1. Load Bible and build chapter texts ---------------------------------
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const bible = JSON.parse(readFileSync(EMBED_TRANSLATION_PATH, "utf8")) as BibleData;
  const chapters = buildChapterTexts(bible);

  if (!chapters.length) {
    throw new Error(`No chapters found in ${EMBED_TRANSLATION_PATH}`);
  }

  console.log(`Translation: ${translationCode}  |  Chapters to embed: ${chapters.length}`);
  console.log(`Model: ${OLLAMA_MODEL}  |  Quant scale: ${EMBED_QUANT_SCALE}`);

  // -- 2. Embed each chapter -------------------------------------------------
  const start = Date.now();
  let nextLogAt = 50;
  const packedValues: number[] = [];
  let dimensions = 0;

  for (let i = 0; i < chapters.length; i++) {
    const { book, chapter } = chapters[i];
    const embedding = await embedChapterWithFallback(chapters[i]);

    if (!dimensions) {
      dimensions = embedding.length;
      console.log(`Detected embedding dimensions: ${dimensions}`);
    }

    if (embedding.length !== dimensions) {
      throw new Error(
        `Dimension mismatch at ${book} ${chapter}: expected ${dimensions}, got ${embedding.length}`,
      );
    }

    const quantized = quantizeEmbedding(embedding, EMBED_QUANT_SCALE);
    for (let j = 0; j < quantized.length; j++) {
      packedValues.push(quantized[j]);
    }

    const processed = i + 1;
    if (processed >= nextLogAt || processed === chapters.length) {
      const pct = ((processed / chapters.length) * 100).toFixed(1);
      const elapsed = (Date.now() - start) / 1000;
      const ips = processed / Math.max(1, elapsed);
      const eta = (chapters.length - processed) / ips;
      console.log(
        `Progress: ${processed}/${chapters.length} (${pct}%) | elapsed ${formatDuration(elapsed)} | ETA ${formatDuration(eta)}`,
      );
      nextLogAt += 50;
    }
  }

  // -- 3. Write outputs ------------------------------------------------------
  const meta: EmbeddingMetaOutput = {
    provider: "ollama",
    model: OLLAMA_MODEL,
    dimensions,
    granularity: "chapter",
    translation: translationCode,
  };

  if (EMBED_QUANT_SCALE !== 10000) {
    meta.quantScale = EMBED_QUANT_SCALE;
  }

  const packed = Int16Array.from(packedValues);

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  writeFileSync(META_PATH, JSON.stringify(meta), "utf8");
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  writeFileSync(BIN_PATH, Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength));

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Chapter embedding complete in ${elapsed}s`);
  console.log(`Chapters embedded: ${chapters.length}  |  Dimensions: ${dimensions}`);
  console.log(`Meta -> ${META_PATH}`);
  console.log(`Binary -> ${BIN_PATH}`);
}

run().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
