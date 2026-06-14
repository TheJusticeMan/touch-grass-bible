import { CommandCategory, CommandPaletteState, MenuVan, stateMapping, van } from "@touchgrass/framework";
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
    this.registerPalette(AICategoryID, ({ state }) => new AICommandPalette(state, this));
    this.embeddingSearchDB
      .initialize()
      .then(() => {
        this.registerPalette(
          AIEmbeddingSearchCategoryID,
          ({ state }) => new AIEmbeddingSearchCategory(state, this, this.embeddingSearchDB),
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
              onClick: () => this.app.commandPalette.open({ topCategory: SettingsCategoryID }),
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
  allItems = van.state<string[]>([]);
  criteria: Array<(item: string) => string> = [item => item];
  private responses = van.state<{ question: string; answer: string }[]>([]);
  private inFlightResponse = van.state<{ question: string; answer: string; error?: string } | null>(null);

  constructor(
    state: stateMapping<CommandPaletteState>,
    public plugin: AIPlugin,
  ) {
    super(state, "AI Bible Assistant", "Ask the AI assistant questions about Bible verses and theology.");
    this.deriveExtraCMDs(() => {
      void this.state.topCategory.val;

      const items: Array<{
        title: string;
        description: string;
        cb?: (item: { title: string; description: string }) => Partial<{
          title: string;
          description: string;
          click?: () => boolean;
          extras?: HTMLElement;
        }> | void;
      }> = [];

      if (!this.plugin.settings.aiApiKey) {
        items.push({
          title: "No API key set",
          description: "Go to Settings → Set AI API key to enable the AI assistant.",
        });
      } else {
        items.push({
          title: "Set AI API key",
          description: `Store your OpenAI-compatible API key (saved locally in localStorage - keep it private).${
            this.plugin.settings.aiApiKey ? " Key is currently set." : " No key set."
          }`,
          cb: () => ({
            click: () => {
              void this.plugin.app.commandPalette
                .prompt("Enter your OpenAI-compatible API key:")
                .then(key => {
                  if (key === null) return;
                  this.plugin.settings.aiApiKey = key.trim();
                  void this.plugin.saveSettings();
                  this.updateViewState({ topCategory: AICategoryID });
                });
              return false;
            },
          }),
        });
      }

      items.push({
        title: "Open semantic embedding search",
        description: "Search semantically similar verses using precomputed embeddings + Orama",
        cb: () => ({
          click: () => (this.updateViewState({ topCategory: AIEmbeddingSearchCategoryID }), false),
        }),
      });

      if (this.inFlightResponse.val) {
        const { question, answer, error } = this.inFlightResponse.val;
        items.push({
          title: error ? "AI error" : "AI: thinking…",
          description: error ? error : answer || `Working on: ${question}`,
        });
      }

      if (this.responses.val.length > 0) {
        const latest = this.responses.val[this.responses.val.length - 1];
        items.push({
          title: "Latest AI response",
          description: latest.answer || `No content returned for: ${latest.question}`,
        });
      }

      return items;
    });

    this.allItems = van.derive(() => {
      const query = this.state.query.val.trim();
      return query ? [query] : [];
    });
  }

  renderItem(command: string) {
    return {
      title: `Ask: ${command}`,
      description: "Send this question to the AI assistant",
    };
  }

  executeCommand(command: string): void {
    const apiKey = this.plugin.settings.aiApiKey;
    if (!apiKey) {
      this.updateViewState({ topCategory: SettingsCategoryID });
      return;
    }
    this.plugin.chat.endpoint.apiKey = apiKey;
    const verse = this.plugin.app.verseState.val;
    const contextPrompt = verse
      ? `[Current verse: ${verse.toString()} — "${verse.vTXT}"]\n\n${command}`
      : command;

    this.inFlightResponse.val = { question: command, answer: "" };

    this.plugin.chat
      .request(contextPrompt, delta => {
        if (delta.content) {
          if (!this.inFlightResponse.val || this.inFlightResponse.val.question !== command) {
            this.inFlightResponse.val = { question: command, answer: "" };
          }
          this.inFlightResponse.val.answer += delta.content;
        }
        return true;
      })
      .then(() => {
        if (this.inFlightResponse.val && this.inFlightResponse.val.question === command) {
          this.responses.val = [
            ...this.responses.val,
            { question: command, answer: this.inFlightResponse.val.answer },
          ];
          this.inFlightResponse.val = null;
        }
      })
      .catch(err => {
        const message = err instanceof Error ? err.message : String(err);
        if (!this.inFlightResponse.val || this.inFlightResponse.val.question !== command) {
          this.inFlightResponse.val = { question: command, answer: "", error: message };
        } else {
          this.inFlightResponse.val.error = message;
        }
      });
  }
}
