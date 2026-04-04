import info from "@build-info";
import {
  CommandCategory,
  CommandItem,
  CommandPaletteState,
  pluginOptions,
  UnifiedCommandPalette,
} from "src/external";
import { DEFAULT_SETTINGS } from "../config/TGAppSettings";
import Plugin from "../core/Plugin";
import { PluginOptionsCategoryID, SettingsCategoryID } from "./categoryIDs";

export default class SettingsPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerPalette(() => new SettingsCategory(this.app.commandPalette, this), SettingsCategoryID);
    this.registerPalette(
      () => new pluginOptions(this.app.commandPalette, this.app.plugins),
      PluginOptionsCategoryID,
    );
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
    this.defaultCMD.addCMD(
      "Enable debug console",
      "Toggle the in-app debug console for logging and debugging purposes",
      item =>
        void item
          .addToggleInput(toggle =>
            toggle.setValue(this.plugin.app.settings.enableLogging).on("change", v => {
              this.plugin.app.console.enabled = v;
              this.plugin.app.settings.enableLogging = v;
              this.plugin.app.settingsStore.save();
            }),
          )
          .setName("Debug console"),
    );
    this.defaultCMD.addCMD(
      "Download settings",
      "Download your current settings as a JSON file",
      item =>
        void item.on("click", () => {
          this.plugin.app.settingsStore.save();
          this.plugin.app.files.downloadFile("TouchGrassBibleSettings.json", this.plugin.app.settings);
        }),
    );
    this.defaultCMD.addCMD(
      "Upload settings",
      "Upload a JSON file to update your settings",
      item =>
        void item.on("click", () => {
          this.plugin.app.files.uploadFile(
            ".json",
            newSettings => {
              this.plugin.app.settings = Object.assign({}, DEFAULT_SETTINGS, newSettings as object);

              this.plugin.app.settingsStore.save();
            },
            error => this.plugin.app.console.error("Failed to parse settings file:", error),
            message => this.plugin.app.console.warn(message),
          );
        }),
    );
    this.defaultCMD.addCMD(
      "Reset settings",
      "Reset settings to default values",
      item =>
        void item.on("click", () => {
          this.plugin.app.commandPalette
            .confirm("Are you sure you want to delete all your data including bookmarks?")
            .then(confirmed => {
              if (!confirmed) return;
              this.plugin.app.settings = { ...DEFAULT_SETTINGS };

              this.plugin.app.settingsStore.save();

              this.commandPalette.display({ topCategory: "" });
            });
        }),
    );

    // Plugin management section
    if (this.plugin.app.externalPlugins) {
      this.defaultCMD.addCMD(
        "Install plugin",
        "Upload a JavaScript plugin file (.js)",
        item =>
          void item.on("click", () => {
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
          }),
      );

      this.defaultCMD.addCMD(
        "Manage plugins",
        "View and manage installed plugins",
        item =>
          void item.on("click", async () => {
            const installedPlugins = await this.plugin.app.externalPlugins!.getInstalledPlugins();
            if (installedPlugins.length === 0) {
              this.plugin.app.console.log("No plugins installed");
              return;
            }

            for (const filename of installedPlugins) {
              this.defaultCMD.addCMD(
                `Uninstall: ${filename}`,
                "Remove this plugin",
                item =>
                  void item.on("click", async () => {
                    const confirmed = await this.plugin.app.commandPalette.confirm(
                      `Uninstall plugin: ${filename}?`,
                    );
                    if (!confirmed) return;
                    await this.plugin.app.externalPlugins!.uninstallPlugin(filename);
                    this.plugin.app.console.log(`Plugin uninstalled: ${filename}`);
                  }),
              );
            }
          }),
      );
    }

    this.defaultCMD.addCMD(
      "Keyboard shortcuts",
      "Ctrl+Enter → Open command palette\n" +
        "Escape → Close palette\n" +
        "Arrow Up/Down → Navigate palette items\n" +
        "Enter → Select item\n" +
        "Backspace → Go back in navigation\n" +
        "Arrow Right → Open navigation panel",
      () => ({}),
    );
    this.defaultCMD.addCMD(
      info.name,
      `Version: ${info.version}\nAuthor: ${info.author}\nBuilt: ${new Date(
        info.build,
      ).toString()}\nLicense: ${info.license}\n\n${info.description}`,
      () => ({}),
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
