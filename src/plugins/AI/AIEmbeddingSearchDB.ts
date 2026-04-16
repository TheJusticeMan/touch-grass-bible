import { create, insertMultiple, search } from "@orama/orama";
import { VerseRef, type bibleData, type translation } from "../../models/VerseRef";

type EmbeddingVerseRecord = {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  embedding: string | number[];
};

type BinaryEmbeddingMeta = {
  provider?: "openai" | "ollama";
  model?: string;
  dimensions: number;
  count?: number;
  quantScale?: number;
  translation?: string;
  verses?: Array<
    | {
        book: string;
        chapter: number;
        verse: number;
        text?: string;
      }
    | [string, number, number]
  >;
};

type EmbeddingsJson =
  | EmbeddingVerseRecord[]
  | {
      provider?: "openai" | "ollama";
      model?: string;
      dimensions?: number;
      embeddingEncoding?: string;
      verses: EmbeddingVerseRecord[];
    };

type SearchHitDoc = {
  book: string;
  chapter: number;
  verse: number;
  text: string;
};

type ManifestEntry = {
  provider: "openai" | "ollama";
  model: string;
  metaUrl: string;
  binUrl: string;
};

const MANIFEST_URLS = ["/data/bible-embeddings-manifest.json", "/bible-embeddings-manifest.json"];
const EMBEDDING_JSON_URLS = ["/data/bible-embeddings.json", "/bible-embeddings.json"];
const EMBEDDING_BINARY_ASSETS = [
  {
    metaUrl: "/data/bible-embeddings.meta.json",
    binUrl: "/data/bible-embeddings.bin",
  },
  {
    metaUrl: "/bible-embeddings.meta.json",
    binUrl: "/bible-embeddings.bin",
  },
];

function parseEmbedding(embedding: string | number[]): number[] {
  if (Array.isArray(embedding)) return embedding;

  return embedding
    .trim()
    .split(/\s+/)
    .map(value => Number(value))
    .filter(value => Number.isFinite(value));
}

function dequantizeEmbedding(values: Int16Array, start: number, dimensions: number, scale: number): number[] {
  const out = new Array<number>(dimensions);
  for (let i = 0; i < dimensions; i++) {
    out[i] = values[start + i] / scale;
  }
  return out;
}

function getBibleForTranslation(value?: string): bibleData | null {
  if (!value) {
    return VerseRef.bibleTranslations[VerseRef.defaultTranslation] || null;
  }

  const key = value.toUpperCase() as translation;
  return VerseRef.bibleTranslations[key] || VerseRef.bibleTranslations[VerseRef.defaultTranslation] || null;
}

function flattenBibleLayout(
  bible: bibleData,
): Array<{ book: string; chapter: number; verse: number; text: string }> {
  const refs: Array<{ book: string; chapter: number; verse: number; text: string }> = [];

  for (const book of Object.keys(bible)) {
    const chapters = bible[book];
    for (let chapterIndex = 1; chapterIndex < chapters.length; chapterIndex++) {
      const chapter = chapters[chapterIndex];
      if (!Array.isArray(chapter)) continue;
      for (let verseIndex = 1; verseIndex < chapter.length; verseIndex++) {
        const text = chapter[verseIndex];
        if (!text) continue;
        refs.push({ book, chapter: chapterIndex, verse: verseIndex, text });
      }
    }
  }

  return refs;
}

function verseTextFromBible(
  bible: bibleData | null,
  book: string,
  chapter: number,
  verse: number,
  fallback = "",
): string {
  return bible?.[book]?.[chapter]?.[verse] || fallback;
}

export class AIEmbeddingSearchDB {
  private db: Awaited<ReturnType<typeof create>> | null = null;
  private initPromise: Promise<boolean> | null = null;
  private lastError = "";
  private provider: "openai" | "ollama" | null = null;
  private model: string | null = null;

  get errorMessage(): string {
    return this.lastError;
  }

  get sourceProvider(): "openai" | "ollama" | null {
    return this.provider;
  }

  get sourceModel(): string | null {
    return this.model;
  }

  get isReady(): boolean {
    return this.db !== null;
  }

  async initialize(apiKey?: string): Promise<boolean> {
    if (this.db) return true;
    if (this.initPromise) return this.initPromise;

    const promise = (async () => {
      try {
        // Try manifest-based selection first
        const manifest = await this.fetchManifest();
        let embeddingsData: {
          dimensions: number;
          provider: "openai" | "ollama";
          model: string;
          verses: EmbeddingVerseRecord[];
        };

        if (manifest && manifest.databases.length > 0) {
          const selected = await this.selectBestEntry(manifest.databases, apiKey);
          const loaded = await this.loadBinaryEmbeddings(selected.metaUrl, selected.binUrl);
          if (!loaded) {
            throw new Error(`Failed to load embedding database for ${selected.provider}/${selected.model}`);
          }
          embeddingsData = loaded;
        } else {
          // No manifest — fall back to hardcoded URL discovery
          embeddingsData = await this.loadEmbeddings();
          await this.probeEmbeddingEndpoint(embeddingsData.provider, apiKey);
        }

        this.provider = embeddingsData.provider;
        this.model = embeddingsData.model;

        this.db = await create({
          schema: {
            text: "string",
            book: "string",
            chapter: "number",
            verse: "number",
            embedding: `vector[${embeddingsData.dimensions}]`,
          },
        });

        const versesForInsert = embeddingsData.verses.map(verse => ({
          text: verse.text,
          book: verse.book,
          chapter: verse.chapter,
          verse: verse.verse,
          embedding: parseEmbedding(verse.embedding),
        }));
        await insertMultiple(this.db, versesForInsert);

        this.lastError = "";
        return true;
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
        this.initPromise = null; // allow retry after fixing the issue (e.g. adding API key or starting Ollama)
        return false;
      }
    })();

    this.initPromise = promise;
    return promise;
  }

  private async fetchManifest(): Promise<{ databases: ManifestEntry[] } | null> {
    for (const url of MANIFEST_URLS) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) continue;
        return (await response.json()) as { databases: ManifestEntry[] };
      } catch {
        continue;
      }
    }
    return null;
  }

  /** Returns true if the entry's provider is accessible (key present / server reachable). */
  private async probeEntry(entry: ManifestEntry, apiKey?: string): Promise<boolean> {
    if (entry.provider === "openai") {
      return !!apiKey;
    }
    if (entry.provider === "ollama") {
      try {
        const response = await fetch("http://localhost:11434/api/tags", {
          signal: AbortSignal.timeout(3000),
        });
        return response.ok;
      } catch {
        return false;
      }
    }
    return false;
  }

  /** Picks the best accessible entry from the manifest; prefers OpenAI when API key is provided. */
  private async selectBestEntry(entries: ManifestEntry[], apiKey?: string): Promise<ManifestEntry> {
    const results = await Promise.all(entries.map(e => this.probeEntry(e, apiKey)));
    const accessible = entries.filter((_, i) => results[i]);

    if (accessible.length === 0) {
      const providers = [...new Set(entries.map(e => e.provider))];
      const messages: string[] = [];
      if (providers.includes("openai")) messages.push("OpenAI (no API key configured)");
      if (providers.includes("ollama")) messages.push("Ollama (not running at localhost:11434)");
      throw new Error(`No embedding database is accessible. Tried: ${messages.join(", ")}`);
    }

    // Prefer OpenAI if key is set and an OpenAI DB is available
    const openaiEntry = accessible.find(e => e.provider === "openai");
    if (openaiEntry && apiKey) return openaiEntry;
    return accessible[0];
  }

  private async probeEmbeddingEndpoint(provider: "openai" | "ollama", apiKey?: string): Promise<void> {
    if (provider === "openai") {
      if (!apiKey) {
        throw new Error(
          "This embedding index requires OpenAI but no API key is configured. Set your API key in Settings.",
        );
      }
      return; // key present — actual auth errors will surface on first search
    }

    if (provider === "ollama") {
      try {
        const response = await fetch("http://localhost:11434/api/tags", {
          signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) {
          throw new Error(`server responded with ${response.status} ${response.statusText}`);
        }
      } catch (err) {
        throw new Error(
          `Ollama is not accessible at localhost:11434 — start Ollama to use embedding search` +
            ` (${err instanceof Error ? err.message : String(err)})`,
          { cause: err },
        );
      }
    }
  }

  async searchByEmbedding(
    queryEmbedding: number[],
    limit = 8,
    similarity = 0.2,
  ): Promise<Array<{ score: number; document: SearchHitDoc }>> {
    const initialized = await this.initialize();
    if (!initialized || !this.db) {
      throw new Error(this.lastError || "Embedding database is not initialized");
    }

    const vectorSearch = search as unknown as (
      db: unknown,
      params: unknown,
    ) => Promise<{ hits?: Array<{ score?: number; document?: Record<string, unknown> }> }>;

    const results = await vectorSearch(this.db, {
      mode: "vector",
      vector: {
        property: "embedding",
        value: queryEmbedding,
      },
      similarity,
      limit,
    });

    return (results.hits || [])
      .map(hit => {
        const document = hit.document || {};
        const book = typeof document.book === "string" ? document.book : "GENESIS";
        const chapter = typeof document.chapter === "number" ? document.chapter : 1;
        const verse = typeof document.verse === "number" ? document.verse : 1;
        const text = typeof document.text === "string" ? document.text : "";
        if (!text) return null;
        return {
          score: Math.max(0, Math.min(1, hit.score || 0)),
          document: { book, chapter, verse, text },
        };
      })
      .filter((item): item is { score: number; document: SearchHitDoc } => item !== null);
  }

  private async loadEmbeddings(): Promise<{
    dimensions: number;
    provider: "openai" | "ollama";
    model: string;
    verses: EmbeddingVerseRecord[];
  }> {
    const binaryLoaded = await this.loadBinaryEmbeddings();
    if (binaryLoaded) {
      return binaryLoaded;
    }

    const errors: string[] = [];
    for (const url of EMBEDDING_JSON_URLS) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          errors.push(`${url} (${response.status} ${response.statusText})`);
          continue;
        }

        const payload = (await response.json()) as EmbeddingsJson;
        const verses = Array.isArray(payload) ? payload : payload.verses;
        const first = verses?.find(v => parseEmbedding(v.embedding).length > 0);
        if (!first) {
          throw new Error("No embedding vectors found in file");
        }
        const firstEmbedding = parseEmbedding(first.embedding);
        return {
          dimensions: Array.isArray(payload)
            ? firstEmbedding.length
            : payload.dimensions || firstEmbedding.length,
          provider: Array.isArray(payload) ? "ollama" : payload.provider || "ollama",
          model: Array.isArray(payload) ? "nomic-embed-text" : payload.model || "nomic-embed-text",
          verses,
        };
      } catch (error) {
        errors.push(`${url} (${error instanceof Error ? error.message : String(error)})`);
      }
    }

    throw new Error(
      `Could not load embedding data. Expected one of: ${EMBEDDING_BINARY_ASSETS.map(
        asset => `${asset.metaUrl} + ${asset.binUrl}`,
      ).join(", ")} or ${EMBEDDING_JSON_URLS.join(", ")}. Tried: ${errors.join("; ")}`,
    );
  }

  private async loadBinaryEmbeddings(
    metaUrlOverride?: string,
    binUrlOverride?: string,
  ): Promise<{
    dimensions: number;
    provider: "openai" | "ollama";
    model: string;
    verses: EmbeddingVerseRecord[];
  } | null> {
    // When called with explicit URLs (from manifest), try only those
    const assetsToTry =
      metaUrlOverride && binUrlOverride
        ? [{ metaUrl: metaUrlOverride, binUrl: binUrlOverride }]
        : EMBEDDING_BINARY_ASSETS;

    for (const asset of assetsToTry) {
      try {
        const metaResponse = await fetch(asset.metaUrl);
        if (!metaResponse.ok) {
          continue;
        }

        const meta = (await metaResponse.json()) as BinaryEmbeddingMeta;
        if (!meta.dimensions) {
          continue;
        }

        if (!Array.isArray(meta.verses) || meta.verses.length === 0) {
          const bible = getBibleForTranslation(meta.translation);
          if (!bible) {
            continue;
          }

          const refs = flattenBibleLayout(bible);
          if (refs.length === 0) {
            continue;
          }

          const scale = meta.quantScale || 10000;
          const binResponse = await fetch(asset.binUrl);
          if (!binResponse.ok) {
            continue;
          }

          const arrayBuffer = await binResponse.arrayBuffer();
          const values = new Int16Array(arrayBuffer);
          const expectedLength = refs.length * meta.dimensions;
          if (values.length < expectedLength) {
            throw new Error(
              `Binary embedding length mismatch for ${asset.binUrl}. Expected ${expectedLength}, got ${values.length}`,
            );
          }

          const verses: EmbeddingVerseRecord[] = refs.map((ref, index) => ({
            book: ref.book,
            chapter: ref.chapter,
            verse: ref.verse,
            text: ref.text,
            embedding: dequantizeEmbedding(values, index * meta.dimensions, meta.dimensions, scale),
          }));

          return {
            dimensions: meta.dimensions,
            provider: meta.provider || "ollama",
            model: meta.model || "nomic-embed-text",
            verses,
          };
        }

        const bible = getBibleForTranslation(meta.translation);
        const scale = meta.quantScale || 10000;
        const binResponse = await fetch(asset.binUrl);
        if (!binResponse.ok) {
          continue;
        }

        const arrayBuffer = await binResponse.arrayBuffer();
        const values = new Int16Array(arrayBuffer);
        const count = meta.count ?? meta.verses.length;
        const expectedLength = count * meta.dimensions;
        if (values.length < expectedLength) {
          throw new Error(
            `Binary embedding length mismatch for ${asset.binUrl}. Expected ${expectedLength}, got ${values.length}`,
          );
        }

        const verses: EmbeddingVerseRecord[] = meta.verses.map((verse, index) => {
          const [book, chapter, verseNo, text] = Array.isArray(verse)
            ? [verse[0], verse[1], verse[2], ""]
            : [verse.book, verse.chapter, verse.verse, verse.text || ""];

          return {
            book,
            chapter,
            verse: verseNo,
            text: verseTextFromBible(bible, book, chapter, verseNo, text),
            embedding: dequantizeEmbedding(values, index * meta.dimensions, meta.dimensions, scale),
          };
        });

        return {
          dimensions: meta.dimensions,
          provider: meta.provider || "ollama",
          model: meta.model || "nomic-embed-text",
          verses,
        };
      } catch {
        continue;
      }
    }

    return null;
  }
}
