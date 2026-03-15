# Verse Screen (VerseScreen.ts)

## Overview

The `VerseScreen` is the main Bible reading view. It renders chapters with verses, handles navigation, and manages scroll-based chapter loading.

## Key Components

### VerseScreen Class

Main view that displays Bible chapters.

```typescript
class VerseScreen extends View {
  verseState: PaletteState<VerseRef>;
  renderedChapters: ChapterComponent[];
  maxRenderedChapters: number; // Default: 11
  chapterScroll: ChapterScroll;
  bookScroll: BookScroll;
}
```

### ChapterComponent Class

Renders a single chapter with all its verses.

```typescript
class ChapterComponent extends UIComponent<"div"> {
  verse: VerseRef;
  verses: HTMLDivElement[];
  verseInfos: VerseInfoComponent[];

  scrollTo(verse: VerseRef): void;
  scrollToInstant(verse: VerseRef): void;
  setActive(verse: VerseRef): void;
  removeActive(): void;
}
```

### VerseInfoComponent Class

Container for verse-specific actions (notes, bookmarks, etc.)

```typescript
class VerseInfoComponent extends UIComponent<"div"> {
  verse: VerseRef;

  render(): void;
}
```

## Features

### 1. Infinite Scrolling

- Renders 11 chapters at a time (configurable)
- Loads previous/next chapter on scroll near edges
- Maintains smooth scrolling experience

### 2. Chapter Navigation

- `ChapterScroll` - Navigate chapters within a book
- `BookScroll` - Navigate books

### 3. Active Verse Highlighting

- Highlights current verse
- Scrolls to verse on navigation

### 4. Context Menu

- Right-click verse → opens command palette with cross-references

## State Management

```typescript
type VerseScreenState = {
  version: 1;
  verse: {
    book: string;
    chapter: number;
    verse: number;
  };
};
```

## Potential Improvements

1. **Virtual Scrolling**: Use virtual list for large chapters
2. **Parallel Translations**: Show multiple translations side-by-side
3. **Annotations**: Add highlighting and notes layers
4. **Reading Progress**: Track reading progress per chapter
5. **Search Within Chapter**: Add in-chapter search
6. **Share Verses**: Quick share to social media
