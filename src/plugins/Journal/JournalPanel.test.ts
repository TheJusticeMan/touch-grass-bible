// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { LayoutNode } from "../../external/Workspace";
import type { JournalDay, JournalEntry, JournalStorage } from "./journal-storage";
import { EditableJournalEntry, JournalPanel } from "./JournalPanel";
import { VerseRef } from "../../models/VerseRef";

function installDomPolyfills(): void {
  const prototype = HTMLElement.prototype as unknown as Record<string, unknown>;

  if (typeof prototype.empty !== "function") {
    Object.defineProperty(prototype, "empty", {
      configurable: true,
      value: function empty(this: HTMLElement): HTMLElement {
        this.replaceChildren();
        return this;
      },
    });
  }

  if (typeof prototype.createEl !== "function") {
    Object.defineProperty(prototype, "createEl", {
      configurable: true,
      value: function createEl<K extends keyof HTMLElementTagNameMap>(
        this: HTMLElement,
        tagName: K,
        options?: {
          text?: string;
          cls?: string | string[];
          attr?: Record<string, string>;
        },
        callback?: (el: HTMLElementTagNameMap[K]) => void,
      ): HTMLElementTagNameMap[K] {
        const element = document.createElement(tagName);
        if (options?.text !== undefined) {
          element.textContent = options.text;
        }
        if (options?.cls) {
          const classes = Array.isArray(options.cls) ? options.cls : [options.cls];
          element.classList.add(...classes);
        }
        if (options?.attr) {
          Object.entries(options.attr).forEach(([key, value]) => {
            element.setAttribute(key, value);
          });
        }
        this.appendChild(element);
        callback?.(element);
        return element;
      },
    });
  }

  if (typeof prototype.addClass !== "function") {
    Object.defineProperty(prototype, "addClass", {
      configurable: true,
      value: function addClass(this: HTMLElement, ...classes: string[]): HTMLElement {
        if (classes.length > 0) {
          this.classList.add(...classes);
        }
        return this;
      },
    });
  }

  if (typeof prototype.scrollTo !== "function") {
    Object.defineProperty(prototype, "scrollTo", {
      configurable: true,
      value: function scrollTo(this: HTMLElement, options?: ScrollToOptions): void {
        if (typeof options?.top === "number") {
          this.scrollTop = options.top;
        }
      },
    });
  }
}

installDomPolyfills();

type JournalPanelPlugin = {
  settings: {
    appendOnly: boolean;
  };
  storage: JournalStorage;
  saveSettings: () => Promise<void>;
};

function flushPromises(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function createStorage(overrides: Partial<JournalStorage> = {}): JournalStorage {
  const base: Partial<JournalStorage> = {
    todayKey: vi.fn(() => "2026-03-22"),
    getOrCreateDay: vi.fn(async (dateKey: string) => ({ date: dateKey, entries: [] })),
    readDay: vi.fn(async () => null),
    getPreviousDayKey: vi.fn(async () => null),
    appendEntry: vi.fn(
      async (
        entry: Omit<JournalEntry, "id" | "timestamp"> & { timestamp?: number },
      ): Promise<JournalEntry> => ({
        id: "saved-entry",
        timestamp: entry.timestamp ?? 123,
        type: entry.type,
        content: entry.content,
      }),
    ),
    updateEntry: vi.fn(
      async (_dateKey: string, entryId: string, content: string): Promise<JournalEntry> => ({
        id: entryId,
        timestamp: 111,
        type: "entry",
        content,
      }),
    ),
    deleteEntry: vi.fn(async () => true),
  };

  return { ...base, ...overrides } as JournalStorage;
}

function createPlugin(storage: JournalStorage): JournalPanelPlugin {
  return {
    settings: { appendOnly: false },
    storage,
    saveSettings: vi.fn(async () => undefined),
  };
}

function createPanel(plugin: JournalPanelPlugin): JournalPanel {
  return new JournalPanel({} as LayoutNode, plugin);
}

function createDay(entries: JournalEntry[] = []): JournalDay {
  return {
    date: "2026-03-22",
    entries,
  };
}

describe("EditableJournalEntry", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("updates a persisted entry on blur", async () => {
    const storage = createStorage();
    const entry: JournalEntry = {
      id: "entry-1",
      timestamp: 10,
      type: "entry",
      content: "Old text",
    };

    const component = new EditableJournalEntry(document.body, "2026-03-22", entry, storage);
    component.element.querySelector<HTMLElement>(".journal-entry-editor")!.textContent = "New text";

    component.element
      .querySelector<HTMLElement>(".journal-entry-editor")!
      .dispatchEvent(new FocusEvent("blur"));
    await flushPromises();

    expect(storage.updateEntry).toHaveBeenCalledWith("2026-03-22", "entry-1", "New text");
    expect(entry.content).toBe("New text");
  });

  test("does not save unchanged content", async () => {
    const storage = createStorage();
    const entry: JournalEntry = {
      id: "entry-1",
      timestamp: 10,
      type: "entry",
      content: "Same text",
    };

    const component = new EditableJournalEntry(document.body, "2026-03-22", entry, storage);
    component.element.querySelector<HTMLElement>(".journal-entry-editor")!.textContent = "Same text";

    component.element
      .querySelector<HTMLElement>(".journal-entry-editor")!
      .dispatchEvent(new FocusEvent("blur"));
    await flushPromises();

    expect(storage.updateEntry).not.toHaveBeenCalled();
  });

  test("deletes an empty persisted entry and notifies the panel", async () => {
    const storage = createStorage();
    const onDelete = vi.fn();
    const entry: JournalEntry = {
      id: "entry-1",
      timestamp: 10,
      type: "entry",
      content: "Delete me",
    };

    const component = new EditableJournalEntry(document.body, "2026-03-22", entry, storage, { onDelete });
    component.element.querySelector<HTMLElement>(".journal-entry-editor")!.textContent = "";

    component.element
      .querySelector<HTMLElement>(".journal-entry-editor")!
      .dispatchEvent(new FocusEvent("blur"));
    await flushPromises();

    expect(storage.deleteEntry).toHaveBeenCalledWith("2026-03-22", "entry-1");
    expect(onDelete).toHaveBeenCalledWith(entry);
    expect(document.body.contains(component.element)).toBe(false);
  });
});

describe("JournalPanel", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    VerseRef.bibleTranslations.KJV = {
      GENESIS: [[], ["", "In the beginning"]],
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("focuses the trailing draft into a persisted entry and appends a new blank draft", async () => {
    const storage = createStorage({
      getOrCreateDay: vi.fn(async () => createDay()),
      appendEntry: vi.fn(
        async (): Promise<JournalEntry> => ({
          id: "draft-1",
          timestamp: 321,
          type: "entry",
          content: "",
        }),
      ),
    });
    const panel = createPanel(createPlugin(storage));

    await panel.onAttach();

    const firstDraft = panel.containerEl.querySelector<HTMLElement>(".journal-entry-editor");
    expect(firstDraft).not.toBeNull();

    firstDraft!.dispatchEvent(new FocusEvent("focus"));
    await flushPromises();

    expect(storage.appendEntry).toHaveBeenCalledTimes(1);
    expect(panel.containerEl.querySelectorAll(".journal-entry-editor")).toHaveLength(2);
    expect(panel.containerEl.querySelectorAll(".journal-entry-time:not([hidden])")).toHaveLength(1);
  });

  test("inserts live entries before the trailing draft row", async () => {
    const storage = createStorage({
      getOrCreateDay: vi.fn(async () => createDay()),
    });
    const panel = createPanel(createPlugin(storage));
    const liveEntry: JournalEntry = {
      id: "live-1",
      timestamp: 88,
      type: "entry",
      content: "Live text",
    };

    await panel.onAttach();
    await panel.addLiveEntry(liveEntry, "2026-03-22");

    const articles = Array.from(panel.containerEl.querySelectorAll<HTMLElement>(".journal-day article"));
    expect(articles).toHaveLength(2);
    expect(articles[0]?.querySelector(".journal-entry-content")?.textContent).toBe("Live text");
    expect(articles[1]?.querySelector(".journal-entry-time")?.hasAttribute("hidden")).toBe(true);
  });

  test("renders verse reference fallback when OSIS parsing throws", async () => {
    vi.spyOn(VerseRef, "fromOSIS").mockImplementation(() => {
      throw new Error("bad osis");
    });

    const storage = createStorage({
      getOrCreateDay: vi.fn(async () =>
        createDay([
          {
            id: "verse-1",
            timestamp: 50,
            type: "verse-ref",
            content: "not-a-ref",
          },
        ]),
      ),
    });
    const panel = createPanel(createPlugin(storage));

    await panel.onAttach();

    expect(panel.containerEl.querySelector(".journal-verse-ref.error")?.textContent).toContain("not-a-ref");
  });
});
