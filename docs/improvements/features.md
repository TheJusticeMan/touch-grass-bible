# Feature Suggestions

This document contains feature ideas and enhancement proposals for Touch Grass Bible.

---

## Immediate Fixes (Bugs)

### Fix TopicalBible Verse Action Navigation

**File:** `src/plugins/TopicalBible.ts`

The verse action handler uses `"topic-list"` as the category ID:
```typescript
this.app.openCommandPalette({ topCategory: "topic-list" });
```

But the registered palette ID is `"topics"`. Change to:
```typescript
this.app.openCommandPalette({ topCategory: TopicListCategoryID });
```

### Fix `notePreview` Reactive Updates

**File:** `src/NotesPanel.ts`

The live update subscription is commented out:
```typescript
/* note.on("change", this.update); */
```

Re-enabling this would make note cards update in real-time as notes are edited, instead of requiring a panel refresh.

### Save Notes on Every Change

Currently, `ExtraNotes` are only saved when leaving the Notes tab (`onDeactivate`). If the app closes unexpectedly, unsaved note changes are lost. Add auto-save with debounce:

```typescript
// In noteEditor:
.on("input", (value: string) => {
  this.note.content = value;
  (this.app as TouchGrassBibleApp).saveSettingsAfterDelay(3000);
});
```

---

## High-Value Features

### Complete AI Integration

The `AIchat` class exists and is fully functional. Complete the integration:

1. Create an `AIPlugin` that registers a command palette category
2. Allow users to enter their API key in Settings
3. On verse selection, offer "Ask AI about this verse"
4. Support streamed responses displayed inline in the palette
5. Consider a Bible-specific system prompt with context

**API Key Security Note:** The key should be stored in settings with a clear warning that it's stored locally in the browser's localStorage (unencrypted).

### Deeper Style Customization

The `TGAppSettings.style` object has foreground, background, font, and font size — but the settings UI for changing these doesn't appear to be implemented. Add a style editor:

- Color pickers for foreground/background
- Font selection dropdown (serif, sans-serif, monospace)
- Font size slider
- Line spacing toggle
- Theme presets (Dark, Light, Sepia, High Contrast)

### Reading Plans

A structured reading plan system:

```typescript
type ReadingPlan = {
  name: string;           // "Bible in a Year"
  schedule: {
    day: number;           // Day 1 of 365
    passages: string[];    // ["Gen.1-2", "Matt.1"]
  }[];
};
```

Features:
- Select from built-in plans
- Track completion per day
- View what's planned for today
- Mark days complete
- Catch up on missed days

### Multiple Notes per Verse

Currently only one note per verse (keyed by OSIS). Allow:
- Multiple notes per verse (list of notes)
- Tagged notes (link to `BibleTopics`)
- Note categories (observation, application, prayer)

### Highlight Verses

A visual highlighting system:
- Select a verse and choose a color
- Highlighted verses show background color in the reader
- Multiple highlight colors for different themes
- Persisted in settings

### Enhanced Search

The current search is a simple substring scan. Improvements:

1. **Phrase search** — `"faith without works"` as exact phrase
2. **Boolean search** — `"faith AND hope"`, `"love OR charity"`
3. **Book filter** — Search only in New Testament, or specific books
4. **Search history** — Remember recent searches
5. **Full-text index** — Use `@orama/orama` (already a dependency!) for faster indexed search

Example using Orama:

```typescript
import { create, insert, search } from "@orama/orama";

const db = await create({
  schema: {
    osis: "string",
    text: "string",
  },
});

// Index all verses on startup
for (const [book, chapters] of Object.entries(bibleData)) {
  for (const [chapter, verses] of chapters.entries()) {
    for (const [verse, text] of verses.entries()) {
      await insert(db, { osis: `${book}.${chapter}.${verse}`, text });
    }
  }
}

// Search
const results = await search(db, { term: "faith", properties: ["text"] });
```

### Cross-Reference Chains / Graph

Currently cross-references chain linearly. A visual graph of cross-reference chains would be compelling:

```
John 3:16 ← TSK+ → Romans 5:8 ← TSK+ → Romans 3:25 ← TSK+ → ...
```

Show a "breadcrumb" of the current cross-reference chain so users can navigate back.

### Audio Bible

Integrate an audio Bible API:
- Play verse/chapter audio alongside the text
- Auto-advance to next chapter
- Playback speed control
- Offline downloaded audio

### Greek/Hebrew Word Study

Using Strong's Concordance data:
- Tap on a word in KJV to see the original Greek/Hebrew word
- View other verses where the same word appears
- Word frequency statistics

---

## Mobile Experience Improvements

### Bottom Sheet Palette

On mobile, the command palette appears as a full-screen overlay. A bottom-sheet design would be more thumb-friendly:
- Slides up from the bottom like a native iOS/Android sheet
- Supports swipe-down to dismiss
- Shows more content without covering the verses

### Swipe Navigation

Use the existing `touchDragger` to enable:
- Swipe left/right to navigate chapters
- Swipe up to open the command palette

### Home Screen Verse of the Day

A Capacitor widget or PWA notification showing a daily verse.

---

## Accessibility

### Screen Reader Support

- Add `aria-label` to all icon buttons
- Add `role="list"` and `role="listitem"` to command palette items
- Add `aria-live="polite"` to the palette results region for announcements

### Keyboard Navigation

Document and improve keyboard navigation:

```
Ctrl+Enter        → Open command palette
Escape            → Close palette
Arrow keys        → Navigate palette items
Enter             → Select item
Backspace         → Go back in navigation
Ctrl+B            → Toggle bookmarks
Ctrl+F            → Open Bible search
```

---

## Developer Experience

### Hot Module Replacement

Consider adding HMR support via esbuild plugins for faster development iteration without full page reloads.

### Browser DevTools Plugin

A custom DevTools panel showing:
- Current `verseState` value
- Registered palettes and their command counts
- Settings state
- `VerseRef.myNotes` contents

### TypeScript Path Aliases

Replace deeply nested relative imports with path aliases:

```json
// tsconfig.json
{
  "paths": {
    "@plugins/*": ["./src/plugins/*"],
    "@external/*": ["./src/external/*"],
    "@app": ["./src/main"]
  }
}
```
