# `TGAppSettings` — Settings Schema and Defaults

**File:** `src/TGAppSettings.ts`

---

## Purpose

`TGAppSettings` defines the complete set of user-configurable settings for Touch Grass Bible. These settings are persisted in `localStorage["app-data"]` and loaded on startup.

---

## Interface

```typescript
export interface TGAppSettings {
  myNotes: [string, string][];    // Array of [OSIS, noteText] pairs
  enableLogging: boolean;          // Enable browser console logging
  showHelp: boolean;               // Show help on first command palette open
  style: {
    Foreground: string;            // CSS color string (hsl/hex/rgb)
    Background: string;            // CSS color string
    EnhanceSpacing: boolean;       // Add extra line spacing
    Font: string;                  // Font class name
    fontSize: number;              // Base font size in px
  };
  Bookmarks: BibleTopicsType;      // Serialized bookmark topics
  ExtraNotes: {                    // Free-form notes (not verse-specific)
    name: string;
    content: string;
    dateCreated: string;           // ISO date string
    dateModified: string;          // ISO date string
  }[];
}
```

---

## Default Settings

```typescript
export const DEFAULT_SETTINGS: TGAppSettings = {
  myNotes: [],
  enableLogging: true,
  showHelp: true,
  style: {
    Foreground: "hsl(0, 100%, 100%)",   // White text
    Background: "hsl(0, 100%, 0%)",     // Black background
    EnhanceSpacing: true,
    Font: "Fontserif",
    fontSize: 16,
  },
  Bookmarks: {
    "Start Up Verses": [
      ["Gen.1.1", 0],
      ["John.3.16", 0],
      ["Ps.23.2", 0],
      ["1Cor.13.4", 0],
      ["Phil.4.13", 0],
      ["Rom.8.28", 0],
    ],
  },
  ExtraNotes: [],
};
```

---

## Settings Loading

Settings are loaded with `Object.assign` merging saved data over defaults:

```typescript
this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
```

This means:
- If a key is missing from saved data, the default value is used.
- If a key exists in saved data, it overrides the default.
- **Caveat:** Nested objects (like `style`) are replaced wholesale, not deep-merged. A saved `style` object missing a field will not fall back to the default for that field.

---

## Settings Saving

Before saving, in-memory data is serialized back to the settings object:

```typescript
saveSettings() {
  this.settings.Bookmarks = VerseRef.Bookmarks.toJSON();
  this.settings.myNotes = Array.from(VerseRef.myNotes.entries());
  this.saveData(this.settings);
}
```

This is triggered automatically after a 5-second debounce (`saveSettingsAfterDelay`).

---

## `myNotes` Storage Format

Notes are stored as an array of `[OSIS, text]` tuples for JSON compatibility:

```json
{
  "myNotes": [
    ["John.3.16", "God so loved the world..."],
    ["Gen.1.1", "Beginning of creation"]
  ]
}
```

On load, this is converted back to a `Map<OSIS, string>` and stored in `VerseRef.myNotes`.

---

## Export and Import

The `SettingsPlugin` provides JSON export/import functionality through the command palette. Users can:
- Download their complete settings as a JSON file
- Upload a previously exported settings file to restore their data

---

## Potential Improvements

See [improvements/features.md](../improvements/features.md) for discussion of:
- Deep merging of nested settings to handle new fields in future versions
- Settings migration/versioning for backwards compatibility
- Per-device sync (cross-device settings sharing)
