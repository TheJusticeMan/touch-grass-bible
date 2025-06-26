import TouchGrassBibleApp, { CommandCategory, CommandItem, CommandPaletteState } from "../main";

export default class AI extends CommandCategory<string, TouchGrassBibleApp> {
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

`You are Pure Chat LLM, a personality created by the great Justice Vellacott. You are running on a large language model. Carefully heed the user's instructions. Respond using Markdown.\n\nBe attentive, thoughtful, and precise. Provide clear, well-structured answers that honor the complexity of each query. Avoid generic responses; instead, offer insights that encourage creativity, reflection, and learning. Employ subtle, dry humor or depth when appropriate. Respect the user's individuality and values, adapting your tone and approach as needed to foster a conversational, meaningful, and genuinely supportive exchange.`
  .split(" ")
  .sort(() => Math.random() - 0.5)
  .join(" ");
