import { toggleCMD, CMD } from "src/external/Comands";
import {
  CommandCategory,
  UnifiedCommandPalette,
  CommandPaletteState,
  CommandItem,
} from "src/external/CommandPalette";
import info from "../info.json";
import Plugin from "../core/Plugin";
import { DEFAULT_SETTINGS } from "../config/TGAppSettings";
import { SettingsCategoryID } from "./categoryIDs";

export default class SettingsPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerPalette(() => new SettingsCategory(this.palette.instance, this), SettingsCategoryID);
  }
}

class SettingsCategory extends CommandCategory<string> {
  readonly name = "Settings";
  readonly description = "Configure Touch Grass Bible settings";

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: SettingsPlugin,
  ) {
    super(commandPalette);
  }

  onTrigger(_state: CommandPaletteState): void {
    new toggleCMD(this.defaultCMD)
      .setValue(this.plugin.app.settings.enableLogging)
      .setName("Debug console")
      .on("change", (enabled: boolean) => {
        this.plugin.app.console.enabled = enabled;
        this.plugin.app.settings.enableLogging = enabled;
        this.plugin.app.saveSettings();
      });
    new CMD(this.defaultCMD)
      .setName("Download settings")
      .setDescription("Download your current settings as a JSON file")
      .on("_click", () => {
        this.plugin.app.saveSettings();
        this.plugin.files.download("TouchGrassBibleSettings.json", this.plugin.app.settings);
      });
    new CMD(this.defaultCMD)
      .setName("Upload settings")
      .setDescription("Upload a JSON file to update your settings")
      .on("_click", () => {
        this.plugin.files.upload(
          ".json",
          newSettings => {
            this.plugin.app.settings = Object.assign({}, DEFAULT_SETTINGS, newSettings as object);

            this.plugin.app.saveSettings();
          },
          error => this.plugin.app.console.error("Failed to parse settings file:", error),
          message => this.plugin.app.console.warn(message),
        );
      });
    new CMD(this.defaultCMD)
      .setName("Reset settings")
      .setDescription("Reset settings to default values")
      .on("_click", () => {
        this.plugin
          .palette.confirm("Are you sure you want to delete all your data including bookmarks?")
          .then(confirmed => {
            if (!confirmed) return;
            this.plugin.app.settings = { ...DEFAULT_SETTINGS };

            this.plugin.app.saveSettings();

            this.commandPalette.display({ topCategory: "" });
          });
      });
    new CMD(this.defaultCMD)
      .setName("Keyboard shortcuts")
      .setDescription(
        "Ctrl+Enter → Open command palette\n" +
          "Escape → Close palette\n" +
          "Arrow Up/Down → Navigate palette items\n" +
          "Enter → Select item\n" +
          "Backspace → Go back in navigation\n" +
          "Arrow Right → Open navigation panel",
      );
    new CMD(this.defaultCMD)
      .setName(info.name)
      .setDescription(
        `Version: ${info.version}\nAuthor: ${info.author}\nBuilt: ${new Date(
          info.build,
        ).toString()}\nLicense: ${info.license}\n\n${info.description}`,
      );
  }

  getCommands(_query: string): string[] {
    return [];
  }

  renderCommand(_command: string, _Item: CommandItem<string>): Partial<CommandPaletteState> {
    return { topCategory: SettingsCategoryID };
  }

  executeCommand(_command: string): void {}
}
