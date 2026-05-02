import {
  CommandCategory,
  CommandItem,
  CommandPaletteState,
  UnifiedCommandPalette,
} from "@touchgrass/framework";
import { VerseRef } from "src/models/VerseRef";
import { AICategoryID, SettingsCategoryID, TSKCrossRefCategoryID } from "src/plugins/categoryIDs";
import type AIPlugin from "./AI";
import { AIEmbeddingSearchDB } from "./AIEmbeddingSearchDB";

type EmbeddingSearchCommand = { type: "query"; query: string } | { type: "hit"; hit: EmbeddingSearchHit };

type EmbeddingSearchHit = {
  verse: VerseRef;
  text: string;
  score: number;
};

export class AIEmbeddingSearchCategory extends CommandCategory<EmbeddingSearchCommand> {
  readonly name = "AI Semantic Verse Search";
  readonly description =
    "Semantic search over verse embeddings using Orama. Requires a generated embeddings JSON file.";

  private inFlight = false;
  private lastQuery = "";
  private inFlightQuery = "";
  private lastResults: EmbeddingSearchHit[] = [];
  private errorMessage = "";
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private queuedQuery = "";

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: AIPlugin,
    private dbService: AIEmbeddingSearchDB,
  ) {
    super(commandPalette);
  }

  onTrigger(): void {
    this.defaultCMD.addCMD(
      "Back to AI chat",
      "Return to AI Q&A mode",
      item => void item.onClick(() => this.commandPalette.display({ topCategory: AICategoryID })),
    );

    if (!this.plugin.settings.aiApiKey) {
      this.defaultCMD.addCMD(
        "No OpenAI API key set",
        "OpenAI embeddings need a key. Ollama fallback is used if local server is available.",
        item =>
          void item.onClick(() => this.plugin.app.openCommandPalette({ topCategory: SettingsCategoryID })),
      );
    }

    if (this.inFlight) {
      this.defaultCMD.addCMD("Searching embeddings…", `Working on: ${this.inFlightQuery}`, () => ({}));
    }

    if (this.errorMessage) {
      this.defaultCMD.addCMD("Embedding search error", this.errorMessage, () => ({}));
    }

    if (!this.inFlight && this.lastResults.length > 0) {
      this.defaultCMD.addCMD(
        "Latest semantic search",
        `Found ${this.lastResults.length} result(s) for: ${this.lastQuery}`,
        () => ({}),
      );
    }

    if (this.dbService.errorMessage) {
      this.defaultCMD.addCMD("Embedding setup error", this.dbService.errorMessage, () => ({}));
    }

    if (this.dbService.sourceProvider && this.dbService.sourceModel) {
      this.defaultCMD.addCMD(
        "Embedding source",
        `${this.dbService.sourceProvider}:${this.dbService.sourceModel}`,
        () => ({}),
      );
    }
  }

  getCommands(query: string): EmbeddingSearchCommand[] {
    const trimmed = query.trim();
    const commands: EmbeddingSearchCommand[] = [];

    this.requestSearch(trimmed);

    if (trimmed) {
      commands.push({ type: "query", query: trimmed });
    }

    const shouldShowResults = this.lastResults.length > 0 && !!trimmed;
    if (shouldShowResults) {
      commands.push(...this.lastResults.map((hit): EmbeddingSearchCommand => ({ type: "hit", hit })));
    }

    return commands;
  }

  renderCommand(
    command: EmbeddingSearchCommand,
    item: CommandItem<EmbeddingSearchCommand>,
  ): Partial<CommandPaletteState> | ((state: CommandPaletteState) => CommandPaletteState) {
    if (command.type === "query") {
      let status = "Generate query embedding, then search nearest verses";

      if (this.inFlight) {
        status = `Searching embeddings for: ${this.inFlightQuery || command.query}`;
      } else if (this.errorMessage && this.lastQuery === command.query) {
        status = `Search failed: ${this.errorMessage}`;
      } else if (this.lastQuery === command.query) {
        status = `Search finished: ${this.lastResults.length} result(s)`;
      }

      item.setTitle(`Semantic search: ${command.query}`).setDescription(status);
      return state => state;
    }

    item
      .setTitle(command.hit.verse.toString())
      .setDescription(`${command.hit.text} ${(command.hit.score * 100).toFixed(1)}%`)
      .addctx();
    return { topCategory: TSKCrossRefCategoryID };
  }

  executeCommand(command: EmbeddingSearchCommand): void {
    if (command.type === "query") {
      this.requestSearch(command.query, true);
      return;
    }

    this.plugin.app.verseState.set(command.hit.verse);
    this.commandPalette.close();
  }

  private requestSearch(query: string, immediate = false): void {
    if (!query) {
      this.queuedQuery = "";
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = null;
      }
      this.errorMessage = "";
      return;
    }

    if (query === this.lastQuery || query === this.inFlightQuery || query === this.queuedQuery) {
      return;
    }

    if (this.inFlight) {
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
    if (this.inFlight) {
      this.queuedQuery = query;
      return;
    }

    this.inFlight = true;
    this.inFlightQuery = query;
    this.errorMessage = "";

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

      this.lastQuery = query;
      this.lastResults = results;
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      this.inFlight = false;
      this.inFlightQuery = "";
      this.commandPalette.refresh({
        query: this.query || this.lastQuery,
      });

      const nextQuery = this.queuedQuery.trim();
      if (nextQuery && nextQuery !== this.lastQuery) {
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
