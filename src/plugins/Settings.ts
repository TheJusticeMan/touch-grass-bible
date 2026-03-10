import { BibleTopics } from "../BibleTopics";
import info from "../info.json";
import TouchGrassBibleApp, {
  CMD,
  CommandCategory,
  CommandItem,
  CommandPaletteState,
  UnifiedCommandPalette,
  toggleCMD,
} from "../main";
import Plugin from "../Plugin";
import { DEFAULT_SETTINGS } from "../TGAppSettings";
import { VerseRef } from "../VerseRef";

export const SettingsCategoryID = "settings";

export default class SettingsPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerPalette(() => new SettingsCategory(this.app.commandPalette, this), SettingsCategoryID);
  }
}

export class SettingsCategory extends CommandCategory<string> {
  readonly name = "Settings";
  readonly description = "Configure Touch Grass Bible settings";
  app: TouchGrassBibleApp;

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: SettingsPlugin,
  ) {
    super(commandPalette);
    this.app = plugin.app;
  }

  onTrigger(_state: CommandPaletteState): void {
    new toggleCMD(this.defaultCMD)
      .setValue(this.app.settings.enableLogging)
      .setName("Debug console")
      .on("change", (enabled: boolean) => {
        this.app.console.enabled = enabled;
        this.app.settings.enableLogging = enabled;
        this.app.saveSettings();
      });
    new CMD(this.defaultCMD)
      .setName("Download settings")
      .setDescription("Download your current settings as a JSON file")
      .on("_click", () => {
        this.app.saveSettings();
        this.app.downloadFile("TouchGrassBibleSettings.json", this.app.settings);
      });
    new CMD(this.defaultCMD)
      .setName("Upload settings")
      .setDescription("Upload a JSON file to update your settings")
      .on("_click", () => {
        this.app.uploadFile(
          ".json",
          newSettings => {
            this.app.settings = Object.assign({}, DEFAULT_SETTINGS, newSettings);
            VerseRef.Bookmarks.addData(this.app.settings.Bookmarks);
            this.app.saveSettings();
          },
          error => this.app.console.error("Failed to parse settings file:", error),
          message => this.app.console.warn(message),
        );
      });
    new CMD(this.defaultCMD)
      .setName("Reset settings")
      .setDescription("Reset settings to default values")
      .on("_click", () => {
        this.app.commandPalette
          .confirm("Are you sure you want to delete all your data including bookmarks?")
          .then(confirmed => {
            if (!confirmed) return;
            this.app.settings = { ...DEFAULT_SETTINGS };
            VerseRef.Bookmarks = new BibleTopics(this.app.settings.Bookmarks);
            this.app.saveSettings();
            this.app.commandPalette.display({ topCategory: "" });
          });
      });
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
