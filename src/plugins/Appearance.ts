import { CommandCategory, CommandPaletteState, slider, stateMapping, van } from "@touchgrass/framework";
import Plugin from "src/core/Plugin";

export default class AppearancePlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerPalette("appearance", ({ state }) => new AppearanceCategory(state, this));
  }
}

class AppearanceCategory extends CommandCategory<string> {
  allItems = van.state<string[]>([]);
  criteria: Array<(item: string) => string> = [item => item];

  constructor(
    state: stateMapping<CommandPaletteState>,
    public plugin: AppearancePlugin,
  ) {
    super(state, "Appearance", "Customize the appearance of Touch Grass Bible");
    this.deriveExtraCMDs(() => [
      {
        title: "Font Size",
        description: "Adjust the font size of the Bible text",
        cb: () => ({
          extras: slider({
            value: this.plugin.app.settings.style.fontSize,
            onchange: (value: number) => this.plugin.app.setFontSize(value, true),
          }),
        }),
      },
    ]);

    this.allItems = van.state<string[]>([]);
  }

  renderItem(command: string) {
    return {
      title: command,
      description: "No appearance settings available yet",
    };
  }

  executeCommand(): void {
    return;
  }
}
