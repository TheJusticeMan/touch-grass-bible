/* eslint-disable @typescript-eslint/no-unused-vars */
import { CMD, CommandCategory, CommandItem, CommandPaletteState } from "../main";
import Plugin from "../Plugin";

export default class AI extends Plugin {
  async onload() {
    this.registerPalette(() => new AIcommandPallete(this.app.commandPalette), "ai");
  }
}

export class AIcommandPallete extends CommandCategory<string> {
  name: string = "AI";
  description: string = "Interact with AI-powered features such as chat and suggestions.";

  onInit(): void {
    new CMD(this.defaultCMD)
      .setName("Chat with AI")
      .setDescription("Start a conversation with the AI assistant.");
    new CMD(this.defaultCMD)
      .setName("AI Suggestions")
      .setDescription("Get suggestions from the AI assistant.");
  }

  onTrigger(_state: CommandPaletteState): void {}

  getCommands(_query: string): string[] {
    return [];
  }

  renderCommand(_command: string, _el: CommandItem<string>): Partial<CommandPaletteState> {
    return {};
  }

  executeCommand(_command: string): void {}
}
