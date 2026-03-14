# `TopicalBiblePlugin` — Topic Browsing

**File:** `src/plugins/TopicalBible.ts`

---

## Overview

`TopicalBiblePlugin` loads topic-to-verse mappings from [OpenBible.info](https://www.openbible.info/topics/) and provides a two-level browsable interface: topic list → verses in topic.

---

## Data Source

Topics data is loaded from `topics.json` at startup:

```typescript
this.topics = new BibleTopics(await this.app.loadJSON<BibleTopicsType>("topics.json"));
```

The `topics.json` file contains thousands of topics (e.g., "faith", "prayer", "love") each mapped to a scored list of relevant verses.

---

## Plugin Class

### State

```typescript
topics: BibleTopics = new BibleTopics({}); // Full topic database
topic = this.app.commandPalette.useState(""); // Currently selected topic
```

### Verse Action

**ID:** `"topic"`  
**Icon:** `GitCompare` (Lucide)

When triggered on a verse, displays all topics this verse belongs to as buttons. Clicking a topic button:

1. Sets `plugin.topic` state to the topic name
2. Opens the command palette with `topCategory: "topic-list"`

**Bug:** The verse action uses the hardcoded string `"topic-list"` as the `topCategory`, but the registered palette ID is `TopicListCategoryID = "topics"`. This means clicking the topic verse action button does **not** navigate to the topics palette. The fix is to replace the hardcoded string with the exported constant:

```typescript
// Current (broken):
this.app.openCommandPalette({ topCategory: "topic-list" });

// Fixed:
this.app.openCommandPalette({ topCategory: TopicListCategoryID });
```

---

## `topicListCategory`

**Category ID:** `"topics"`

Two-level navigation:

### Level 1: Topic List (when `topic` state is empty)

- Requires a query to show results (returns empty for blank query)
- Fuzzy-matches all topic names
- Each result is a topic name; selecting it sets `topic` state and re-triggers the category

### Level 2: Verse List (when `topic` state is set)

- Shows all verses in the selected topic
- Adds a "Clear topic filter" command to return to Level 1
- Fuzzy-matches by verse reference and verse text
- Selecting a verse sets `app.verseState` and switches to TSK cross-references

### `renderCommand` Polymorphism

The category handles both `string` (topic names) and `VerseRef` (verses):

```typescript
renderCommand(command: VerseRef | string, Item): StateTransition {
  if (typeof command === "string") {
    // Topic name: set topic state, stay in this category
    Item.setTitle(command.toTitleCase()).addctx();
    return state => {
      this.topic.set(command);
      return state.update({ topCategory: TopicListCategoryID });
    };
  } else {
    // VerseRef: navigate to verse, switch to cross-references
    Item.setTitle(command.toString()).setDescription(command.vTXT).addctx();
    return state => {
      this.plugin.app.verseState.set(command);
      return state.update({ topCategory: TSKCrossRefCategoryID });
    };
  }
}
```

---

## Exported Constant

```typescript
export const TopicListCategoryID = "topics";
```
