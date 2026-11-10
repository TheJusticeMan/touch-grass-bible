import { CommandCategory, CommandItem, CommandPaletteState, stateMapping, van } from "@touchgrass/framework";
import { VerseRef } from "src/models/VerseRef";
import { AICategoryID, SettingsCategoryID } from "src/plugins/categoryIDs";
import type AIPlugin from "./AI";
import { AIEmbeddingSearchDB } from "./AIEmbeddingSearchDB";

type EmbeddingSearchCommand = { type: "query"; query: string } | { type: "hit"; hit: EmbeddingSearchHit };

type EmbeddingSearchHit = {
  verse: VerseRef;
  text: string;
  score: number;
};

export class AIEmbeddingSearchCategory extends CommandCategory<EmbeddingSearchCommand> {
  allItems = van.state<EmbeddingSearchCommand[]>([]);
  criteria: Array<(item: EmbeddingSearchCommand) => string> = [
    item => (item.type === "query" ? item.query : item.hit.verse.toString()),
    item => (item.type === "query" ? item.query : item.hit.text),
  ];

  private lastQuery = van.state("");
  private lastResults = van.state<EmbeddingSearchHit[]>([]);
  private resultsQuery = van.state("");
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    state: stateMapping<CommandPaletteState>,
    public plugin: AIPlugin,
    private dbService: AIEmbeddingSearchDB,
  ) {
    super(
      state,
      "AI Semantic Verse Search",
      "Semantic search over verse embeddings using Orama. Requires a generated embeddings JSON file.",
    );
    this.extras = van.derive(() => {
      const items: CommandItem[] = [
        {
          title: "Back to AI chat",
          description: "Return to AI Q&A mode",
          click: () => (this.updateViewState({ topCategory: AICategoryID }), false),
        },
      ];

      if (!this.plugin.settings.aiApiKey) {
        items.push({
          title: "No OpenAI API key set",
          description: "OpenAI embeddings need a key. Ollama fallback is used if local server is available.",
          click: () => (this.updateViewState({ topCategory: SettingsCategoryID }), false),
        });
      }

      return items;
    });

    van.derive(() => {
      this.requestSearch(this.state.query.val.trim());
    });

    this.allItems = van.derive(() => {
      const trimmed = this.state.query.val.trim();
      const commands: EmbeddingSearchCommand[] = [];
      if (trimmed) {
        commands.push({ type: "query", query: trimmed });
      }

      const shouldShowResults = this.resultsQuery.val === trimmed && !!trimmed;
      if (shouldShowResults) {
        commands.push(...this.lastResults.val.map((hit): EmbeddingSearchCommand => ({ type: "hit", hit })));
      }

      return commands;
    });
  }

  // Semantic hits are already similarity-ranked; substring-filtering them by the prompt hides valid matches.
  getItems(): EmbeddingSearchCommand[] {
    const remaining = Math.max(0, this.state.maxItems.val - this.previousItemCount);
    return this.allItems.val.slice(0, remaining);
  }

  protected onDispose(): void {
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = null;
  }

  renderItem(command: EmbeddingSearchCommand): CommandItem {
    if (command.type === "query") {
      let status = "Generate query embedding, then search nearest verses";
      const asyncStatus = this.asyncStatus.val;

      if (this.state.query.val.trim() === command.query && asyncStatus.state === "loading") {
        status = asyncStatus.message;
      } else if (asyncStatus.state === "error" && this.lastQuery.val === command.query) {
        status = asyncStatus.message;
      } else if (this.resultsQuery.val === command.query) {
        status = `Search finished: ${this.lastResults.val.length} result(s)`;
      }

      return {
        key: `query:${command.query}`,
        title: `Semantic search: ${command.query}`,
        description: status,
        click: () => {
          this.requestSearch(command.query, true);
          return false;
        },
      };
    }

    return {
      key: `verse:${command.hit.verse.toString()}`,
      title: command.hit.verse.toString(),
      description: `${command.hit.text} ${(command.hit.score * 100).toFixed(1)}%`,
      click: () => {
        this.plugin.app.verseState.val = command.hit.verse;
        return true;
      },
    };
  }

  private requestSearch(query: string, immediate = false): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }

    if (!query) {
      this.invalidateAsync();
      return;
    }

    if (query === this.resultsQuery.val) {
      this.invalidateAsync({
        state: "success",
        message: `Search finished: ${this.lastResults.val.length} result(s) for: ${query}`,
      });
      return;
    }

    this.invalidateAsync({ state: "loading", message: `Waiting to search: ${query}` });
    const schedule = () => {
      this.searchDebounceTimer = null;
      if (query === this.state.query.val.trim()) void this.runSearch(query);
    };

    if (immediate) {
      schedule();
      return;
    }

    this.searchDebounceTimer = setTimeout(schedule, 250);
  }

  private async runSearch(query: string): Promise<void> {
    if (!query.trim() || query !== this.state.query.val.trim()) return;

    const result = await this.runAsyncLatest(
      async signal => {
        const isReady = await this.dbService.initialize(this.plugin.settings.aiApiKey);
        if (!isReady) {
          throw new Error(this.dbService.errorMessage || "Embedding database failed to initialize");
        }
        if (signal.aborted) return [];

        const queryEmbedding = await this.embedQuery(query, signal);
        if (signal.aborted) return [];
        const hits = await this.dbService.searchByEmbedding(queryEmbedding, 8, 0.2);

        return hits
          .map(hit => {
            const { book, chapter, verse, text } = hit.document;
            if (!text) return null;

            return {
              verse: new VerseRef(book, chapter, verse),
              text,
              score: hit.score,
            } satisfies EmbeddingSearchHit;
          })
          .filter((hit): hit is EmbeddingSearchHit => hit !== null);
      },
      {
        loadingMessage: `Searching embeddings for: ${query}`,
        successMessage: results => {
          const source = this.dbService.sourceProvider
            ? ` using ${this.dbService.sourceProvider}:${this.dbService.sourceModel || "unknown"}`
            : "";
          return `Search finished: ${results.length} result(s) for: ${query}${source}`;
        },
        errorMessage: error => `Search failed: ${error instanceof Error ? error.message : String(error)}`,
      },
      results => {
        this.lastQuery.val = query;
        this.lastResults.val = results;
        this.resultsQuery.val = query;
      },
    );

    if (result.status === "error") this.lastQuery.val = query;
  }

  private async embedQuery(query: string, signal: AbortSignal): Promise<number[]> {
    if (this.dbService.sourceProvider === "openai") {
      return this.embedQueryOpenAI(query, this.dbService.sourceModel || "text-embedding-3-small", signal);
    }
    if (this.dbService.sourceProvider === "ollama") {
      return this.embedQueryOllama(query, this.dbService.sourceModel || "nomic-embed-text", signal);
    }
    if (this.plugin.settings.aiApiKey) {
      return this.embedQueryOpenAI(query, "text-embedding-3-small", signal);
    }
    return this.embedQueryOllama(query, "nomic-embed-text", signal);
  }

  private async embedQueryOpenAI(query: string, model: string, signal: AbortSignal): Promise<number[]> {
    if (!this.plugin.settings.aiApiKey) {
      throw new Error("This embedding index expects OpenAI-compatible embeddings, but no API key is set.");
    }
    const endpoint = this.plugin.chat.endpoint;
    const baseUrl = endpoint.endsWith("/chat/completions")
      ? endpoint.replace(/\/chat\/completions$/, "")
      : "https://api.openai.com/v1";

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.plugin.settings.aiApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: query,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`OpenAI embedding error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const embedding = data.data?.[0]?.embedding;
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error("OpenAI embedding response missing vector data");
    }
    return embedding;
  }

  private async embedQueryOllama(query: string, model: string, signal: AbortSignal): Promise<number[]> {
    const response = await fetch("http://localhost:11434/api/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: query,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Ollama embedding error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as { embedding?: number[] };
    if (!data.embedding || !Array.isArray(data.embedding)) {
      throw new Error("Ollama embedding response missing vector data");
    }
    return data.embedding;
  }
}
