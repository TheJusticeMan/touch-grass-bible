# Settings System (TGAppSettings.ts)

## Overview

The settings system manages application configuration with schema versioning for future migrations.

## Settings Schema

```typescript
interface TGAppSettings {
  schemaVersion: number;
  enableLogging: boolean;
  showHelp: boolean;
  style: {
    Foreground: string;
    Background: string;
    EnhanceSpacing: boolean;
    Font: string;
    fontSize: number;
  };
  // Deprecated
  myNotes?: [string, string][];
  Bookmarks?: BibleTopicsType;
  ExtraNotes?: ExtraNote[];
}
```

## Default Settings

```typescript
const DEFAULT_SETTINGS: TGAppSettings = {
  schemaVersion: 1,
  enableLogging: true,
  showHelp: true,
  style: {
    Foreground: "hsl(0, 100%, 100%)",
    Background: "hsl(0, 100%, 0%)",
    EnhanceSpacing: true,
    Font: "serif",
    fontSize: 16,
  },
};
```

## Settings Operations

### Loading

Settings are loaded with deep merge:

```typescript
function deepMerge<T>(defaults: T, saved: Partial<T>): T {
  // Recursively merge objects
  // Preserve custom values
}
```

### Saving

Auto-save with debounce:

```typescript
saveSettingsAfterDelay(delay: number = 5000) {
  // Clears previous timeout
  // Sets new timeout
  // Saves after delay
}
```

### Export/Import

- **Export**: `downloadFile("settings.json", settings)`
- **Import**: `uploadFile(".json", onFileContent)`

## Style Properties

| Property         | Type    | Description            |
| ---------------- | ------- | ---------------------- |
| `Foreground`     | string  | Text color (CSS)       |
| `Background`     | string  | Background color (CSS) |
| `EnhanceSpacing` | boolean | Extra spacing          |
| `Font`           | string  | Font family            |
| `fontSize`       | number  | Base font size         |

## Potential Improvements

1. **Schema Migration**: Add upgrade path for schema changes
2. **Settings UI**: Add visual settings panel
3. **Presets**: Add theme presets
4. **Per-Translation**: Translation-specific settings
5. **Keyboard Shortcuts**: Customizable shortcuts
