import {
  CommandCategory,
  CommandItem,
  CommandPaletteDialog,
  CommandPaletteViewState,
  slider
} from "@touchgrass/framework";
import Plugin from "src/core/Plugin";

export default class AppearancePlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerPalette((dialog) => new AppearanceCategory(dialog, this), "appearance");
  }
}

class AppearanceCategory extends CommandCategory<string> {
  readonly name = "Appearance";
  readonly description = "Customize the appearance of Touch Grass Bible";

  constructor(
    public dialog: CommandPaletteDialog,
    public plugin: AppearancePlugin,
  ) {
    super(dialog);
  }

  onTrigger(_state: CommandPaletteViewState): void {
    void _state;
    this.defaultCMD.addCMD("Font Size", "Adjust the font size of the Bible text", item => {
      item.addComponent(
        slider({
          value: this.plugin.app.settings.style.fontSize,
          onchange: (value: number) => this.plugin.app.setFontSize(value, true),
        }),
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
  ): Partial<CommandPaletteViewState> | (() => Partial<CommandPaletteViewState>) {
    el.setTitle(command).setDescription("No appearance settings available yet").setHidden(false);
    return {};
  }

  executeCommand(_command: string): void {
    void _command;
  }
}
