# `UnifiedCommandPalette` — Command Interface

**File:** `src/external/CommandPalette.ts`

---

## Overview

The `UnifiedCommandPalette` is a modal command interface that aggregates multiple `CommandCategory` instances into a single searchable overlay. It is the primary interaction mechanism in Touch Grass Bible.

Opening the palette with `Ctrl+Enter` (or tapping the title bar) brings up the palette showing all registered categories or the results of the currently active category.

---

## Core Concepts

### `CommandCategory<T>`

An abstract base class for command sources. Each plugin registers one or more categories.

```typescript
abstract class CommandCategory<T> {
  abstract readonly name: string;
  abstract readonly description: string;
  title?: string; // Optional override for the palette header

  abstract getCommands(query: string): T[];
  // Returns matching commands for the given query string.

  abstract renderCommand(cmd: T, item: CommandItem<T>): (state: CommandPaletteState) => CommandPaletteState;
  // Renders a command item. Returns a state transition function called when selected.

  abstract executeCommand(cmd: T): void;
  // Called after the state transition. Usually closes or refreshes the palette.

  onTrigger(state: CommandPaletteState): void;
  // Called when this category becomes the active category.
  // Use to initialize the command list or reset state.

  getcompatible(query: string, list: T[], ...keyExtractors: ((item: T) => string)[]): T[];
  // Helper: filters list by Levenshtein distance to query.
  // Uses fuzzy matching if exact match fails.
}
```

### `CommandItem<T>`

Represents a single row in the palette. Built by `renderCommand()`.

```typescript
class CommandItem<T> {
  setTitle(title: string): this;
  setDescription(text: string): this;
  setHidden(hidden: boolean): this;
  addctx(): this;
  // Adds a "context" arrow button (►) to indicate drill-down navigation
}
```

### `CommandPaletteState`

Tracks the current state of the command palette:

```typescript
type CommandPaletteState = {
  topCategory: string; // ID of the currently active category
  inputMode: "search" | "numeric"; // Input type for the search field
  maxResults: number; // Maximum number of items to show
  // ... additional internal fields
};
```

---

## `UnifiedCommandPalette`

### Registration

```typescript
addPalette(factory: () => CommandCategory<unknown>, id: string): void
// Registers a category factory. Factory is called lazily when needed.

removePalette(factory: () => CommandCategory<unknown>, id: string): void
// Unregisters a category.
```

### State Management

```typescript
useState<T>(initialValue: T): PaletteState<T>
// Creates a reactive state tied to the palette lifecycle.
// Used by plugins to maintain per-plugin state.

get state(): CommandPaletteState
// Returns the current palette state.

update(partial: Partial<CommandPaletteState>): this
// Merges partial state into current state.
```

### Opening / Closing

```typescript
open(): this
// Shows the palette overlay.

close(): this
// Hides the palette and clears input.

get isOpen(): boolean

menu(): void
// Shows the top-level category selection (all categories).
```

### Display

```typescript
display(): void
// Re-renders the current command list.

get columns(): boolean
set columns(value: boolean)
// When true, renders items in a two-column grid (for wide viewports).

get length(): number
// Current number of rendered items.
```

---

## State Transitions

The command palette uses a functional state transition pattern:

```
User selects an item
  ↓
renderCommand() was called previously, returning a transition function:
  (state: CommandPaletteState) => CommandPaletteState

The palette calls this function with the current state:
  newState = transition(currentState)

The palette updates to newState and re-renders.

Then executeCommand(item) is called.
```

This allows commands to:

- Change the active category: `state.update({ topCategory: "new-category" })`
- Change input mode: `state.update({ inputMode: "numeric" })`
- Update app state (`app.verseState.set(verse)`) as a side effect

---

## Keyboard Navigation

Inside the open palette:

| Key                       | Action                  |
| ------------------------- | ----------------------- |
| `ArrowUp` / `ArrowDown`   | Move selection          |
| `Enter`                   | Execute selected item   |
| `Escape`                  | Close palette           |
| `Backspace` (empty query) | Go to previous state    |
| Any printable character   | Types into search input |

---

## Category Navigation Example

**Go-to-verse flow:**

```
1. Palette opens with topCategory = "go-to-verse"
2. GoToVerseCategory.onTrigger() sets specificity = Book
3. getCommands("") → 66 book names
4. User selects "John"
   → renderCommand returns transition: specificity → Chapter, topCategory → "go-to-verse"
5. Palette re-renders with John's chapters
6. User selects chapter 3
   → transition: specificity → Verse
7. Palette re-renders with John 3's verses
8. User selects verse 16
   → app.verseState.set(John.3.16), topCategory → "tsk-cross-ref"
9. executeCommand closes if specificity > 0
10. Palette re-renders with cross-references for John 3:16
```

---

## Registered Category IDs

| ID                | Plugin             | Category Class        |
| ----------------- | ------------------ | --------------------- |
| `"bookmarks"`     | BookmarkPlugin     | `BookmarkCategory`    |
| `"verse-list"`    | BookmarkPlugin     | `VerseListCategory`   |
| `"tsk-cross-ref"` | TSK                | `CrossRefCategory`    |
| `"bible-search"`  | BibleSearchPlugin  | `BibleSearchCategory` |
| `"go-to-verse"`   | BibleSearchPlugin  | `GoToVerseCategory`   |
| `"topics"`        | TopicalBiblePlugin | `TopicListCategory`   |
| `"my-notes"`      | NotesPlugin        | `myNotesCategory`     |
| `"translations"`  | TranslationsPlugin | `translationCategory` |
| `"settings"`      | SettingsPlugin     | `SettingsCategory`    |
