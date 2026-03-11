# Notes System — `NotesPanel`, `NoteVault`, `Note`

**File:** `src/NotesPanel.ts`  
**Classes:** `Note`, `NoteVault`, `NotesPanel`, `notePreview`, `tagBadge`, `noteEditor`

---

## Overview

The notes system provides two complementary note types:

1. **Inline verse notes** (`VerseRef.myNotes`) — Short text notes attached directly to a Bible verse, stored as `Map<OSIS, string>`. Accessible via `verse.note` getter/setter.

2. **Free-form notes** (`NoteVault`) — Full documents with title, content, dates, and tags (like Google Keep). Stored in `settings.ExtraNotes`.

---

## `Note`

**Extends:** `ETarget<{ change: Note }>`

A reactive note document. All property setters emit a `"change"` event.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Note title |
| `content` | `string` | Note body text |
| `dateCreated` | `Date` | Creation timestamp |
| `dateModified` | `Date` | Last modification (auto-updated on any change) |
| `tags` | `string[]` | Array of tag strings |

All properties have getters and setters that emit `"change"` when set.

### Auto-update `dateModified`

```typescript
this.on("change", () => {
  this._dateModified = new Date();
});
```

### Serialization

```typescript
get json(): object
// Returns JSON-serializable object with all properties and ISO date strings.

static fromJSON(json: {...}): Note
// Deserializes from JSON, parsing date strings back to Date objects.
// tags defaults to [] if absent (backwards compatibility).
```

---

## `NoteVault`

A simple in-memory array-based store for `Note` objects.

```typescript
class NoteVault {
  Notes: Note[] = [];

  loadNotes(notes: Note[]): void    // Replace all notes (used on startup)
  addNote(note: Note): void          // Append a note
  removeNote(note: Note): void       // Remove a note by reference
  getAllNotes(): Note[]               // Return all notes
}
```

Notes are persisted through `app.settings.ExtraNotes` — the `NoteVault` is the in-memory representation, `ExtraNotes` is the serialized form.

---

## `NotesPanel`

**Extends:** `View` (workspace view)

The sidebar panel showing all notes with search, preview cards, and a "new note" button.

### Lifecycle

- **`onActivate()`** — Called when the user switches to the Notes tab. Calls `update()` to refresh the display.
- **`onDeactivate()`** — Called when leaving the Notes tab. Calls `saveNotesToSettings()` to persist changes.

### Layout

```
[Search Notes... input] → opens Notes command palette category
[notePreview card]       title + tags + truncated content
[notePreview card]
...
[+ button]               → creates a new Note, opens noteEditor
```

### `update()`

Rebuilds the entire panel contents:
1. Saves any pending notes to settings
2. Destroys existing preview components
3. Creates the search input
4. Sorts notes by `dateModified` descending
5. Creates a `notePreview` for each note
6. Adds the floating `+` button

---

## `notePreview` (private)

**Extends:** `UIComponent<"div">`

A card-style preview of a note. Shows:
- Note title
- Tag badges (each with an X remove button)
- A `+` button to add new tags (comma-separated input)
- Truncated content (first 100 characters)

Clicking a preview emits a `"click"` event, which `NotesPanel` handles by opening a `noteEditor`.

---

## `tagBadge` (private)

**Extends:** `UIComponent<"div">`

A small badge showing a tag string with an X (remove) button. When clicked, calls `onRemove(tag)` and destroys itself.

---

## `noteEditor` (private)

**Extends:** `Openable<{ open: void; close: void }>`

A full-screen overlay editor for a note. Opens on top of the parent element.

### Layout

```
[← Back]  [Title # tag1, tag2 ...]   ← TextInput
[                                      ]
[  Note content textarea              ]
[                                      ]
```

### Title Format

The title input uses a combined `name # tags` format:
```
My Note # faith, prayer, john
```
When input changes, it splits on `#` to separate name and tags.

### Closing

The back button (or any `close()` call) removes the overlay DOM element and emits `"close"`, which triggers `NotesPanel.update()` to refresh the list.

---

## Persistence Flow

```
User edits note → Note properties update → Note emits "change"

User navigates away from Notes tab:
  NotesPanel.onDeactivate()
    → saveNotesToSettings()
    → app.settings.ExtraNotes = vault.getAllNotes().map(n => n.json)
    → app.saveSettings()
    → localStorage["app-data"] updated
```

On startup:
```
app.loadsettings()
  → settings.ExtraNotes loaded from localStorage
  → app.Notes.loadNotes(settings.ExtraNotes.map(Note.fromJSON))
```

---

## Known Issues / Improvements

- `notePreview.update` does not subscribe to `note.on("change")` (commented out: `/* note.on("change", this.update) */`). Real-time note updates are not reflected in preview cards.
- Notes are only persisted when the Notes panel is deactivated, not on every edit.
- The tag input workflow (typing a comma to add) is not obvious to users.
- See [improvements/features.md](../improvements/features.md) for enhancement proposals.
