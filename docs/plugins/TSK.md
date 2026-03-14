# `TSK` — Cross-References

**File:** `src/plugins/TSK.ts`

---

## Overview

`TSK` (Treasury of Scripture Knowledge+) provides access to cross-reference data sourced from [OpenBible.info](https://www.openbible.info/labs/cross-references/). Each verse's cross-references are sorted by vote count (community-ranked relevance).

---

## Data Source

Cross-reference data is loaded from `crossrefs.json` at plugin load time:

```typescript
this.crossRefs = await this.app.loadJSON<{ [OSIS: string]: [OSIS, number][] }>("crossrefs.json");
```

**Format:**

```json
{
  "Gen.1.1": [
    ["John.1.1", 42],
    ["Ps.33.6", 38],
    ...
  ],
  "John.3.16": [
    ["Rom.5.8", 156],
    ...
  ]
}
```

Each entry is `[targetOSIS, voteCount]`. The vote count reflects how many users of OpenBible.info ranked this as a relevant cross-reference.

---

## `TSK` Plugin Class

```typescript
export default class TSK extends Plugin {
  crossRefs: { [OSIS: string]: [OSIS, number][] } = {};

  async onload(): Promise<void>;
  crossRefsForVerse(verse: VerseRef): VerseRef[];
}
```

### `crossRefsForVerse(verse)`

Returns cross-references sorted by vote count (highest first), converted to `VerseRef` instances.

```typescript
crossRefsForVerse(verse: VerseRef): VerseRef[] {
  return this.crossRefs[verse.toOSIS()]
    .sort(([, a], [, b]) => b - a)  // Sort descending by votes
    .map(([ref]) => VerseRef.fromOSIS(ref))
    .filter(ref => ref !== null);
}
```

### Verse Action

**ID:** `"cross-ref"`  
**Icon:** `Waypoints` (Lucide)

Clicking the cross-reference button on a verse:

1. Sets `app.verseState` to the selected verse
2. Opens the command palette with `topCategory: "tsk-cross-ref"`

---

## `CrossRefCategory`

**Category ID:** `"tsk-cross-ref"`

Displays cross-references for the currently selected verse.

### Behavior

- `onTrigger()` fetches cross-references for `app.verseState.get()` and sets the title
- `getCommands(query)` fuzzy-filters results by verse reference string and verse text
- Each result shows verse reference and full verse text
- Selecting a result sets `app.verseState` to the cross-reference verse and keeps the category as `"tsk-cross-ref"` (allowing further chaining)

### Chain Navigation

Cross-references chain on themselves — selecting a cross-reference shows cross-references for that verse:

```
John 3:16 → shows cross-refs
→ select "Rom 5:8"
→ shows cross-refs for Romans 5:8
→ select "John 15:13"
→ shows cross-refs for John 15:13
...
```

---

## Exported Constant

```typescript
export const TSKCrossRefCategoryID = "tsk-cross-ref";
```

This ID is the default landing category after most navigation actions (search results, go-to-verse, bookmarks). The cross-reference view acts as the "landing page" for a selected verse.
