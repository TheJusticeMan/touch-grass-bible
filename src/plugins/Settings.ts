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
    this.registerPalette(() => new SettingsCategory(this.app.commandPalette, this), SettingsCategoryID);
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
    void _state;
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
        this.plugin.app.files.downloadFile("TouchGrassBibleSettings.json", this.plugin.app.settings);
      });
    new CMD(this.defaultCMD)
      .setName("Upload settings")
      .setDescription("Upload a JSON file to update your settings")
      .on("_click", () => {
        this.plugin.app.files.uploadFile(
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
        this.plugin.app.commandPalette
          .confirm("Are you sure you want to delete all your data including bookmarks?")
          .then(confirmed => {
            if (!confirmed) return;
            this.plugin.app.settings = { ...DEFAULT_SETTINGS };

            this.plugin.app.saveSettings();

            this.commandPalette.display({ topCategory: "" });
          });
      });

    // Plugin management section
    if (this.plugin.app.externalPlugins) {
      new CMD(this.defaultCMD)
        .setName("Install plugin")
        .setDescription("Upload a JavaScript plugin file (.js)")
        .on("_click", () => {
          this.plugin.app.files.uploadTextFile(
            ".js",
            jsCode => {
              // Generate filename from timestamp or ask user
              const filename = `plugin-${Date.now()}.js`;
              void this.plugin.app.externalPlugins!.installPlugin(jsCode, filename).then(() => {
                this.plugin.app.console.log(`Plugin installed: ${filename}`);
                // Reload plugins to get the newly installed one
                void this.plugin.app.externalPlugins!.loadAll();
              });
            },
            error => this.plugin.app.console.error("Failed to upload plugin:", error),
            message => this.plugin.app.console.warn(message),
          );
        });

      new CMD(this.defaultCMD)
        .setName("Manage plugins")
        .setDescription("View and manage installed plugins")
        .on("_click", async () => {
          const installedPlugins = await this.plugin.app.externalPlugins!.getInstalledPlugins();
          if (installedPlugins.length === 0) {
            this.plugin.app.console.log("No plugins installed");
            return;
          }

          for (const filename of installedPlugins) {
            new CMD(this.defaultCMD)
              .setName(`Uninstall: ${filename}`)
              .setDescription("Remove this plugin")
              .on("_click", () => {
                this.plugin.app.commandPalette.confirm(`Uninstall plugin: ${filename}?`).then(confirmed => {
                  if (!confirmed) return;
                  void this.plugin.app.externalPlugins!.uninstallPlugin(filename).then(() => {
                    this.plugin.app.console.log(`Plugin uninstalled: ${filename}`);
                  });
                });
              });
          }
        });
    }

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
    void _query;
    return [];
  }

  renderCommand(_command: string, _Item: CommandItem<string>): Partial<CommandPaletteState> {
    void _command;
    void _Item;
    return { topCategory: SettingsCategoryID };
  }

  executeCommand(_command: string): void {
    void _command;
  }
}
