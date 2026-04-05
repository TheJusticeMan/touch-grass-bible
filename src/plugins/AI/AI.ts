import { BrainCircuit } from "lucide";
import {
  Button,
  CommandCategory,
  CommandItem,
  CommandPaletteState,
  UnifiedCommandPalette,
} from "@touchgrass/framework";
import { VerseInfoComponent } from "src/ui/VerseScreen";
import Plugin from "../../core/Plugin";
import { AICategoryID, AIEmbeddingSearchCategoryID, SettingsCategoryID } from "../categoryIDs";
import { AIchat } from "./AIchat";
import { AIEmbeddingSearchCategory } from "./AIEmbeddingSearch";
import { AIEmbeddingSearchDB } from "./AIEmbeddingSearchDB";

interface AIPluginSettings {
  aiApiKey: string;
}

const defaultAISettings: AIPluginSettings = {
  aiApiKey: "",
};

export default class AIPlugin extends Plugin {
  chat: AIchat = new AIchat();
  settings: AIPluginSettings = { ...defaultAISettings };
  private embeddingSearchDB: AIEmbeddingSearchDB = new AIEmbeddingSearchDB();

  async onload() {
    this.settings = await this.loadSettings(defaultAISettings);
    this.registerPalette(() => new AICommandPalette(this.app.commandPalette, this), AICategoryID);
    // Initialize in background without blocking plugin load
    //requestIdleCallback(() => {
    this.embeddingSearchDB
      .initialize()
      .then(() => {
        this.registerPalette(
          palette => new AIEmbeddingSearchCategory(palette, this, this.embeddingSearchDB),
          AIEmbeddingSearchCategoryID,
        );
      })
      .catch(err => this.app.console.error(`Error loading embedding search database`, err));
    //});

    this.addVerseAction({
      id: "ai-ask",
      name: "Ask AI about this verse",
      icon: BrainCircuit,
      onTrigger: (verseInfo: VerseInfoComponent) => {
        if (!this.settings.aiApiKey) {
          new Button(verseInfo.element)
            .setButtonText("Set API key in Settings")
            .on("click", () => this.app.openCommandPalette({ topCategory: SettingsCategoryID }));
          return;
        }
        const verse = verseInfo.verse;
        const verseText = verse.vTXT;
        const prompt = `Explain the following Bible verse in context: "${verse.toString()} — ${verseText}"`;
        this.chat.endpoint.apiKey = this.settings.aiApiKey;
        const responseEl = verseInfo.element.createEl("div", {
          cls: "ai-response",
        });
        responseEl.textContent = "Asking AI…";
        this.chat
          .request(prompt, delta => {
            if (delta.content) {
              if (responseEl.textContent === "Asking AI…") responseEl.textContent = "";
              responseEl.textContent += delta.content;
            }
            return true;
          })
          .catch(
            err => (responseEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`),
          );
      },
    });
  }

  async saveSettings() {
    await super.saveSettings(this.settings);
  }
}

class AICommandPalette extends CommandCategory<string> {
  readonly name = "AI Bible Assistant";
  readonly description = "Ask the AI assistant questions about Bible verses and theology.";
  private responses: { question: string; answer: string }[] = [];
  private inFlightResponse: { question: string; answer: string; error?: string } | null = null;

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: AIPlugin,
  ) {
    super(commandPalette);
  }

  onTrigger(): void {
    if (!this.plugin.settings.aiApiKey) {
      this.defaultCMD.addCMD(
        "No API key set",
        "Go to Settings → Set AI API key to enable the AI assistant.",
        () => ({}),
      );
      return;
    }
    this.defaultCMD.addCMD(
      "Set AI API key",
      "Store your OpenAI-compatible API key (saved locally in localStorage — keep it private)." +
        (this.plugin.settings.aiApiKey ? " Key is currently set." : " No key set."),
      item =>
        void item.on("click", () =>
          this.plugin.app.commandPalette.prompt("Enter your OpenAI-compatible API key:").then(key => {
            if (key === null) return;
            this.plugin.settings.aiApiKey = key.trim();
            this.plugin.saveSettings();
            this.commandPalette.display({ topCategory: AICategoryID });
          }),
        ),
    );

    this.defaultCMD.addCMD(
      "Open semantic embedding search",
      "Search semantically similar verses using precomputed embeddings + Orama",
      item =>
        void item.on("click", () =>
          this.commandPalette.display({ topCategory: AIEmbeddingSearchCategoryID }),
        ),
    );

    if (this.inFlightResponse) {
      const { question, answer, error } = this.inFlightResponse;
      this.defaultCMD.addCMD(
        error ? "AI error" : "AI: thinking…",
        error ? error : answer || `Working on: ${question}`,
        () => ({}),
      );
    }

    if (this.responses.length > 0) {
      const latest = this.responses[this.responses.length - 1];
      this.defaultCMD.addCMD(
        "Latest AI response",
        latest.answer || `No content returned for: ${latest.question}`,
        () => ({}),
      );
    }
  }

  getCommands(query: string): string[] {
    if (!query.trim()) return [];
    return [query];
  }

  renderCommand(
    command: string,
    Item: CommandItem<string>,
  ): (state: CommandPaletteState) => CommandPaletteState {
    Item.setTitle(`Ask: ${command}`).setDescription("Send this question to the AI assistant");
    return state => state;
  }

  executeCommand(command: string): void {
    const apiKey = this.plugin.settings.aiApiKey;
    if (!apiKey) {
      this.plugin.app.openCommandPalette({ topCategory: SettingsCategoryID });
      return;
    }
    this.plugin.chat.endpoint.apiKey = apiKey;
    const verse = this.plugin.app.verseState.get();
    const contextPrompt = verse
      ? `[Current verse: ${verse.toString()} — "${verse.vTXT}"]\n\n${command}`
      : command;

    this.inFlightResponse = { question: command, answer: "" };
    this.commandPalette.display({ topCategory: AICategoryID });

    this.plugin.chat
      .request(contextPrompt, delta => {
        if (delta.content) {
          if (!this.inFlightResponse || this.inFlightResponse.question !== command) {
            this.inFlightResponse = { question: command, answer: "" };
          }
          this.inFlightResponse.answer += delta.content;
          this.commandPalette.display({ topCategory: AICategoryID });
        }
        return true;
      })
      .then(() => {
        if (this.inFlightResponse && this.inFlightResponse.question === command) {
          this.responses.push({ question: command, answer: this.inFlightResponse.answer });
          this.inFlightResponse = null;
        }
        this.commandPalette.display({ topCategory: AICategoryID });
      })
      .catch(err => {
        const message = err instanceof Error ? err.message : String(err);
        if (!this.inFlightResponse || this.inFlightResponse.question !== command) {
          this.inFlightResponse = { question: command, answer: "", error: message };
        } else {
          this.inFlightResponse.error = message;
        }
        this.commandPalette.display({ topCategory: AICategoryID });
      });
  }
}
