# Data Processing Scripts

The `processing/` directory contains scripts for downloading and converting Bible data into the formats expected by the app.

---

## `processing/online.mjs` — Data Downloader

**Run via:** `npm run getdatafiles`

This is the primary data pipeline script. It:
1. Downloads cross-references and topics ZIP files from OpenBible.info
2. Extracts and parses the TSV data
3. Converts to compact JSON format and writes to `dist/`
4. Compiles all translation JSON files into a combined `src/translations.json`

### Step-by-Step

```
1. Download topic-scores.zip from https://a.openbible.info/data/topic-scores.zip
2. Download cross-references.zip from https://a.openbible.info/data/cross-references.zip
3. Unzip both files (read first file from each ZIP as UTF-8 string)
4. Parse topics TSV:
   Header: Topic | OSIS | QualityScore
   → Build { [topic]: [[OSIS, score], ...] }
   → Write to dist/topics.json
5. Parse cross-references TSV:
   Header: FromVerse | ToVerse | Votes
   → Build { [fromOSIS]: [[toOSIS, votes], ...] }
   → Write to dist/crossrefs.json
6. Delete downloaded ZIP files
7. Read all .json files from data/translations/
8. Merge into single object: { KJV: {...}, YLT: {...}, ASV: {...} }
9. Write to src/translations.json
```

### Source Data Formats

**Topic scores TSV:**
```
Topic	OSIS	QualityScore
faith	Heb.11.1	95.3
faith	Eph.2.8	87.1
prayer	Matt.6.9	92.0
```

**Cross-references TSV:**
```
FromVerse	ToVerse	Votes
Gen.1.1	John.1.1	42
Gen.1.1	Ps.33.6	38
John.3.16	Rom.5.8	156
```

### Output Files

| File | Size | Contents |
|------|------|---------|
| `dist/topics.json` | ~10 MB | `{ topic: [[OSIS, score], ...] }` |
| `dist/crossrefs.json` | ~5 MB | `{ fromOSIS: [[toOSIS, votes], ...] }` |
| `src/translations.json` | ~12 MB | `{ KJV: bibleData, YLT: bibleData, ASV: bibleData }` |

---

## `processing/embedding.ts` — Semantic Embeddings

**Run via:** `npm run run:embed`

Generates vector embeddings for Bible chapters using the local Ollama AI model (`nomic-embed-text`). Used for semantic search and finding similar passages.

### Process

1. Iterates over all chapters in the Bible
2. Sends each chapter's text to Ollama for embedding generation
3. Saves the resulting vectors for later use

### Dependencies

- Requires [Ollama](https://ollama.ai/) running locally with the `nomic-embed-text` model
- Uses the `ollama` npm package

---

## `processing/embedding2.ts`

An alternative/updated embedding generation script. Similar purpose to `embedding.ts`.

---

## `processing/KJV.ts`

Contains or processes the raw KJV Bible data. This large file (~4.5 MB) is likely the source data for the `data/translations/KJV.json` file.

---

## `processing/filetochat.mjs` — Source-to-Chat Converter

**Run via:** `npm run ai`

Converts source files to Markdown format for use in AI chat contexts. Useful for discussing the codebase with AI assistants.

### Process

1. Reads source files from `src/`
2. Wraps each file's content in Markdown code blocks
3. Writes the output to a `TestVault` directory

---

## `scripts/` Directory

| Script | Purpose |
|--------|---------|
| `Searchtest.ts` | Tests the search functionality |
| `flatten_embeddings.ts` | Flattens the embedding data structure for analysis |
| `SearchWorld.js` | Search indexing utility |
| `embed.js` | Embedding helper script |

These are development/research utilities not used in the main build pipeline.

---

## Running the Data Pipeline

For a fresh setup:

```bash
# Install dependencies
npm install

# Download and process all data
npm run getdatafiles

# This runs:
# 1. node ./processing/online.mjs  (downloads cross-refs, topics, compiles translations)
# 2. cp src/translations.json dist  (copies compiled translations to dist)
```

For embedding generation (optional, requires Ollama):

```bash
# Install Ollama and pull the model
ollama pull nomic-embed-text

# Run embeddings
npm run run:embed
```
