# Data Flow & State Management

This document explains how data moves through the Touch Grass Bible application — from storage to display — and how reactive state is used to keep the UI in sync.

---

## Startup Data Flow

```
npm run build
     │
     └── processing/online.mjs downloads:
           ├── OpenBible cross-references → dist/crossrefs.json
           └── OpenBible topics          → dist/topics.json
           + copies src/translations.json → dist/

On first page load:
     │
     ├── App constructor runs (synchronous)
     │     ├── Creates DOM root element
     │     ├── Attaches keyboard listeners
     │     └── Schedules onload() for DOMContentLoaded
     │
     └── TouchGrassBibleApp.onload() runs (async)
           │
           ├── loadsettings()   ← localStorage["app-data"]
           ├── loadWorkspaceLayout() ← localStorage["setting-workspace"]
           ├── registerWorkspaceViews()
           ├── ensureMainScreenTab()
           ├── loadNotes()
           │
           ├── loadJSON("translations.json")  ← fetch()
           │      └── VerseRef.bibleTranslations = translations
           │
           ├── VerseRef.Bookmarks = new BibleTopics(settings.Bookmarks)
           ├── verseState.set(VerseRef.RandomVerse)
           │
           └── Plugins load (each async):
                 ├── TSK.load() → loadJSON("crossrefs.json")
                 └── TopicalBible.load() → loadJSON("topics.json")
```

---

## State Management

### Reactive State via `PaletteState<T>`

The primary state mechanism is the `PaletteState<T>` class (from `src/external/State.ts`). It holds a single value and notifies listeners when it changes.

```typescript
class PaletteState<T> {
  private value: T;
  private listeners: ((v: T) => void)[] = [];

  get(): T { return this.value; }
  set(value: T): void {
    this.value = value;
    this.listeners.forEach(cb => cb(value));
  }
  onChange(cb: (value: T) => void): void {
    this.listeners.push(cb);
  }
}
```

States are created via `commandPalette.useState(initialValue)`, ensuring they are tied to the command palette's lifecycle.

### Application-Level States

`TouchGrassBibleApp` holds two top-level states:

```typescript
// In TouchGrassBibleApp:
verseState = this.commandPalette.useState(new VerseRef("GENESIS", 1, 1));
defaultTranslation = this.commandPalette.useState("KJV" as translation);
```

- `verseState` — The currently selected verse. When changed, the `VerseScreen` re-renders to show the new verse/chapter.
- `defaultTranslation` — Propagates changes to `VerseRef.defaultTranslation` via an `onChange` listener.

### Plugin-Level States

Plugins can also use `commandPalette.useState()` for state that only makes sense within that plugin:

```typescript
// In BibleSearchPlugin:
specificity = this.app.commandPalette.useState(Specificity.Book);
// Tracks whether the go-to-verse palette is at book/chapter/verse level
```

---

## Static Global Data (VerseRef)

`VerseRef` uses static properties as a global data store for Bible content. This is a trade-off: it makes Bible data universally accessible without prop-drilling, but it means the data is not reactive.

```typescript
class VerseRef {
  static bibleTranslations: { [key: string]: bibleData } = {};
  static myNotes: Map<OSIS, string> = new Map();
  static Bookmarks: BibleTopics;
  static defaultTranslation: translation = "KJV";

  // Derived getter — reads from the static data:
  static get bible() {
    return this.bibleTranslations[this.defaultTranslation];
  }
}
```

Since this data is static, UI components that depend on it must be re-triggered manually (e.g., by updating `verseState`) when the translation changes.

---

## Persistence Strategy

All persistence uses `localStorage` with two keys:

| Key | Contents |
|-----|---------|
| `localStorage["app-data"]` | `TGAppSettings` JSON — notes, bookmarks, style preferences |
| `localStorage["setting-workspace"]` | `WorkspaceLayout` JSON — panel split positions, active tabs |

### Settings Save Flow

```
User action (add bookmark, change style, write note)
     │
     └── saveSettingsAfterDelay(5000)
           │
           ├── Clears any pending save timeout
           └── Sets new 5s timeout → saveSettings()
                 │
                 ├── settings.Bookmarks = VerseRef.Bookmarks.toJSON()
                 ├── settings.myNotes = Array.from(VerseRef.myNotes.entries())
                 └── saveData(settings) → localStorage["app-data"]
```

### Workspace Save Flow

```
User resizes/rearranges panels
     │
     └── workspace emits "layout-change"
           │
           └── enableWorkspaceAutoSave(500ms debounce)
                 └── saveWorkspaceLayout() → localStorage["setting-workspace"]
```

---

## Command Palette State Flow

The command palette manages its own internal `CommandPaletteState`:

```typescript
type CommandPaletteState = {
  topCategory: string;      // Which category is active
  inputMode: "search" | "numeric";
  maxResults: number;
  verse?: VerseRef;         // Context verse for the current category
  // ... additional fields
};
```

When a command item is selected, its `renderCommand` returns a **state transition function**:

```typescript
// Example: selecting a book in Go To Verse
renderCommand(verse, Item) {
  Item.setTitle(verse.book.toTitleCase()).addctx();
  return (state) => {
    this.specificity.set(Specificity.Chapter);
    this.plugin.app.verseState.set(verse);
    return state.update({ topCategory: GoToVerseCategoryID });
  };
}
```

The transition function:
1. Updates local plugin state (specificity level)
2. Updates global app state (selected verse)
3. Returns updated `CommandPaletteState` to drive the next palette render

This is a clean unidirectional flow:
```
User selects item → state transition → new state → palette re-renders
```

---

## Event-Driven Interactions

The keyboard/touch event system uses an event emitter pattern:

```
Keyboard press
     │
     └── document.addEventListener("keydown")
           │
           └── app.ctarget.emit(`${key}KeyDown`, {key, event})
                 │
                 └── Registered handlers respond
                       Examples:
                       - "Ctrl+EnterKeyDown" → open command palette
                       - "ArrowRightKeyDown" → navigate to navigation panel
                       - "EscapeKeyDown"     → close modal/palette
```

Touch/swipe events are generated by `touchDragger` and emitted as:
- `draggingX` / `draggingY` — finger moving
- `dragX` / `dragY` — completed drag
- `dragXcancel` / `dragYcancel` — cancelled drag

These are used in the `Workspace` to enable touch-based panel resizing and navigation.

---

## Data Flow Summary Table

| Data | Source | Accessed Via | Persisted |
|------|--------|-------------|-----------|
| Bible text | `translations.json` (fetch) | `VerseRef.bibleTranslations` | No (cached by service worker) |
| Cross-references | `crossrefs.json` (fetch) | `VerseRef.crossRefs` (set by TSK plugin) | No |
| Topics | `topics.json` (fetch) | `VerseRef.topics` (set by Topics plugin) | No |
| Bookmarks | `localStorage["app-data"]` | `VerseRef.Bookmarks` (BibleTopics) | Yes (5s debounce) |
| Notes (inline) | `localStorage["app-data"]` | `VerseRef.myNotes` (Map) | Yes (5s debounce) |
| Notes (extra) | `localStorage["app-data"]` | `app.Notes` (NoteVault) | Yes (5s debounce) |
| Settings | `localStorage["app-data"]` | `app.settings` | Yes (5s debounce) |
| Workspace layout | `localStorage["setting-workspace"]` | `app.workspace` | Yes (500ms debounce) |
| Current verse | In-memory `PaletteState<VerseRef>` | `app.verseState` | No |
| Translation | In-memory `PaletteState<translation>` | `app.defaultTranslation` | Yes (as part of settings) |
