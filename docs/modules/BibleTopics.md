# `BibleTopics` — Topic and Bookmark Management

**File:** `src/BibleTopics.ts`  
**Class:** `BibleTopics`

---

## Purpose

`BibleTopics` manages a collection of named topics, each associated with a set of Bible verse references (OSIS strings) and optional numeric ratings. It is used for:

1. **User bookmarks** — stored in `VerseRef.Bookmarks`, persisted in `TGAppSettings.Bookmarks`
2. **OpenBible topical index** — loaded from `topics.json` by `TopicalBiblePlugin`
3. **Reading history** — automatic daily history via `addToHistory()`

---

## Types

```typescript
export type OSISString = string; // e.g. "John.3.16"
type BibleTopicReference = [OSISString, number]; // [OSIS, rating/score]
export type BibleTopicsType = { [topic: string]: BibleTopicReference[] };
```

`BibleTopicsType` is a plain JSON-serializable object, used for persistence and data loading. `BibleTopics` wraps this structure in a `Map<string, Map<OSISString, number>>` for efficient lookup.

---

## Constructor

```typescript
constructor(data: BibleTopicsType)
```

Converts the input JSON-like `BibleTopicsType` object into internal `Map` structures.

```typescript
const bookmarks = new BibleTopics({
  Favorites: [
    ["John.3.16", 0],
    ["Ps.23.1", 0],
  ],
});
```

---

## Methods

### Reading

```typescript
get(topic: string): VerseRef[]
// Returns all verses in the topic as VerseRef instances.
// Returns [] if topic does not exist.

has(topic: string): boolean
// Returns true if the topic exists.

get keys(): string[]
// Returns all topic names.

getTopicsFromVerse(verse: VerseRef): string[]
// Returns all topic names that contain this verse.
// Used by VerseRef.bookmarkList and VerseRef.Bookmarks()
```

### Writing

```typescript
set(topic: string, ...refs: VerseRef[]): void
// Creates or replaces the topic with the given verse set.
// Ratings all default to 0.

add(topic: string, ...refs: VerseRef[]): void
// Adds verses to a topic. Creates the topic if it doesn't exist.
// Does not change rating for already-existing entries.

addData(data: BibleTopicsType): void
// Merges an entire BibleTopicsType object into the current collection.
// New topics are added; existing topics have new verses merged in.

remove(topic: string, ...refs: VerseRef[]): void
// Removes specific verses from a topic.
// Deletes the topic entirely if no verses remain.

delete(topic: string): void
// Removes the entire topic.
```

### History

```typescript
addToHistory(verse: VerseRef): void
// Adds the verse to a topic named with the current date (YYYY-MM-DD).
// Used to build an automatic reading history.

private get CurrentDateLocal(): string
// Returns today's date as "YYYY-MM-DD" in local time.
```

### Serialization

```typescript
toJSON(): BibleTopicsType
// Converts back to JSON-serializable plain object.
// Used before saving settings to localStorage.
```

---

## Bookmark Usage Pattern

The `VerseRef.Bookmarks` static property is the central bookmarks store:

```typescript
// Initialize from saved settings
VerseRef.Bookmarks = new BibleTopics(settings.Bookmarks);

// Add a verse to a named bookmark tag
VerseRef.Bookmarks.add("Faith", new VerseRef("HEBREWS", 11, 1));

// Get all verses in a tag
const faithVerses = VerseRef.Bookmarks.get("Faith");

// Find which tags a verse belongs to
const verse = new VerseRef("JOHN", 3, 16);
const tags = verse.bookmarkList; // e.g. ["Favorites", "John 3"]

// Serialize back to settings
settings.Bookmarks = VerseRef.Bookmarks.toJSON();
```

---

## Data Integrity

- Adding a verse to a topic that already contains that verse does **not** duplicate it (Map key uniqueness).
- Removing all verses from a topic automatically deletes the topic.
- Topic names are arbitrary strings — they can be tag names (`"Faith"`), dates (`"2024-01-01"`), or any string the user or system chooses.

---

## Default Bookmarks

The default settings include a "Start Up Verses" topic with 6 classic verses:

```typescript
Bookmarks: {
  "Start Up Verses": [
    ["Gen.1.1", 0],
    ["John.3.16", 0],
    ["Ps.23.2", 0],
    ["1Cor.13.4", 0],
    ["Phil.4.13", 0],
    ["Rom.8.28", 0],
  ]
}
```
