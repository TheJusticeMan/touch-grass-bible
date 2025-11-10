import TouchGrassBibleApp, {
  CommandCategory,
  CommandItem,
  CommandPaletteState,
} from "../main";
import Plugin from "../Plugin";

export default class AI extends Plugin {
  onload() {
    this.addPalettes(AIcommandPallete);
    this.app;
  }
}

export class AIcommandPallete extends CommandCategory<string, TouchGrassBibleApp> {
  name: string = "AI";
  description: string = "Interact with AI-powered features such as chat and suggestions.";

  onInit(): void {
    this.addCommands(
      { name: "Chat with AI", description: "Start a conversation with the AI assistant." },
      { name: "AI Suggestions", description: "Get suggestions from the AI assistant." }
    );
  }

  onTrigger(state: CommandPaletteState): void {}

  getCommands(query: string): string[] {
    return [];
  }

  renderCommand(command: string, el: CommandItem<string>): Partial<CommandPaletteState> {
    return {};
  }

  executeCommand(command: string): void {}
}
