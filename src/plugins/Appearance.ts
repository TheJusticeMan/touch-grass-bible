import Plugin from "src/core/Plugin";
import {
  CommandCategory,
  CommandItem,
  CommandPaletteState,
  UnifiedCommandPalette,
} from "@touchgrass/framework";

export default class AppearancePlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerPalette(() => new AppearanceCategory(this.app.commandPalette, this), "appearance");
  }
}

class AppearanceCategory extends CommandCategory<string> {
  readonly name = "Appearance";
  readonly description = "Customize the appearance of Touch Grass Bible";

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: AppearancePlugin,
  ) {
    super(commandPalette);
  }

  onTrigger(_state: CommandPaletteState): void {
    void _state;
    this.defaultCMD.addCMD("Font Size", "Adjust the font size of the Bible text", item => {
      item.addSliderInput(slider =>
        slider
          .setValue(this.plugin.app.settings.style.fontSize)
          .on("change", (value: number) => this.plugin.app.setFontSize(value, true)),
      );
      return {};
    });
  }

  getCommands(_query: string): string[] {
    void _query;
    return [];
  }

  renderCommand(
    command: string,
    el: CommandItem<string>,
  ): Partial<CommandPaletteState> | ((state: CommandPaletteState) => CommandPaletteState) {
    el.setTitle(command).setDescription("No appearance settings available yet").setHidden(false);
    return {};
  }

  executeCommand(_command: string): void {
    void _command;
  }
}
