import { CommandCategory, CommandPaletteState, stateMapping, van } from "@touchgrass/framework";
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

  private inFlight = van.state(false);
  private lastQuery = van.state("");
  private inFlightQuery = van.state("");
  private lastResults = van.state<EmbeddingSearchHit[]>([]);
  private errorMessage = van.state("");
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private queuedQuery = "";

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
    this.deriveExtraCMDs(() => {
      const items: Array<{
        title: string;
        description: string;
        cb?: (item: { title: string; description: string }) => Partial<{
          title: string;
          description: string;
          click?: () => boolean;
          extras?: HTMLElement;
        }> | void;
      }> = [
        {
          title: "Back to AI chat",
          description: "Return to AI Q&A mode",
          cb: () => ({
            click: () => (this.updateViewState({ topCategory: AICategoryID }), false),
          }),
        },
      ];

      if (!this.plugin.settings.aiApiKey) {
        items.push({
          title: "No OpenAI API key set",
          description: "OpenAI embeddings need a key. Ollama fallback is used if local server is available.",
          cb: () => ({
            click: () => (this.updateViewState({ topCategory: SettingsCategoryID }), false),
          }),
        });
      }

      if (this.inFlight.val) {
        items.push({
          title: "Searching embeddings...",
          description: `Working on: ${this.inFlightQuery.val}`,
        });
      }

      if (this.errorMessage.val) {
        items.push({
          title: "Embedding search error",
          description: this.errorMessage.val,
        });
      }

      if (!this.inFlight.val && this.lastResults.val.length > 0) {
        items.push({
          title: "Latest semantic search",
          description: `Found ${this.lastResults.val.length} result(s) for: ${this.lastQuery.val}`,
        });
      }

      if (this.dbService.errorMessage) {
        items.push({
          title: "Embedding setup error",
          description: this.dbService.errorMessage,
        });
      }

      if (this.dbService.sourceProvider && this.dbService.sourceModel) {
        items.push({
          title: "Embedding source",
          description: `${this.dbService.sourceProvider}:${this.dbService.sourceModel}`,
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

      const shouldShowResults = this.lastResults.val.length > 0 && !!trimmed;
      if (shouldShowResults) {
        commands.push(...this.lastResults.val.map((hit): EmbeddingSearchCommand => ({ type: "hit", hit })));
      }

      return commands;
    });
  }

  renderItem(command: EmbeddingSearchCommand) {
    if (command.type === "query") {
      let status = "Generate query embedding, then search nearest verses";

      if (this.inFlight.val) {
        status = `Searching embeddings for: ${this.inFlightQuery.val || command.query}`;
      } else if (this.errorMessage.val && this.lastQuery.val === command.query) {
        status = `Search failed: ${this.errorMessage.val}`;
      } else if (this.lastQuery.val === command.query) {
        status = `Search finished: ${this.lastResults.val.length} result(s)`;
      }

      return {
        title: `Semantic search: ${command.query}`,
        description: status,
      };
    }

    return {
      title: command.hit.verse.toString(),
      description: `${command.hit.text} ${(command.hit.score * 100).toFixed(1)}%`,
    };
  }

  executeCommand(command: EmbeddingSearchCommand): void {
    if (command.type === "query") {
      this.requestSearch(command.query, true);
      return;
    }

    this.plugin.app.verseState.val = command.hit.verse;
    this.plugin.app.commandPalette.close();
  }

  private requestSearch(query: string, immediate = false): void {
    if (!query) {
      this.queuedQuery = "";
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = null;
      }
      this.errorMessage.val = "";
      return;
    }

    if (query === this.lastQuery.val || query === this.inFlightQuery.val || query === this.queuedQuery) {
      return;
    }

    if (this.inFlight.val) {
      this.queuedQuery = query;
      return;
    }

    const schedule = () => {
      this.searchDebounceTimer = null;
      const targetQuery = this.queuedQuery || query;
      this.queuedQuery = "";
      void this.runSearch(targetQuery);
    };

    this.queuedQuery = query;
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    if (immediate) {
      schedule();
      return;
    }

    this.searchDebounceTimer = setTimeout(schedule, 250);
  }

  private async runSearch(query: string): Promise<void> {
    if (!query.trim()) return;
    if (this.inFlight.val) {
      this.queuedQuery = query;
      return;
    }

    this.inFlight.val = true;
    this.inFlightQuery.val = query;
    this.errorMessage.val = "";

    try {
      const isReady = await this.dbService.initialize(this.plugin.settings.aiApiKey);
      if (!isReady) {
        throw new Error(this.dbService.errorMessage || "Embedding database failed to initialize");
      }
      const queryEmbedding = await this.embedQuery(query);
      const hits = await this.dbService.searchByEmbedding(queryEmbedding, 8, 0.2);

      const results = hits
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

      this.lastQuery.val = query;
      this.lastResults.val = results;
    } catch (error) {
      this.errorMessage.val = error instanceof Error ? error.message : String(error);
    } finally {
      this.inFlight.val = false;
      this.inFlightQuery.val = "";

      const nextQuery = this.queuedQuery.trim();
      if (nextQuery && nextQuery !== this.lastQuery.val) {
        this.queuedQuery = "";
        void this.runSearch(nextQuery);
      }
    }
  }

  private async embedQuery(query: string): Promise<number[]> {
    if (this.dbService.sourceProvider === "openai") {
      return this.embedQueryOpenAI(query, this.dbService.sourceModel || "text-embedding-3-small");
    }
    if (this.dbService.sourceProvider === "ollama") {
      return this.embedQueryOllama(query, this.dbService.sourceModel || "nomic-embed-text");
    }
    if (this.plugin.settings.aiApiKey) {
      return this.embedQueryOpenAI(query, "text-embedding-3-small");
    }
    return this.embedQueryOllama(query, "nomic-embed-text");
  }

  private async embedQueryOpenAI(query: string, model: string): Promise<number[]> {
    if (!this.plugin.settings.aiApiKey) {
      throw new Error("This embedding index expects OpenAI-compatible embeddings, but no API key is set.");
    }
    const endpoint = this.plugin.chat.endpoint.endpoint;
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

  private async embedQueryOllama(query: string, model: string): Promise<number[]> {
    const response = await fetch("http://localhost:11434/api/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: query,
      }),
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
