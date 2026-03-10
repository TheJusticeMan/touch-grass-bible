import { BrainCircuit } from "lucide";
import { AIchat } from "../AIchat";
import { Button, CMD, CommandCategory, CommandItem, CommandPaletteState, UnifiedCommandPalette, VerseInfoComponent } from "../main";
import Plugin from "../Plugin";
import { SettingsCategoryID } from "./Settings";

export const AICategoryID = "ai";

export default class AIPlugin extends Plugin {
  chat: AIchat = new AIchat();

  async onload() {
    this.registerPalette(() => new AICommandPalette(this.app.commandPalette, this), AICategoryID);

    this.addVerseAction({
      id: "ai-ask",
      name: "Ask AI about this verse",
      icon: BrainCircuit,
      onTrigger: (verseInfo: VerseInfoComponent) => {
        if (!this.app.settings.aiApiKey) {
          new Button(verseInfo.element)
            .setButtonText("Set API key in Settings")
            .on("click", () => this.app.openCommandPalette({ topCategory: SettingsCategoryID }));
          return;
        }
        const verse = verseInfo.verse;
        const verseText = verse.vTXT;
        const prompt = `Explain the following Bible verse in context: "${verse.toString()} — ${verseText}"`;
        this.chat.endpoint.apiKey = this.app.settings.aiApiKey;
        const responseEl = verseInfo.element.createEl("div", { cls: "ai-response" });
        responseEl.textContent = "Asking AI…";
        this.chat
          .request(prompt, delta => {
            if (delta.content) {
              if (responseEl.textContent === "Asking AI…") responseEl.textContent = "";
              responseEl.textContent += delta.content;
            }
            return true;
          })
          .catch(err => {
            responseEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
          });
      },
    });
  }
}

class AICommandPalette extends CommandCategory<string> {
  readonly name = "AI Bible Assistant";
  readonly description = "Ask the AI assistant questions about Bible verses and theology.";
  private responses: { question: string; answer: string }[] = [];

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: AIPlugin,
  ) {
    super(commandPalette);
  }

  onTrigger(): void {
    if (!this.plugin.app.settings.aiApiKey) {
      new CMD(this.defaultCMD)
        .setName("No API key set")
        .setDescription("Go to Settings → Set AI API key to enable the AI assistant.");
    }
  }

  getCommands(query: string): string[] {
    if (!query.trim()) return [];
    return [query];
  }

  renderCommand(command: string, Item: CommandItem<string>): (state: CommandPaletteState) => CommandPaletteState {
    Item.setTitle(`Ask: ${command}`).setDescription("Send this question to the AI assistant");
    return state => state;
  }

  executeCommand(command: string): void {
    const apiKey = this.plugin.app.settings.aiApiKey;
    if (!apiKey) {
      this.plugin.app.openCommandPalette({ topCategory: SettingsCategoryID });
      return;
    }
    this.plugin.chat.endpoint.apiKey = apiKey;
    const verse = this.plugin.app.verseState.get();
    const contextPrompt = verse
      ? `[Current verse: ${verse.toString()} — "${verse.vTXT}"]\n\n${command}`
      : command;

    const resultCmd = new CMD(this.defaultCMD).setName("AI: thinking…").setDescription("");
    let accumulated = "";
    this.plugin.chat
      .request(contextPrompt, delta => {
        if (delta.content) {
          accumulated += delta.content;
          resultCmd.setDescription(accumulated);
          this.commandPalette.display();
        }
        return true;
      })
      .then(() => {
        this.responses.push({ question: command, answer: accumulated });
        resultCmd.setName("AI response:");
        this.commandPalette.display();
      })
      .catch(err => {
        resultCmd
          .setName("AI error")
          .setDescription(err instanceof Error ? err.message : String(err));
        this.commandPalette.display();
      });
  }
}
