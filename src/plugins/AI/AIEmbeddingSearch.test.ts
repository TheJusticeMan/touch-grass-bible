import { afterEach, describe, expect, test, vi } from "vitest";
import van from "vanjs-core";
import type { CommandPaletteState } from "@touchgrass/framework";
import type { stateMapping } from "@touchgrass/framework";
import { VerseRef } from "src/models/VerseRef";
import { AIEmbeddingSearchCategory } from "./AIEmbeddingSearch";
import type AIPlugin from "./AI";
import type { AIEmbeddingSearchDB } from "./AIEmbeddingSearchDB";

function makeState(): stateMapping<CommandPaletteState> {
  return {
    expanded: van.state(true),
    query: van.state(""),
    topCategory: van.state("ai-embedding-search"),
    maxItems: van.state(15),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AIEmbeddingSearchCategory async results", () => {
  test("hides stale hits and ignores an older search that finishes after a newer query", async () => {
    vi.useFakeTimers();
    const oldSearch =
      deferred<
        Array<{ document: { book: string; chapter: number; verse: number; text: string }; score: number }>
      >();
    const newSearch =
      deferred<
        Array<{ document: { book: string; chapter: number; verse: number; text: string }; score: number }>
      >();
    let searchCount = 0;
    const dbService = {
      initialize: vi.fn().mockResolvedValue(true),
      errorMessage: "",
      sourceProvider: "ollama",
      sourceModel: "nomic-embed-text",
      searchByEmbedding: vi.fn(() => (searchCount++ === 0 ? oldSearch.promise : newSearch.promise)),
    } as unknown as AIEmbeddingSearchDB;
    const fetchSignals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        fetchSignals.push(init?.signal as AbortSignal);
        const body = JSON.parse(String(init?.body)) as { prompt: string };
        return {
          ok: true,
          json: async () => ({ embedding: [body.prompt === "old query" ? 1 : 2] }),
        } as Response;
      }),
    );

    const plugin = {
      settings: { aiApiKey: "" },
      chat: { endpoint: "http://localhost:1234/v1/chat/completions" },
      app: { verseState: { val: new VerseRef("GENESIS", 1, 1) } },
    } as unknown as AIPlugin;
    const category = new AIEmbeddingSearchCategory(makeState(), plugin, dbService);
    const state = category.state;

    state.query.val = "old query";
    await vi.advanceTimersByTimeAsync(250);
    await flushMicrotasks();
    expect(dbService.searchByEmbedding).toHaveBeenCalledTimes(1);
    expect(category.asyncStatus.val.state).toBe("loading");

    state.query.val = "new query";
    await flushMicrotasks();
    expect(category.allItems.val).toEqual([{ type: "query", query: "new query" }]);
    expect(fetchSignals[0].aborted).toBe(true);

    await vi.advanceTimersByTimeAsync(250);
    await flushMicrotasks();
    expect(dbService.searchByEmbedding).toHaveBeenCalledTimes(2);

    oldSearch.resolve([
      { document: { book: "GENESIS", chapter: 1, verse: 1, text: "stale verse" }, score: 0.9 },
    ]);
    await flushMicrotasks();
    expect(dbService.searchByEmbedding).toHaveBeenCalledTimes(2);
    expect(category.allItems.val).toEqual([{ type: "query", query: "new query" }]);

    newSearch.resolve([
      { document: { book: "GENESIS", chapter: 1, verse: 2, text: "current verse" }, score: 0.95 },
    ]);
    await flushMicrotasks();

    expect(category.allItems.val).toHaveLength(2);
    expect(category.allItems.val.some(item => item.type === "hit" && item.hit.text === "stale verse")).toBe(
      false,
    );
    expect(category.allItems.val.some(item => item.type === "hit" && item.hit.text === "current verse")).toBe(
      true,
    );
    expect(category.asyncStatus.val.state).toBe("success");
  });
});
