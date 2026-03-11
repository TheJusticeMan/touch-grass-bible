# `VerseRef` — Verse Reference System

**File:** `src/VerseRef.ts`  
**Class:** `VerseRef`

---

## Purpose

`VerseRef` is the central model of the application. It represents a single Bible verse identified by `book`, `chapter`, and `verse`. It also serves as the **global data store** for all Bible-related static data through its static properties.

---

## Types

```typescript
export type bibleData = { [book: string]: string[][] };
export type OSIS = string;           // e.g., "Gen.1.1"
export type translation = "KJV" | "YLT" | "ASV";

export const translationMetadata = {
  KJV: { name: "King James Version", shortName: "KJV" },
  YLT: { name: "Young's Literal Translation", shortName: "YLT" },
  ASV: { name: "American Standard Version", shortName: "ASV" },
};
```

---

## Static Properties (Global Bible Data Store)

| Property | Type | Description |
|----------|------|-------------|
| `booksOfTheBible` | `string[]` | 66 book names in canonical order, ALL CAPS |
| `BookShortNames` | `OSIS[]` | OSIS book codes: `["Gen", "Exod", "Lev", ...]` |
| `books3letter` | `string[]` | 3-letter book codes for external URLs: `["gen", "exo", ...]` |
| `bibleTranslations` | `{ [key: string]: bibleData }` | All loaded Bible texts, keyed by translation code |
| `myNotes` | `Map<OSIS, string>` | Inline per-verse notes, keyed by OSIS string |
| `Bookmarks` | `BibleTopics` | All user bookmarks |
| `defaultTranslation` | `translation` | Currently active translation (default: `"KJV"`) |

### Derived Static Getters

```typescript
static get bible(): bibleData
// Returns bibleTranslations[defaultTranslation]

static get RandomVerse(): VerseRef
// Returns a fully random verse from the KJV text
```

---

## Instance Properties

```typescript
constructor(
  public book: string = "GENESIS",
  public chapter: number = 1,
  public verse: number = 1,
)
```

---

## Instance Methods

### Reference Comparison

```typescript
isSame(verse: VerseRef): boolean
// book === verse.book && chapter === verse.chapter && verse === verse.verse

isSameChapter(value: VerseRef): boolean
// book === value.book && chapter === value.chapter

setVerse(v: number): VerseRef
// Mutates and returns `this`
```

### Reference Conversion

```typescript
toOSIS(): string
// "Gen.1.1" — OSIS format using BookShortNames lookup

toString(): string
// "Genesis 1:1" — Title case, human readable

toChaperString(): string
// "Genesis 1"

get OSIS(): string   // same as toOSIS()
set OSIS(osis: string)  // mutates this from OSIS string

get letter3(): string
// 3-letter code e.g. "gen", used in external URLs

static fromOSIS(osis: string): VerseRef
// Parses "Gen.1.1" (or range "Gen.1.1-Gen.1.3") → new VerseRef
```

### Text Access

```typescript
text(translation: translation): string
// Returns verse text for a specific translation

verseData(translation: translation): string
// Same as text()

chapterData(translation: translation): string[]
// Returns all verse texts in the chapter for a translation

bookData(translation: translation): string[][]
// Returns all chapters (each an array of verse strings)

get vTXT(): string    // Shortcut: verseData(defaultTranslation)
get cTXT(): string[]  // Shortcut: chapterData(defaultTranslation)
get bTXT(): string[][]// Shortcut: bookData(defaultTranslation)
```

### Notes

```typescript
get note(): string        // Inline note for this verse (from myNotes map)
set note(value: string)   // Set note; empty string deletes the entry

get notes(): VerseRef[]   // All verses that have notes in the same chapter (prefix match)
```

### Bookmarks

```typescript
Bookmarks(): string[]
// Returns topic names this verse belongs to

get bookmarkList(): string[]
// Same as Bookmarks() (property form)
```

### Navigation

```typescript
get nextChapter(): VerseRef
// Returns first verse of the next chapter (wraps around at end of Bible)

get prevChapter(): VerseRef
// Returns last verse of the previous chapter (wraps around at beginning)

Chapteroffset(offset: number): VerseRef
// Navigate ±N chapters with full wrap-around logic
```

### External URLs

```typescript
get YouVersionURL(): string
// https://www.bible.com/bible/1/{book}.{chapter}.{verse}

get blbURL(): string
// https://www.blueletterbible.org/kjv/{book}/{chapter}/{verse}

get gatewayURL(): string
// https://www.biblegateway.com/passage/?search={book}+{ch}%3A{v}&version={translation}
```

---

## Highlighters

Two pre-built `Highlighter` instances are exported for rendering verse text:

### `VerseHighlight`
Used for rendering individual verses in the VerseScreen.

| Rule | Pattern | Rendered As |
|------|---------|-------------|
| Translator notes | `[text in brackets]` | `<i>text in brackets</i>` |
| Divine names | `LORD`, `God` | `<b>LORD</b>`, `<b>God</b>` |
| Verse number | Leading digits | `<span class="verseNumber">N</span>` |
| Paragraph break | `#` character | `<span class="versePBreak">¶</span>` |

### `VerseSHighlight`
Used for search results where the verse reference precedes the text.

---

## Bible Data Format

The `bibleData` type is:

```typescript
type bibleData = { [book: string]: string[][] };
```

Structure:
```
{
  "GENESIS": [
    null,          // Index 0 unused (placeholder)
    [              // Chapter 1
      null,        // Index 0 unused
      "1 In the beginning God created the heaven and the earth.",  // Verse 1
      "2 And the earth was without form...",                        // Verse 2
      ...
    ],
    [              // Chapter 2
      null,
      "1 Thus the heavens...",
      ...
    ],
    ...
  ],
  "EXODUS": [ ... ],
  ...
}
```

**Key detail:** Indices 0 of both the chapter array and verse array are `null` (unused), so chapters are 1-indexed and verses are 1-indexed — matching canonical Bible references directly.

---

## OSIS Format

The Open Scriptural Information Standard (OSIS) format is used for:
- Storing bookmarks and notes (as Map keys)
- Identifying cross-references
- Identifying topic verse lists

Format: `"{BookCode}.{chapter}.{verse}"`

Examples:
- `"Gen.1.1"` → Genesis 1:1
- `"John.3.16"` → John 3:16
- `"Rev.22.21"` → Revelation 22:21

The OSIS book codes are stored in `VerseRef.BookShortNames` (indexed to match `booksOfTheBible`).

---

## Example Usage

```typescript
// Create a verse reference
const verse = new VerseRef("JOHN", 3, 16);

// Get text
console.log(verse.vTXT);        // KJV text of John 3:16
console.log(verse.text("YLT")); // YLT text of John 3:16

// Convert formats
console.log(verse.toOSIS());    // "John.3.16"
console.log(verse.toString());  // "John 3:16"

// Navigate
const next = verse.nextChapter; // VerseRef pointing to John 4:1

// Notes
verse.note = "Memorized this one.";
console.log(verse.note);        // "Memorized this one."

// External links
console.log(verse.YouVersionURL); // https://www.bible.com/bible/1/jhn.3.16

// Random verse
const random = VerseRef.RandomVerse;
```
