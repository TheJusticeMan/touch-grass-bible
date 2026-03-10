# `VerseScreen` — Main Verse Display

**File:** `src/VerseScreen.ts`  
**Classes:** `VerseScreen`, `ChapterComponent`, `VerseInfoComponent`

---

## Purpose

`VerseScreen` is the primary reading view of Touch Grass Bible. It displays a scrollable, multi-chapter Bible reading experience with virtual rendering (only a buffer of chapters are rendered at once). It handles scroll-based navigation, verse highlighting, and per-verse action buttons.

---

## `VerseScreen`

**Extends:** `View` (from `src/external/Workspace.ts`)

### Key Properties

| Property | Type | Description |
|----------|------|-------------|
| `_verse` | `VerseRef` | Currently selected verse (private setter prevents recursion) |
| `chapterContainer` | `HTMLElement` | The scrollable DOM container holding chapter components |
| `renderedChapters` | `ChapterComponent[]` | Currently rendered chapter buffer |
| `maxRenderedChapters` | `number` | Max chapters in buffer (default: 11, must be odd) |
| `scrollTriggerThreshold` | `number` | How many viewports from edge to trigger new chapter load (default: 4) |
| `chapterScroll` | `ChapterScroll` | Touch/drag handler for chapter navigation overlay |
| `bookScroll` | `BookScroll` | Touch/drag handler for book navigation overlay |

### Constructor

```typescript
constructor(panel: Panel, app: TouchGrassBibleApp)
```

- Creates a `.content` div inside the panel
- Subscribes to `app.verseState.onChange` — verse changes drive the display

### `onload()`

Called after the view is mounted in the workspace. It:
1. Subscribes to `commandPalette.close` to add a reading history entry and save settings
2. Sets up the scroll event handler
3. Initializes `BookScroll` and `ChapterScroll` with their navigation callbacks
4. Sets the initial verse from `app.verseState.get()`

### Chapter Buffer System

The render buffer keeps up to `maxRenderedChapters` (default 11) chapters in the DOM at once, centered on the current chapter. As the user scrolls:

- **Scroll near the top:** `loadPreviousChapter()` prepends a new chapter and removes the last one
- **Scroll near the bottom:** `loadNextChapter()` appends a new chapter and removes the first one
- **New verse selected:** `renderInitialChapters()` rebuilds the buffer centered on the new chapter

```
Buffer visualization (maxRenderedChapters = 11):
[ch-5][ch-4][ch-3][ch-2][ch-1][current][ch+1][ch+2][ch+3][ch+4][ch+5]
```

### `handleScroll`

Throttled scroll handler (100ms via `apocalypse-throttle`). On each scroll event:
1. Checks if we're within `scrollTriggerThreshold` viewport heights of the top or bottom
2. Loads previous or next chapter if needed
3. Calls `showScrollIndicators()` to update the overlay position indicators

### Verse Selection

When a verse is selected (via `app.verseState.set(verse)`):
1. The `onChange` listener fires, calling `this.verse = verse`
2. If the verse is in a chapter already rendered, `highlightVerse()` smooth-scrolls to it
3. If the verse is in a different chapter, `renderInitialChapters()` rebuilds the buffer

### `CurrentVisibleChapter` vs `midViewChapter`

Two getters compute the "current" chapter for scroll indicator display:
- `CurrentVisibleChapter` — the last chapter whose top edge is above the viewport top
- `midViewChapter` — the chapter whose center is closest to the viewport midpoint

---

## `ChapterComponent`

**Extends:** `UIComponent<"div">`

Renders a single Bible chapter as a DOM component.

### Constructor

```typescript
constructor(parent: HTMLElement, ref: VerseRef, app: TouchGrassBibleApp)
```

For each verse in `ref.cTXT`:
- Creates a `.verse` div with highlighted text (using `VerseHighlight`)
- Binds a `click` handler to `app.verseState.set(newVerse)`
- Binds a `contextmenu` handler to open the command palette with TSK cross-references
- Creates a `VerseInfoComponent` for action buttons (initially empty)

### Methods

```typescript
removeActive(): void
// Removes the "verseActive" CSS class from any currently highlighted verse

setActive(verse: VerseRef): void
// Adds "verseActive" to the target verse div and calls VerseInfoComponent.render()

scrollTo(verse: VerseRef): void
// Smooth scrolls to the verse and activates it

scrollToInstant(verse: VerseRef): void
// Instantly scrolls to the verse and activates it (used for initial render)
```

---

## `VerseInfoComponent`

**Extends:** `UIComponent<"div">`

A per-verse action bar rendered below each verse when it is the active verse.

### Rendering

`render()` is called when a verse becomes active. It populates the info container with:

1. **Plugin verse actions** — One `IconButton` per registered `IconActionItem` from `app.getVerseActions()`. Clicking a button calls `action.onTrigger(this)`.

2. **External links button** — A `ScrollText` icon button that expands to show three buttons:
   - "Open in YouVersion" → `verse.YouVersionURL`
   - "Open in Blue Letter Bible" → `verse.blbURL`
   - "Open in Bible Gateway" → `verse.gatewayURL`

### Interaction Pattern

When any action button inside the info component is clicked:
1. `initiateRenderReset()` clears the container
2. Adds a one-time `click` listener to the document
3. When a click outside the info container is detected → re-renders the original buttons

This provides a "tap to expand, tap elsewhere to collapse" interaction.

---

## CSS Classes

| Class | Element | Description |
|-------|---------|-------------|
| `.screen-view` | VerseScreen container | Full-height scrollable view |
| `.content` | Scroll container | Overflow-y scrollable |
| `.chapter` | ChapterComponent root | Chapter wrapper |
| `.chapterTitle` | `<h2>` | Book and chapter heading |
| `.verse` | Individual verse div | Clickable verse text |
| `.verseActive` | Active verse | Highlighted / focused verse |
| `.versePBreak` | Paragraph break verses | Extra spacing before verse |
| `.verseNumber` | Leading digits | Styled verse number |
| `.infoContainer` | VerseInfoComponent | Action buttons below verse |

---

## Performance Notes

- The 11-chapter buffer keeps DOM size reasonable without reloading on every scroll.
- `apocalypse-throttle` prevents scroll handler from firing excessively.
- `waitFullUpdate()` uses two nested `requestAnimationFrame` calls to ensure DOM is fully laid out before measuring offsets for scroll positioning.
- The `isSame()` guard in the verse setter prevents unnecessary re-renders when the same verse is set again.
