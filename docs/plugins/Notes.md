# `NotesPlugin` — Verse Notes

**File:** `src/plugins/Notes.ts`

---

## Overview

`NotesPlugin` provides inline note-taking on individual Bible verses. Notes are stored in `VerseRef.myNotes` (a `Map<OSIS, string>`) and accessed via `verse.note`.

---

## Plugin Class

### `onload()`

1. Registers the `myNotesCategory` palette
2. Adds a verse action for inline note editing

### Verse Action

**ID:** `"add-note"`  
**Icon:** `SquarePen` (Lucide)

When the notes icon is clicked on a verse:
1. Creates an inline `TextArea` inside the verse info container
2. Pre-populates with the existing note (`verseInfo.verse.note`)
3. Auto-focuses for immediate typing
4. On every input change: saves the note to `VerseRef.myNotes` via `verseInfo.verse.note = value`
5. Triggers a debounced save via `app.saveSettingsAfterDelay()`

---

## `myNotesCategory`

**Category ID:** `"my-notes"`

Lists all verses that have notes attached.

### `onTrigger()`

Converts all entries from `VerseRef.myNotes` (Map keys are OSIS strings) to `VerseRef` instances, sorted alphabetically by verse reference string.

### `getCommands(query)`

Fuzzy-matches notes by their **note text content** (not the verse reference), so users can search by the content of their notes.

```typescript
getCommands(query: string): VerseRef[] {
  return this.getcompatible(query, this.notes, verse => verse.note);
}
```

### Command Rendering

Each result shows:
- Title: verse reference (`"John 3:16"`)
- Description: note text (or "No note")
- Context arrow (►)

Selecting a note:
1. Sets `app.verseState` to the verse
2. Switches to TSK cross-references

---

## Exported Constant

```typescript
export const myNotesCategoryID = "my-notes";
```

Used by `navigationPanel` and `NotesPanel` to open the notes command category directly.

---

## Notes vs. ExtraNotes

There are two note systems in Touch Grass Bible:

| System | Storage | Accessed Via | UI |
|--------|---------|-------------|-----|
| Inline verse notes | `VerseRef.myNotes` (Map) | `verse.note` | Verse action button in VerseScreen |
| Free-form notes | `NoteVault` + `settings.ExtraNotes` | `app.Notes` | NotesPanel sidebar |

This plugin manages **inline verse notes** only. The NotesPanel manages free-form notes.
