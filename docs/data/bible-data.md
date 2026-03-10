# Bible Data Formats

This document describes the structure of all Bible data files used by Touch Grass Bible.

---

## Overview

| File | Location | Size | Source | Purpose |
|------|----------|------|--------|---------|
| `KJV.json` | `data/translations/` | ~4.1 MB | Public domain | King James Version text |
| `YLT.json` | `data/translations/` | ~4.1 MB | Public domain | Young's Literal Translation |
| `ASV.json` | `data/translations/` | ~4.1 MB | Public domain | American Standard Version |
| `translations.json` | `src/` → `dist/` | ~12 MB | Compiled from above | All translations combined |
| `crossrefs.json` | `dist/` | ~5 MB | OpenBible.info | Cross-references with vote scores |
| `topics.json` | `dist/` | ~10 MB | OpenBible.info | Topic-to-verse mappings with quality scores |

---

## Translation Format (`bibleData`)

**Type:** `{ [book: string]: string[][] }`

```json
{
  "GENESIS": [
    null,
    [
      null,
      "1 In the beginning God created the heaven and the earth.",
      "2 And the earth was without form, and void; and darkness was upon the face of the deep..."
    ],
    [
      null,
      "1 Thus the heavens and the earth were finished...",
      "2 And on the seventh day God ended his work..."
    ]
  ],
  "EXODUS": [ ... ]
}
```

### Key Details

- **Book keys** are ALL CAPS: `"GENESIS"`, `"EXODUS"`, `"1 SAMUEL"`, `"SONG SOLOMON"`
- **Index 0 of the outer array** is `null` (unused)
- **Each chapter** is an array where index 0 is `null` (unused)
- **Verse text** starts at index 1; verse number `n` is at `array[n]`
- **Verse text includes the verse number** as a leading integer: `"1 In the beginning..."`
- Special character `#` in verse text marks a paragraph break (rendered as `¶`)
- Special formatting in KJV: `[text]` for translator's additions (rendered in italic)

### Accessing Bible Text

```typescript
// In TypeScript via VerseRef:
const genesis1v1 = VerseRef.bibleTranslations["KJV"]["GENESIS"][1][1];
// → "1 In the beginning God created the heaven and the earth."

// Or via VerseRef instance:
const ref = new VerseRef("GENESIS", 1, 1);
ref.text("KJV")  // Same result
ref.vTXT         // Uses defaultTranslation
```

### Combined `translations.json`

All individual translation files are merged into a single `translations.json`:

```json
{
  "KJV": { "GENESIS": [...], "EXODUS": [...], ... },
  "YLT": { "GENESIS": [...], "EXODUS": [...], ... },
  "ASV": { "GENESIS": [...], "EXODUS": [...], ... }
}
```

This file is fetched on app startup and stored in `VerseRef.bibleTranslations`.

---

## Cross-References Format

**File:** `dist/crossrefs.json`  
**Source:** [OpenBible.info Cross References](https://www.openbible.info/labs/cross-references/)

```json
{
  "Gen.1.1": [
    ["John.1.1", 42],
    ["Ps.33.6", 38],
    ["Isa.40.26", 31]
  ],
  "John.3.16": [
    ["Rom.5.8", 156],
    ["1John.4.9", 89]
  ]
}
```

### Key Details

- **Keys** are OSIS verse references (using OpenBible's format, which may differ slightly from internal format)
- **Values** are arrays of `[targetOSIS, voteCount]` pairs
- `voteCount` represents community votes for the relevance of this cross-reference
- Higher vote count = more relevant cross-reference

### How TSK Plugin Uses This

```typescript
// Look up cross-references for a verse
const osis = verse.toOSIS(); // e.g., "John.3.16"
const refs = this.crossRefs[osis] || [];
const sorted = refs.sort(([, a], [, b]) => b - a); // Sort by votes descending
```

---

## Topics Format

**File:** `dist/topics.json`  
**Source:** [OpenBible.info Topics](https://www.openbible.info/topics/)

```json
{
  "faith": [
    ["Heb.11.1", 95.3],
    ["Eph.2.8", 87.1],
    ["Rom.10.17", 76.5]
  ],
  "prayer": [
    ["Matt.6.9", 92.0],
    ["Phil.4.6", 88.5]
  ]
}
```

### Key Details

- **Keys** are lowercase topic names
- **Values** are arrays of `[OSIS, qualityScore]` pairs
- `qualityScore` is OpenBible's relevance score (higher = more relevant)
- There are thousands of topics ranging from broad ("faith") to specific ("the seven churches")

### How TopicalBible Plugin Uses This

```typescript
const topics = new BibleTopics(topicsData);
// Get all verses for a topic:
const faithVerses = topics.get("faith");
// Get all topics a verse belongs to:
const verseTopics = topics.getTopicsFromVerse(verse);
```

---

## OSIS Reference Format

The Open Scriptural Information Standard (OSIS) is used throughout for Bible verse references.

**Format:** `{BookCode}.{chapter}.{verse}`

**Book Codes** (from `BookShortNames` array in `booksOfTheBible.ts`):

| Book | OSIS Code |
|------|-----------|
| Genesis | `Gen` |
| Exodus | `Exod` |
| ... | ... |
| Psalms | `Ps` |
| ... | ... |
| Matthew | `Matt` |
| John | `John` |
| Romans | `Rom` |
| 1 Corinthians | `1Cor` |
| Revelation | `Rev` |

**Note:** The OSIS codes used internally may differ slightly from those in the OpenBible data files. The `VerseRef.fromOSIS()` method handles parsing, and `VerseRef.toOSIS()` produces the internal format.

---

## `info.json`

**File:** `src/info.json` (generated at build time)

```json
{
  "name": "Touch Grass Bible",
  "description": "The bible app that keeps you grounded in the word...",
  "version": "3.1.1",
  "build": "2024-01-15T10:30:00.000Z",
  "author": "Justice Vellacott",
  "license": "MIT"
}
```

Generated by `esbuild.config.mjs` on every build. The version is read from `package.json`.
