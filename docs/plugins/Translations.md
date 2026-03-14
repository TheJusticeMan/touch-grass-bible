# `TranslationsPlugin` — Bible Translation Switcher

**File:** `src/plugins/Translations.ts`

---

## Overview

`TranslationsPlugin` provides a simple command palette category for switching between available Bible translations.

---

## Plugin Class

```typescript
export default class TranslationsPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerPalette(() => new translationCategory(this.app.commandPalette, this), "translations");
  }
}
```

No verse actions or workspace views are registered by this plugin.

---

## `translationCategory`

**Category ID:** `"translations"`

### `onTrigger()`

Reads available translation keys from `VerseRef.bibleTranslations`:

```typescript
this.translations = Object.keys(VerseRef.bibleTranslations);
// e.g., ["KJV", "YLT", "ASV"]
```

### `getCommands(query)`

Fuzzy-matches available translations. Uses `translationMetadata` for full name matching:

- `"KJV"` matches against `"King James Version"`
- `"YLT"` matches against `"Young's Literal Translation"`
- `"ASV"` matches against `"American Standard Version"`

### Command Rendering

Each translation shows:

- Title: full name from `translationMetadata` (or raw code if not found)
- Context arrow (►)

Selecting a translation:

1. Sets `app.defaultTranslation` state to the new translation code
2. Switches topCategory to `""` (empty → shows top-level menu)

### `executeCommand()`

Also sets `VerseRef.defaultTranslation` directly as a side effect (in addition to the state set in `renderCommand`).

---

## Available Translations

| Code  | Full Name                   |
| ----- | --------------------------- |
| `KJV` | King James Version          |
| `YLT` | Young's Literal Translation |
| `ASV` | American Standard Version   |

All three translations are compiled into `translations.json` which is fetched on app startup. They share the same OSIS book structure and are indexed identically.

---

## Translation Data Format

See [data/bible-data.md](../data/bible-data.md) for the complete translations data format.
