# `BibleSearchPlugin` — Bible Search & Go-to-Verse

**File:** `src/plugins/Search.ts`

---

## Overview

`BibleSearchPlugin` provides two command palette categories:

1. **Bible Search** — Full-text search across all verses
2. **Go to Verse** — Hierarchical navigation: book → chapter → verse

---

## `BibleSearchPlugin`

**Extends:** `Plugin`

### State

```typescript
specificity = this.app.commandPalette.useState(Specificity.Book);
```

The `specificity` state is shared between both registered categories to track the current navigation level in go-to-verse.

### `onload()`

Registers both palette categories:

```typescript
this.registerPalette(() => new BibleSearchCategory(...), "bible-search");
this.registerPalette(() => new GoToVerseCategory(...), "go-to-verse");
```

---

## `BibleSearchCategory`

**Category ID:** `"bible-search"`

### Behavior

- Returns no results for an empty query (unless `topCategory === "go-to-verse"`)
- Iterates through all books, chapters, and verses doing case-insensitive substring matching
- Limits results to `maxResults - currentLength` to avoid overwhelming the palette
- Selecting a result sets `app.verseState` and switches to the TSK cross-references category

### Performance Note

The search is synchronous and scans the entire Bible text. For large queries on slow devices this can cause a brief pause. Results are capped at `maxResults` to bound the work.

---

## `GoToVerseCategory`

**Category ID:** `"go-to-verse"`

### Specificity Levels

The navigation uses a 3-level hierarchy controlled by `Specificity` enum:

| Level         | Display                         | Input Mode | Results                   |
| ------------- | ------------------------------- | ---------- | ------------------------- |
| `Book` (0)    | "Go to verse"                   | search     | All 66 books              |
| `Chapter` (1) | "Go to verse: {Book}"           | numeric    | All chapters in the book  |
| `Verse` (2)   | "Go to verse: {Book}:{Chapter}" | numeric    | All verses in the chapter |

### Navigation Flow

```
1. Open palette with topCategory="go-to-verse"
2. Show all 66 books
3. User selects "Genesis"
   → specificity → Chapter
   → verseState.book = "GENESIS"
   → palette re-renders with chapters 1-50
4. User selects "Chapter 1"
   → specificity → Verse
   → palette shows all 31 verses of Genesis 1
5. User selects "Verse 1"
   → verseState set to Gen 1:1
   → topCategory switches to "tsk-cross-ref"
   → specificity resets to Book
6. Palette shows cross-references for Gen 1:1
```

### `getcompatible` Fuzzy Matching

The `GoToVerseCategory` uses the inherited `getcompatible` helper for filtering. It:

1. Filters exact substring matches first
2. Falls back to Levenshtein distance sorting for near matches
3. At Book level, matches against `ref.book`
4. At Chapter level, matches against `ref.chapter.toString()`
5. At Verse level, matches against both verse number and verse text

---

## Exported Constants

```typescript
export const BibleSearchCategoryID = "bible-search";
export const GoToVerseCategoryID = "go-to-verse";
```

These are imported by other plugins (e.g., `navigationPanel`) and by `main.ts` for keyboard shortcuts.
