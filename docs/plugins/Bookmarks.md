# `BookmarkPlugin` — Bookmark Management

**File:** `src/plugins/Bookmarks.ts`

---

## Overview

`BookmarkPlugin` provides the bookmark system: named tags that group verse references. Users can create tags, add/remove verses, and browse their bookmarks.

The plugin also maintains automatic reading history (daily date-keyed tags added by the `VerseScreen`).

---

## `BookmarkPlugin`

**Extends:** `Plugin`

### State

```typescript
tag = this.app.commandPalette.useState("Start Up Verses");
// Tracks the currently selected bookmark tag.
```

### Registered Palettes

| ID             | Category                                              |
| -------------- | ----------------------------------------------------- |
| `"verse-list"` | `VerseListCategory` — shows verses in the current tag |
| `"bookmarks"`  | `BookmarkCategory` — shows all bookmark tags          |

### Verse Action

**ID:** `"bookmark"`  
**Icon:** Bookmark

When the bookmark icon is clicked on a verse, `syncBookmarkStatus()` renders:

1. **Buttons for tags the verse IS in** (styled as `bookmarkAdded`)
   - Click → removes verse from that tag
   - Right-click menu → opens tag in bookmark palette
2. **A `+` button** → opens an inline text input to enter a new tag name
3. **Buttons for tags the verse is NOT in** (styled as `bookmarkNotAdded`)
   - Click → adds verse to that tag

---

## `BookmarkCategory`

**Category ID:** `"bookmarks"`

Shows all existing bookmark tags. When triggered, adds three utility commands:

1. **Delete {verse} from "{tag}"** — Remove the current verse from the currently selected tag
2. **Delete tag: {tag}** — Delete the entire tag
3. **Save {verse} to new tag** — Prompts for a new tag name using `commandPalette.prompt()`

### Tag Sorting

Tags are sorted with `dateCompare()`:

- Non-date strings come first (alphabetical)
- Date strings (`YYYY-MM-DD`) come after, sorted most recent first

### Date Display

`VerseListCategory.convertTopicDate(str)` converts date tag names to human-readable strings:

- `"2024-01-15"` (today) → `"Today"`
- `"2024-01-14"` (yesterday) → `"Yesterday"`
- Within the last 7 days → `"Monday 15"` (day name + date)
- Older → `"Mon Jan 15 2024"` (full date)
- Non-date strings → Title Case

---

## `VerseListCategory`

**Category ID:** `"verse-list"`

Shows all verses in the currently selected bookmark tag (`plugin.tag`).

### Utility Commands (shown in `onTrigger`)

1. **Edit/Stop Editing Bookmark Tag** — Toggle edit mode (shows X delete buttons on each verse)
2. **Merge verses from the same chapter** — Deduplicates verses, keeping only one per chapter

### Edit Mode

When `isediting = true`, each rendered verse shows an X (`IconButton` with X icon) that removes the verse from the tag when clicked.

### Command Rendering

Each verse shows:

- Title: `"Genesis 1:1"`
- Description: verse text
- Context arrow (►) → indicates drill-down will change the verse
- Delete button (in edit mode)

Selecting a verse:

- Sets `app.verseState` to the verse
- Switches to TSK cross-references category

---

## Reading History Integration

The `VerseScreen` automatically adds verses to the reading history via:

```typescript
// When command palette closes:
VerseRef.Bookmarks.addToHistory(this.verse);
// Adds to BibleTopics under today's date key: "YYYY-MM-DD"

// When scrolling to a new chapter:
if (!this.chapterScroll?.isGrabbed && !this.bookScroll?.isGrabbed)
  VerseRef.Bookmarks.addToHistory(this.verse);
```

This creates automatic "Today", "Yesterday", etc. tags in the bookmark list.
