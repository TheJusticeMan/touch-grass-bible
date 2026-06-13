import {
  CommandCategory,
  CommandItem,
  CommandPaletteDialog,
  CommandPaletteViewState,
  MenuVan,
  van,
} from "@touchgrass/framework";
import { BrainCircuit } from "lucide";
import Plugin from "../../core/Plugin";
import { AICategoryID, AIEmbeddingSearchCategoryID, SettingsCategoryID } from "../categoryIDs";
import { AIchat } from "./AIchat";
import { AIEmbeddingSearchCategory } from "./AIEmbeddingSearch";
import { AIEmbeddingSearchDB } from "./AIEmbeddingSearchDB";

const { div } = van.tags;

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
    this.registerPalette(dialog => new AICommandPalette(dialog, this), AICategoryID);
    this.embeddingSearchDB
      .initialize()
      .then(() => {
        this.registerPalette(
          dialog => new AIEmbeddingSearchCategory(dialog, this, this.embeddingSearchDB),
          AIEmbeddingSearchCategoryID,
        );
      })
      .catch(err => this.app.console.error(`Error loading embedding search database`, err));

    this.addVerseAction({
      id: "ai-ask",
      name: "Ask AI about this verse",
      icon: BrainCircuit,
      onTrigger: verseInfo => {
        if (!this.settings.aiApiKey) {
          new MenuVan([
            {
              title: "AI API key not set",
              icon: BrainCircuit,
              onClick: () => this.app.openCommandPalette({ topCategory: SettingsCategoryID }),
            },
          ]).showAtMouseEvent(verseInfo.event);
          return;
        }
        const verse = verseInfo.verse;
        const verseText = verse.vTXT;
        const prompt = `Explain the following Bible verse in context: "${verse.toString()} — ${verseText}"`;
        this.chat.endpoint.apiKey = this.settings.aiApiKey;

        const text = van.state("Asking AI…");

        const responseEl = div({ class: "ai-response" }, text);
        van.add(verseInfo.element, responseEl);
        this.chat
          .request(prompt, delta => {
            if (delta.content) {
              if (text.val === "Asking AI…") text.val = "";
              text.val += delta.content;
            }
            return true;
          })
          .catch(err => (text.val = `Error: ${err instanceof Error ? err.message : String(err)}`));
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
    public dialog: CommandPaletteDialog,
    public plugin: AIPlugin,
  ) {
    super(dialog);
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
      `Store your OpenAI-compatible API key (saved locally in localStorage — keep it private).${
        this.plugin.settings.aiApiKey ? " Key is currently set." : " No key set."
      }`,
      item =>
        void item.onClick(() =>
          this.plugin.app.commandPalette.prompt("Enter your OpenAI-compatible API key:").then(key => {
            if (key === null) return;
            this.plugin.settings.aiApiKey = key.trim();
            this.plugin.saveSettings();
            this.dialog.palette.display({ topCategory: AICategoryID });
          }),
        ),
    );

    this.defaultCMD.addCMD(
      "Open semantic embedding search",
      "Search semantically similar verses using precomputed embeddings + Orama",
      item =>
        void item.onClick(() => this.dialog.palette.display({ topCategory: AIEmbeddingSearchCategoryID })),
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
  ): Partial<CommandPaletteViewState> | (() => Partial<CommandPaletteViewState>) {
    Item.setTitle(`Ask: ${command}`).setDescription("Send this question to the AI assistant");
    return {};
  }

  executeCommand(command: string): void {
    const apiKey = this.plugin.settings.aiApiKey;
    if (!apiKey) {
      this.plugin.app.openCommandPalette({ topCategory: SettingsCategoryID });
      return;
    }
    this.plugin.chat.endpoint.apiKey = apiKey;
    const verse = this.plugin.app.verseState.val;
    const contextPrompt = verse
      ? `[Current verse: ${verse.toString()} — "${verse.vTXT}"]\n\n${command}`
      : command;

    this.inFlightResponse = { question: command, answer: "" };
    this.dialog.palette.display({ topCategory: AICategoryID });

    this.plugin.chat
      .request(contextPrompt, delta => {
        if (delta.content) {
          if (!this.inFlightResponse || this.inFlightResponse.question !== command) {
            this.inFlightResponse = { question: command, answer: "" };
          }
          this.inFlightResponse.answer += delta.content;
          this.dialog.palette.display({ topCategory: AICategoryID });
        }
        return true;
      })
      .then(() => {
        if (this.inFlightResponse && this.inFlightResponse.question === command) {
          this.responses.push({ question: command, answer: this.inFlightResponse.answer });
          this.inFlightResponse = null;
        }
        this.dialog.palette.display({ topCategory: AICategoryID });
      })
      .catch(err => {
        const message = err instanceof Error ? err.message : String(err);
        if (!this.inFlightResponse || this.inFlightResponse.question !== command) {
          this.inFlightResponse = { question: command, answer: "", error: message };
        } else {
          this.inFlightResponse.error = message;
        }
        this.dialog.palette.display({ topCategory: AICategoryID });
      });
  }
}
