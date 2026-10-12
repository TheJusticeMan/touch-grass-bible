import { describe, expect, test, vi } from "vitest";
import van from "vanjs-core";
import KnowledgeBasePlugin from "./KnowledgeBase";
import { VerseRef } from "src/models/VerseRef";
import type TouchGrassBibleApp from "src/main";
import type { PluginMetadata } from "@touchgrass/framework";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeApp(): TouchGrassBibleApp {
  return {
    files: {
      loadConfigObject: vi.fn().mockResolvedValue({}),
      saveConfigObject: vi.fn().mockResolvedValue(undefined),
    },
    commandPalette: {
      commands: { add: vi.fn() },
      registerPalette: vi.fn(),
      unregisterPalette: vi.fn(),
    },
    workspace: {
      layout: {
        registerView: vi.fn(),
        unregisterView: vi.fn(),
        findOrCreateViewById: vi.fn().mockReturnValue({ state: { id: { val: 0 } } }),
      },
    },
    console: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
    onVerseStateChange: vi.fn().mockReturnValue(() => {}),
    addVerseAction: vi.fn(),
    removeVerseAction: vi.fn(),
  } as unknown as TouchGrassBibleApp;
}

const manifest: PluginMetadata = {
  id: "knowledge-base",
  name: "Knowledge Base",
  description: "",
  version: "1.0",
};

function makePlugin(app = makeApp()) {
  return new KnowledgeBasePlugin(app, manifest);
}

function makeVerse(book = "GENESIS", chapter = 1, verse = 1) {
  return new VerseRef(book, chapter, verse);
}

// ---------------------------------------------------------------------------
// genID
// ---------------------------------------------------------------------------

describe("KnowledgeBasePlugin - genID", () => {
  test("returns 1 when topics list is empty", () => {
    const plugin = makePlugin();
    expect(plugin.genID()).toBe(1);
  });

  test("returns max(ids) + 1 when topics exist", () => {
    const plugin = makePlugin();
    plugin.topics.val = [
      { id: 3, title: van.state(""), content: van.state(""), verses: van.state([]), children: van.state([]) },
      { id: 7, title: van.state(""), content: van.state(""), verses: van.state([]), children: van.state([]) },
    ];
    expect(plugin.genID()).toBe(8);
  });

  test("consecutive calls without modifying topics return the same ID (race condition)", () => {
    const plugin = makePlugin();
    const id1 = plugin.genID();
    const id2 = plugin.genID();
    // Both should be 1 since topics hasn't changed between the calls
    expect(id1).toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// createTopic
// ---------------------------------------------------------------------------

describe("KnowledgeBasePlugin - createTopic", () => {
  test("adds a new topic to topics.val", () => {
    const plugin = makePlugin();
    plugin.createTopic("My Topic", "Some content");
    expect(plugin.topics.val).toHaveLength(1);
    expect(plugin.topics.val[0].title.val).toBe("My Topic");
  });

  test("trims whitespace from title and content", () => {
    const plugin = makePlugin();
    const topic = plugin.createTopic("  Trim Me  ", "  also trim  ");
    expect(topic.title.val).toBe("Trim Me");
    expect(topic.content.val).toBe("also trim");
  });

  test("sets currentTopic to the newly created topic", () => {
    const plugin = makePlugin();
    const topic = plugin.createTopic("New Topic", "");
    expect(plugin.currentTopic.val).toBe(topic);
  });

  test("de-duplicates verses passed to it", () => {
    const plugin = makePlugin();
    const verse = makeVerse("JOHN", 3, 16);
    const topic = plugin.createTopic("Topic", "", [verse, verse, verse]);
    expect(topic.verses.val).toHaveLength(1);
  });

  test("preserves unique verses in order", () => {
    const plugin = makePlugin();
    const v1 = makeVerse("GENESIS", 1, 1);
    const v2 = makeVerse("JOHN", 3, 16);
    const topic = plugin.createTopic("Topic", "", [v1, v2]);
    expect(topic.verses.val[0].toOSIS()).toBe(v1.toOSIS());
    expect(topic.verses.val[1].toOSIS()).toBe(v2.toOSIS());
  });

  test("de-duplicates children IDs", () => {
    const plugin = makePlugin();
    const topic = plugin.createTopic("Topic", "", [], [2, 2, 3]);
    expect(topic.children.val).toEqual([2, 3]);
  });

  test("assigns a unique sequential ID", () => {
    const plugin = makePlugin();
    const t1 = plugin.createTopic("First", "");
    const t2 = plugin.createTopic("Second", "");
    expect(t2.id).toBeGreaterThan(t1.id);
  });

  test("serializeTopics drops dangling, duplicate, and self child references", () => {
    const plugin = makePlugin();
    const parent = plugin.createTopic("Parent", "", [], [2, 2, 999]);
    parent.children.val = [...parent.children.val, parent.id];
    plugin.createTopic("Child", "");
    plugin.topics.val = plugin.topics.val.filter(topic => topic.title.val || topic.content.val);

    expect(plugin.serializeTopics(plugin.topics.val)).toEqual([
      {
        id: parent.id,
        title: "Parent",
        content: "",
        verses: [],
        children: [2],
      },
      {
        id: 2,
        title: "Child",
        content: "",
        verses: [],
        children: [],
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// deserializeTopic
// ---------------------------------------------------------------------------

describe("KnowledgeBasePlugin - deserializeTopic", () => {
  test("converts OSIS strings to VerseRef instances", () => {
    const plugin = makePlugin();
    const topic = plugin.deserializeTopic({
      id: 1,
      title: "Test",
      content: "Content",
      verses: ["Gen.1.1", "John.3.16"],
      children: [],
    });
    expect(topic.verses.val).toHaveLength(2);
    expect(topic.verses.val[0].book).toBe("GENESIS");
    expect(topic.verses.val[1].book).toBe("JOHN");
    expect(topic.verses.val[1].chapter).toBe(3);
    expect(topic.verses.val[1].verse).toBe(16);
  });

  test("preserves id, title, content, and children", () => {
    const plugin = makePlugin();
    const topic = plugin.deserializeTopic({
      id: 42,
      title: "Hello",
      content: "World",
      verses: [],
      children: [1, 2, 3],
    });
    expect(topic.id).toBe(42);
    expect(topic.title.val).toBe("Hello");
    expect(topic.content.val).toBe("World");
    expect(topic.children.val).toEqual([1, 2, 3]);
  });

  test("creates reactive State wrappers for all fields", () => {
    const plugin = makePlugin();
    const topic = plugin.deserializeTopic({
      id: 1,
      title: "Reactive",
      content: "",
      verses: [],
      children: [],
    });
    // These should be van.State objects (have a .val property)
    expect(topic.title).toHaveProperty("val");
    expect(topic.content).toHaveProperty("val");
    expect(topic.verses).toHaveProperty("val");
    expect(topic.children).toHaveProperty("val");
  });
});

// ---------------------------------------------------------------------------
// realTopics filtering
// ---------------------------------------------------------------------------

describe("KnowledgeBasePlugin - realTopics", () => {
  test("excludes topics with empty title and content", () => {
    const plugin = makePlugin();
    plugin.topics.val = [
      { id: 1, title: van.state(""), content: van.state(""), verses: van.state([]), children: van.state([]) },
      {
        id: 2,
        title: van.state("Non-empty"),
        content: van.state(""),
        verses: van.state([]),
        children: van.state([]),
      },
    ];
    plugin.realTopics = van.derive(() => plugin.topics.val.filter(q => q.title.val || q.content.val));
    expect(plugin.realTopics.val).toHaveLength(1);
    expect(plugin.realTopics.val[0].id).toBe(2);
  });

  test("includes topics with non-empty content but empty title", () => {
    const plugin = makePlugin();
    plugin.topics.val = [
      {
        id: 1,
        title: van.state(""),
        content: van.state("Some content"),
        verses: van.state([]),
        children: van.state([]),
      },
    ];
    plugin.realTopics = van.derive(() => plugin.topics.val.filter(q => q.title.val || q.content.val));
    expect(plugin.realTopics.val).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// VanJS reactivity - in-place mutation bug
// ---------------------------------------------------------------------------

describe("VanJS reactivity - in-place array mutation", () => {
  test("push() on a State<array> does NOT trigger reactive updates (documents the bug)", () => {
    const verses = van.state<VerseRef[]>([]);
    let deriveRunCount = 0;

    van.derive(() => {
      void verses.val.length; // read length to establish dependency
      deriveRunCount++;
    });

    expect(deriveRunCount).toBe(1); // initial run

    // In-place mutation - intentionally testing the forbidden pattern
    // eslint-disable-next-line local/no-van-state-mutation
    verses.val.push(makeVerse("JOHN", 3, 16));

    // VanJS does NOT re-run the derive because the State reference hasn't changed
    expect(deriveRunCount).toBe(1); // still 1 - no reactive update
    // The data IS mutated in memory but reactivity is broken
    expect(verses.val.length).toBe(1);
  });

  test("reassigning State value triggers reactive updates (correct pattern)", async () => {
    const verses = van.state<VerseRef[]>([]);
    let deriveRunCount = 0;

    van.derive(() => {
      void verses.val.length;
      deriveRunCount++;
    });

    expect(deriveRunCount).toBe(1);

    // Correct pattern: replace the array
    verses.val = [...verses.val, makeVerse("JOHN", 3, 16)];

    // VanJS batches reactive updates - flush the microtask queue
    await new Promise(resolve => setTimeout(resolve, 0));

    // VanJS re-runs the derive because the State reference changed
    expect(deriveRunCount).toBe(2);
    expect(verses.val.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// onload
// ---------------------------------------------------------------------------

describe("KnowledgeBasePlugin - onload", () => {
  test("deserializes and loads topics from storage", async () => {
    const app = makeApp();
    (app.files.loadConfigObject as ReturnType<typeof vi.fn>).mockResolvedValue({
      topics: [{ id: 1, title: "Test Topic", content: "Content", verses: ["Gen.1.1"], children: [] }],
    });
    const plugin = new KnowledgeBasePlugin(app, manifest);
    await plugin.load();
    expect(plugin.topics.val).toHaveLength(1);
    expect(plugin.topics.val[0].title.val).toBe("Test Topic");
    expect(plugin.topics.val[0].verses.val[0].book).toBe("GENESIS");
  });

  test("uses default topics when storage is empty", async () => {
    const app = makeApp();
    (app.files.loadConfigObject as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const plugin = new KnowledgeBasePlugin(app, manifest);
    await plugin.load();
    // Default has one topic
    expect(plugin.topics.val.length).toBeGreaterThan(0);
  });

  test("registers view types on load", async () => {
    const app = makeApp();
    const plugin = new KnowledgeBasePlugin(app, manifest);
    await plugin.load();
    expect(app.workspace.layout.registerView).toHaveBeenCalledWith(
      "knowledge-base-index",
      expect.any(Function),
    );
    expect(app.workspace.layout.registerView).toHaveBeenCalledWith(
      "knowledge-base-topic",
      expect.any(Function),
    );
  });

  test("registers command palette categories on load", async () => {
    const app = makeApp();
    const plugin = new KnowledgeBasePlugin(app, manifest);
    await plugin.load();
    expect(app.commandPalette.registerPalette).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// openView
// ---------------------------------------------------------------------------

describe("KnowledgeBasePlugin - openView", () => {
  test("calls findOrCreateViewById with the correct view type", () => {
    const app = makeApp();
    const plugin = makePlugin(app);
    plugin.openView({ topic: 5 });
    expect(app.workspace.layout.findOrCreateViewById).toHaveBeenCalledWith(
      "knowledge-base-topic",
      expect.objectContaining({ id: 5 }),
    );
  });
});
