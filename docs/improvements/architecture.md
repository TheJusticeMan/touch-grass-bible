# Architecture Improvements

This document identifies architectural issues in the codebase and proposes concrete improvements.

---

## Issue 1: `VerseRef` Static Data Anti-Pattern

### Problem

`VerseRef` uses static class properties as a global mutable data store:

```typescript
class VerseRef {
  static bibleTranslations: { [key: string]: bibleData } = {};
  static myNotes: Map<OSIS, string> = new Map();
  static Bookmarks: BibleTopics;
  static defaultTranslation: translation = "KJV";
}
```

This creates several problems:
1. **Testability** — Tests that modify static data bleed into each other
2. **Tight coupling** — Any code anywhere can read/modify global Bible data
3. **No reactivity** — Changing `bibleTranslations` doesn't notify the UI
4. **Multiple instances** — Can't have two app instances with different data

### Proposed Solution

Extract a `BibleDataService` class:

```typescript
class BibleDataService {
  private translations: Map<string, bibleData> = new Map();
  private _defaultTranslation: translation = "KJV";
  notes: Map<OSIS, string> = new Map();
  bookmarks: BibleTopics = new BibleTopics({});

  get defaultTranslation(): translation { return this._defaultTranslation; }
  set defaultTranslation(t: translation) {
    this._defaultTranslation = t;
    this.emit("translationChanged", t);
  }

  loadTranslation(code: string, data: bibleData): void {
    this.translations.set(code, data);
  }

  getTranslation(code?: string): bibleData {
    return this.translations.get(code ?? this._defaultTranslation) ?? {};
  }
}

// Singleton instance injected into app:
const bibleService = new BibleDataService();
```

This enables:
- Injecting a mock service in tests
- Subscribing to translation changes reactively
- Clear separation between data and model

---

## Issue 2: `VerseRef.fromOSIS` Error Handling

### Problem

```typescript
static fromOSIS(osis: string): VerseRef {
  const [[book, chapter, verse]] = osis.split("-").map(ft => ft.split("."));
  return new VerseRef(
    VerseRef.booksOfTheBible[VerseRef.BookShortNames.indexOf(book)],
    parseInt(chapter),
    parseInt(verse),
  );
}
```

If `book` is not found in `BookShortNames`, `indexOf` returns `-1`, making `booksOfTheBible[-1]` which is `undefined`. This creates a `VerseRef` with an undefined book — a silent error.

### Proposed Fix

```typescript
static fromOSIS(osis: string): VerseRef {
  const parts = osis.split("-")[0].split(".");
  const [bookCode, chapter, verse] = parts;
  const bookIndex = VerseRef.BookShortNames.indexOf(bookCode);
  if (bookIndex === -1) {
    console.warn(`Unknown OSIS book code: ${bookCode}`);
    return new VerseRef("GENESIS", 1, 1); // Safe fallback
  }
  return new VerseRef(
    VerseRef.booksOfTheBible[bookIndex],
    parseInt(chapter ?? "1", 10),
    parseInt(verse ?? "1", 10),
  );
}
```

---

## Issue 3: Shallow Settings Merge

### Problem

```typescript
this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
```

If the user's saved data has a `style` object, the entire default `style` is replaced:

```typescript
// Saved data (old format, missing new field):
{ style: { Foreground: "red", Background: "black" } }

// DEFAULT_SETTINGS.style:
{ Foreground: "white", Background: "black", EnhanceSpacing: true, Font: "Fontserif", fontSize: 16 }

// Result after merge:
{ style: { Foreground: "red", Background: "black" } }
// EnhanceSpacing, Font, fontSize are LOST!
```

### Proposed Fix

```typescript
function deepMerge<T>(defaults: T, saved: Partial<T>): T {
  const result = { ...defaults };
  for (const key in saved) {
    if (saved[key] !== null && typeof saved[key] === "object" && !Array.isArray(saved[key])) {
      result[key] = deepMerge(defaults[key] as object, saved[key] as object) as T[typeof key];
    } else if (saved[key] !== undefined) {
      result[key] = saved[key] as T[typeof key];
    }
  }
  return result;
}

// In loadsettings:
this.settings = deepMerge(DEFAULT_SETTINGS, await this.loadData() as Partial<TGAppSettings>);
```

---

## Issue 4: Settings Version Migration

### Problem

There is no version field in `TGAppSettings`. If the settings schema changes in a future version, there is no way to migrate old data.

### Proposed Fix

Add a `schemaVersion` field:

```typescript
interface TGAppSettings {
  schemaVersion: number;  // Add this
  // ... rest of settings
}

const DEFAULT_SETTINGS: TGAppSettings = {
  schemaVersion: 2,
  // ...
};

async loadsettings(defaults: TGAppSettings) {
  const saved = await this.loadData();
  const version = (saved.schemaVersion as number) ?? 1;
  const migrated = migrationRun(saved, version, defaults.schemaVersion);
  this.settings = deepMerge(defaults, migrated);
}

function migrationRun(data: object, fromVersion: number, toVersion: number): object {
  // Apply incremental migrations
  let result = data;
  for (let v = fromVersion; v < toVersion; v++) {
    result = migrations[v](result);
  }
  return result;
}
```

---

## Issue 5: `console.log` vs `BrowserConsole`

### Problem

Several places in the code use `console.log` directly instead of `this.app.console`:

```typescript
// In NotesPanel.ts:
console.log("Saving notes to settings:", this.app.settings.ExtraNotes);

// In VerseScreen.ts:
console.log("VerseScreen loaded");
```

This bypasses the `BrowserConsole` controlled logging (the `enabled` flag has no effect on these).

### Proposed Fix

Replace all bare `console.*` calls with the app's `BrowserConsole` instance or the plugin's `this.console`.

---

## Issue 6: Unused Dead Code

### Problem

`src/sidepanels.ts` contains `notesPanelZZZ` — an old implementation that is no longer referenced:

```typescript
export class notesPanelZZZ extends sidePanel<TouchGrassBibleApp> {
  // ... 40+ lines of dead code
}
```

There are also commented-out code blocks in `main.ts` and `VerseScreen.ts`.

### Proposed Fix

Delete unused code. TypeScript's `noUnusedLocals` catches variables, but not unused exported classes. A code review or dead code detection tool would help identify these.

---

## Issue 7: Type Safety in `AIchat`

### Problem

`AIchat.ts` uses `any` in several places:

```typescript
async sendChatRequest(options: any, streamcallback?: (textFragment: any) => boolean): Promise<any>
static async handleStreamingResponse(response: Response, streamcallback: (textFragment: any) => boolean)
```

### Proposed Fix

Define proper types:

```typescript
type ChatMessage = { role: string; content: string };
type ChatDelta = { content?: string; tool_calls?: ToolCall[] };
type ChatRequestOptions = {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  stream: boolean;
};

async sendChatRequest(options: ChatRequestOptions, streamcallback?: (delta: ChatDelta) => boolean)
```

---

## Issue 8: Module Circular Dependencies

### Observation

Several modules import from `"./main"` which re-exports everything. This creates a star-shaped import graph that could lead to circular dependency issues or larger bundles than necessary. For example:

- `VerseScreen.ts` imports from `"./main"`
- `main.ts` imports from `"./VerseScreen"`

These are circular imports that work in practice because esbuild handles them, but they can cause initialization order issues.

### Proposed Fix

Separate the re-export barrel (`main.ts`) from the entry point logic. For example, create a `src/exports.ts` that only re-exports, and keep `main.ts` purely as the entry point.

---

## Issue 9: `topicListCategory` vs `TopicListCategoryID`

### Problem

In `TopicalBible.ts`:
```typescript
export const TopicListCategoryID = "topics";
```

But in the verse action:
```typescript
this.app.openCommandPalette({ topCategory: "topic-list" });
```

The hardcoded string `"topic-list"` doesn't match the registered ID `"topics"`. This means clicking the topic verse action button won't navigate to the topics palette.

### Fix

```typescript
// Replace "topic-list" with TopicListCategoryID:
this.app.openCommandPalette({ topCategory: TopicListCategoryID });
```
