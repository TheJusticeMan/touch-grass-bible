# Verse Reference System (VerseRef.ts)

## Overview

The `VerseRef` class represents a specific verse in the Bible, providing utilities for navigation, text retrieval, and cross-references.

## Class: VerseRef

### Static Properties

| Property             | Type          | Description                         |
| -------------------- | ------------- | ----------------------------------- |
| `booksOfTheBible`    | `string[]`    | Full book names in canonical order  |
| `BookShortNames`     | `OSIS[]`      | Short book codes                    |
| `books3letter`       | `string[]`    | 3-letter abbreviations              |
| `bibleTranslations`  | `bibleData`   | Bible text data                     |
| `defaultTranslation` | `translation` | Current translation (KJV, YLT, ASV) |

### Instance Properties

| Property  | Type     | Description    |
| --------- | -------- | -------------- |
| `book`    | `string` | Book name      |
| `chapter` | `number` | Chapter number |
| `verse`   | `number` | Verse number   |

### Methods

#### Navigation

- `nextChapter` - Get next chapter reference
- `prevChapter` - Get previous chapter reference
- `Chapteroffset(offset)` - Navigate by chapter offset

#### Data Access

- `text(translation)` - Get verse text
- `chapterData(translation)` - Get all verses in chapter
- `bookData(translation)` - Get all chapters in book

#### Conversion

- `toOSIS()` - Convert to OSIS format (e.g., "Gen.1.1")
- `fromOSIS(osis)` - Create from OSIS string (static)
- `toString()` - Human-readable (e.g., "Genesis 1:1")
- `toChapterString()` - Chapter only (e.g., "Genesis 1")

#### Properties

- `vTXT` - Shortcut for verse text
- `cTXT` - Shortcut for chapter text
- `bTXT` - Shortcut for book text
- `YouVersionURL` - YouVersion link
- `blbURL` - Blue Letter Bible link
- `gatewayURL` - Bible Gateway link

## Static Helper: VerseHighlight

Pre-configured highlighter for verse text:

- Italics for `[text]` brackets
- Bold for LORD/GOD
- Verse number styling
- Paragraph break markers (¶)

## Class: OSISNotes

A notes storage class that:

- Maps OSIS strings to note content
- Provides get/set methods using VerseRef
- Supports iteration over keys

## Potential Improvements

1. **Bible Version Loading**: Add more translations (NIV, ESV, etc.)
2. **Caching**: Cache frequently accessed verses
3. **Chapter Metadata**: Store chapter/verse counts for validation
4. **Search Index**: Pre-build search index for faster lookups
5. **Cross-References**: Integrate with TSK more deeply
