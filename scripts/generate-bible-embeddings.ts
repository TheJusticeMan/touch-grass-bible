import { readFileSync, writeFileSync } from "fs";

type Provider = "openai" | "ollama";
type BibleData = Record<string, Array<Array<string | null> | null>>;

type VerseEmbeddingMeta = {
  book: string;
  chapter: number;
  verse: number;
  text: string;
};

type EmbeddingMetaOutput = {
  provider: Provider;
  model: string;
  dimensions: number;
  count: number;
  dtype: "int16";
  quantScale: number;
  generatedAt: string;
  sourcePath: string;
  verses: VerseEmbeddingMeta[];
};

type EmbeddingProvider = {
  provider: Provider;
  model: string;
  embed: (input: string) => Promise<number[]>;
};

const EMBED_PROVIDER = (process.env.EMBED_PROVIDER || "ollama").toLowerCase() as Provider;
const EMBED_TRANSLATION_PATH = process.env.EMBED_TRANSLATION_PATH || "data/translations/KJV.json";

/** Lower-cases and replaces non-alphanumeric runs with "-" to produce safe filenames */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function resolveOutputPaths(provider: EmbeddingProvider): { metaPath: string; binPath: string } {
  const slug = `${provider.provider}.${slugify(provider.model)}`;
  return {
    metaPath: process.env.EMBED_OUTPUT_META_PATH || `processing/bible-embeddings.${slug}.meta.json`,
    binPath: process.env.EMBED_OUTPUT_BIN_PATH || `processing/bible-embeddings.${slug}.bin`,
  };
}

const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_MODEL = process.env.OPENAI_MODEL || "text-embedding-3-small";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/embeddings";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "nomic-embed-text";
const EMBED_QUANT_SCALE = Math.max(
  1,
  Math.min(32767, parseInt(process.env.EMBED_QUANT_SCALE || "10000", 10) || 10000),
);

function createOpenAIProvider(): EmbeddingProvider {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required when EMBED_PROVIDER=openai");
  }

  return {
    provider: "openai",
    model: OPENAI_MODEL,
    embed: async (input: string): Promise<number[]> => {
      const response = await fetch(`${OPENAI_BASE_URL}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          input,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenAI embedding request failed: ${response.status} ${response.statusText} ${body}`);
      }

      const payload = (await response.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };

      const embedding = payload.data?.[0]?.embedding;
      if (!embedding || !Array.isArray(embedding)) {
        throw new Error("OpenAI embedding response missing data[0].embedding");
      }
      return embedding;
    },
  };
}

function createOllamaProvider(): EmbeddingProvider {
  return {
    provider: "ollama",
    model: OLLAMA_MODEL,
    embed: async (input: string): Promise<number[]> => {
      const response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          prompt: input,
        }),
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
    },
  };
}

function getProvider(): EmbeddingProvider {
  if (EMBED_PROVIDER === "openai") {
    return createOpenAIProvider();
  }
  return createOllamaProvider();
}

function flattenBible(
  bible: BibleData,
): Array<{ book: string; chapter: number; verse: number; text: string }> {
  const rows: Array<{ book: string; chapter: number; verse: number; text: string }> = [];

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

function quantizeEmbedding(embedding: number[], scale: number): Int16Array {
  const out = new Int16Array(embedding.length);
  for (let i = 0; i < embedding.length; i++) {
    const quantized = Math.round(embedding[i] * scale);
    out[i] = Math.max(-32768, Math.min(32767, quantized));
  }
  return out;
}

async function run(): Promise<void> {
  const provider = getProvider();
  const { metaPath, binPath } = resolveOutputPaths(provider);
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const source = JSON.parse(readFileSync(EMBED_TRANSLATION_PATH, "utf8")) as BibleData;
  const verses = flattenBible(source);

  if (verses.length === 0) {
    throw new Error(`No verses found in ${EMBED_TRANSLATION_PATH}`);
  }

  const start = Date.now();
  let nextLogAt = 500;

  const verseMeta: VerseEmbeddingMeta[] = [];
  const packedValues: number[] = [];
  let dimensions = 0;

  for (let i = 0; i < verses.length; i++) {
    const current = verses[i];
    const embedding = await provider.embed(current.text);
    if (!dimensions) {
      dimensions = embedding.length;
    }
    if (embedding.length !== dimensions) {
      throw new Error(
        `Embedding size mismatch at ${current.book} ${current.chapter}:${current.verse}. Expected ${dimensions}, got ${embedding.length}`,
      );
    }

    const quantized = quantizeEmbedding(embedding, EMBED_QUANT_SCALE);
    verseMeta.push({
      ...current,
    });
    for (let j = 0; j < quantized.length; j++) {
      packedValues.push(quantized[j]);
    }

    const processed = i + 1;
    if (processed >= nextLogAt || processed === verses.length) {
      const percentage = ((processed / verses.length) * 100).toFixed(2);
      console.log(`Progress: ${processed}/${verses.length} (${percentage}%)`);
      nextLogAt += 500;
    }
  }

  const output: EmbeddingMetaOutput = {
    provider: provider.provider,
    model: provider.model,
    dimensions,
    count: verseMeta.length,
    dtype: "int16",
    quantScale: EMBED_QUANT_SCALE,
    generatedAt: new Date().toISOString(),
    sourcePath: EMBED_TRANSLATION_PATH,
    verses: verseMeta,
  };

  const packed = Int16Array.from(packedValues);

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  writeFileSync(metaPath, JSON.stringify(output), "utf8");
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  writeFileSync(binPath, Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength));

  const elapsedSeconds = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`Embedding generation complete in ${elapsedSeconds}s`);
  console.log(`Provider: ${provider.provider}`);
  console.log(`Model: ${provider.model}`);
  console.log(`Verses embedded: ${verseMeta.length}`);
  console.log(`Dimensions: ${dimensions}`);
  console.log(`Quant scale: ${EMBED_QUANT_SCALE}`);
  console.log(`Meta output: ${metaPath}`);
  console.log(`Binary output: ${binPath}`);
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
