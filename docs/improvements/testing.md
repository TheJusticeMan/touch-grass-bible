# Testing Strategy

---

## Current State

There is currently no test suite. `npm test` prints:

```
Error: no test specified
```

The `package.json` includes `@types/jest` as a dev dependency, suggesting Jest was considered but never implemented.

---

## Recommended Testing Stack

### Vitest (Recommended)

[Vitest](https://vitest.dev/) is the modern choice for TypeScript+ESM projects. It:

- Works natively with ES modules (no CommonJS transform needed)
- Has a Jest-compatible API (easy migration)
- Runs fast with esbuild transforms
- Works well with TypeScript strict mode

```bash
npm install --save-dev vitest @vitest/coverage-v8
```

Add to `package.json`:

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage"
}
```

---

## What to Test

### Priority 1: Pure Logic (No DOM Required)

These can be tested with just Node.js — no browser needed.

#### `VerseRef` — Core Model

```typescript
// src/VerseRef.test.ts
describe("VerseRef", () => {
  test("toOSIS converts correctly", () => {
    const ref = new VerseRef("GENESIS", 1, 1);
    expect(ref.toOSIS()).toBe("Gen.1.1");
  });

  test("fromOSIS parses correctly", () => {
    const ref = VerseRef.fromOSIS("John.3.16");
    expect(ref.book).toBe("JOHN");
    expect(ref.chapter).toBe(3);
    expect(ref.verse).toBe(16);
  });

  test("nextChapter wraps around at end of Bible", () => {
    // Set up mock data
    VerseRef.bibleTranslations = mockBibleData;
    const rev = new VerseRef("REVELATION", 22, 1);
    const next = rev.nextChapter;
    expect(next.book).toBe("GENESIS");
    expect(next.chapter).toBe(1);
  });

  test("prevChapter wraps around at beginning", () => {
    const gen = new VerseRef("GENESIS", 1, 1);
    const prev = gen.prevChapter;
    expect(prev.book).toBe("REVELATION");
  });

  test("isSame returns false for different verses", () => {
    const a = new VerseRef("JOHN", 3, 16);
    const b = new VerseRef("JOHN", 3, 17);
    expect(a.isSame(b)).toBe(false);
  });

  test("note getter/setter uses OSIS as key", () => {
    VerseRef.myNotes = new Map();
    const ref = new VerseRef("JOHN", 3, 16);
    ref.note = "Test note";
    expect(VerseRef.myNotes.get("John.3.16")).toBe("Test note");
  });

  test("note setter deletes entry on empty string", () => {
    const ref = new VerseRef("JOHN", 3, 16);
    ref.note = "Something";
    ref.note = "  "; // Whitespace only
    expect(VerseRef.myNotes.has("John.3.16")).toBe(false);
  });
});
```

#### `BibleTopics` — Bookmark Logic

```typescript
describe("BibleTopics", () => {
  test("add creates topic on first add", () => {
    const topics = new BibleTopics({});
    const ref = new VerseRef("JOHN", 3, 16);
    topics.add("Favorites", ref);
    expect(topics.has("Favorites")).toBe(true);
    expect(topics.get("Favorites")).toHaveLength(1);
  });

  test("remove deletes topic when no verses remain", () => {
    const ref = new VerseRef("JOHN", 3, 16);
    const topics = new BibleTopics({
      Favorites: [["John.3.16", 0]],
    });
    topics.remove("Favorites", ref);
    expect(topics.has("Favorites")).toBe(false);
  });

  test("getTopicsFromVerse finds correct topics", () => {
    const data = {
      Faith: [["Heb.11.1", 0]],
      Salvation: [
        ["John.3.16", 0],
        ["Heb.11.1", 0],
      ],
    };
    const topics = new BibleTopics(data);
    const result = topics.getTopicsFromVerse(new VerseRef("HEBREWS", 11, 1));
    expect(result).toContain("Faith");
    expect(result).toContain("Salvation");
  });

  test("toJSON roundtrips correctly", () => {
    const data = { Test: [["Gen.1.1", 5]] };
    const topics = new BibleTopics(data);
    expect(topics.toJSON()).toEqual(data);
  });
});
```

#### Settings Serialization

```typescript
describe("TGAppSettings", () => {
  test("DEFAULT_SETTINGS has expected shape", () => {
    expect(DEFAULT_SETTINGS.myNotes).toEqual([]);
    expect(DEFAULT_SETTINGS.Bookmarks["Start Up Verses"]).toHaveLength(6);
    expect(DEFAULT_SETTINGS.style.Font).toBe("Fontserif");
  });
});
```

---

### Priority 2: Plugin Logic (Minimal DOM Mock)

#### `BibleSearchCategory`

```typescript
describe("BibleSearchCategory", () => {
  test("getCommands returns matching verses", () => {
    VerseRef.bibleTranslations = { KJV: mockBibleData };
    VerseRef.defaultTranslation = "KJV";
    const category = new BibleSearchCategory(mockPalette, mockPlugin);
    const results = category.getCommands("beginning");
    expect(results[0].book).toBe("GENESIS");
    expect(results[0].chapter).toBe(1);
    expect(results[0].verse).toBe(1);
  });

  test("getCommands returns empty for empty query", () => {
    const category = new BibleSearchCategory(mockPalette, mockPlugin);
    expect(category.getCommands("")).toHaveLength(0);
  });
});
```

#### `VerseListCategory.convertTopicDate`

```typescript
describe("convertTopicDate", () => {
  test("returns Today for today's date", () => {
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0]; // YYYY-MM-DD
    expect(VerseListCategory.convertTopicDate(dateStr)).toBe("Today");
  });

  test("title-cases non-date strings", () => {
    expect(VerseListCategory.convertTopicDate("faith hope love")).toBe("Faith Hope Love");
  });
});
```

---

### Priority 3: Integration Tests

Test that plugins load and register correctly:

```typescript
describe("Plugin loading", () => {
  test("BookmarkPlugin registers two palettes", () => {
    const app = createMockApp();
    new BookmarkPlugin(app, manifest).load();
    expect(app.commandPalette.hasPalette("bookmarks")).toBe(true);
    expect(app.commandPalette.hasPalette("verse-list")).toBe(true);
  });

  test("Plugin unload removes all registrations", async () => {
    const app = createMockApp();
    const plugin = new BookmarkPlugin(app, manifest);
    await plugin.load();
    await plugin.unload();
    expect(app.commandPalette.hasPalette("bookmarks")).toBe(false);
  });
});
```

---

### Priority 4: End-to-End Tests

Using [Playwright](https://playwright.dev/) for browser-based E2E:

```typescript
test("app loads and displays a verse", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await page.waitForSelector(".verse");
  const verse = await page.locator(".verse").first().textContent();
  expect(verse).toBeTruthy();
});

test("command palette opens with Ctrl+Enter", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await page.keyboard.press("Control+Enter");
  await page.waitForSelector(".command-palette");
  expect(await page.isVisible(".command-palette")).toBe(true);
});
```

---

## Test Organization

Recommended file structure:

```
src/
├── VerseRef.ts
├── VerseRef.test.ts          ← Unit tests for VerseRef
├── BibleTopics.ts
├── BibleTopics.test.ts       ← Unit tests for BibleTopics
├── plugins/
│   ├── Bookmarks.ts
│   ├── Bookmarks.test.ts     ← Unit/integration tests
│   ├── Search.ts
│   └── Search.test.ts
└── ...
tests/
└── e2e/
    └── app.test.ts           ← Playwright E2E tests
```

---

## Mock Helpers

A shared test utilities file would help:

```typescript
// src/test-utils.ts
export const mockBibleData = {
  KJV: {
    GENESIS: [null, [null, "1 In the beginning God created..."]],
  },
};

export function createMockPalette(): UnifiedCommandPalette {
  // Minimal mock
}

export function createMockApp(): TouchGrassBibleApp {
  // Minimal mock
}
```

---

## Coverage Goals

| Module                     | Target Coverage                |
| -------------------------- | ------------------------------ |
| `VerseRef`                 | 90%                            |
| `BibleTopics`              | 90%                            |
| `TGAppSettings`            | 80%                            |
| Plugins (logic)            | 70%                            |
| Framework (App, Workspace) | 50%                            |
| UI components              | 30% (hard to test without DOM) |
