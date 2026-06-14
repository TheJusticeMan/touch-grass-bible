import info from "@build-info";
import {
  CommandCategory,
  CommandPaletteState,
  pluginOptions,
  stateMapping,
  toggle,
} from "@touchgrass/framework";
import van from "vanjs-core";
import { DEFAULT_SETTINGS } from "../config/TGAppSettings";
import Plugin from "../core/Plugin";
import { PluginOptionsCategoryID, SettingsCategoryID } from "./categoryIDs";

type SettingsItem = {
  id: string;
  title: string;
  description: string;
  keywords?: string[];
  click?: () => void | Promise<void>;
  extras?: HTMLElement;
};

export default class SettingsPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerPalette(SettingsCategoryID, ({ state }) => new SettingsCategory(state, this));
    this.registerPalette(PluginOptionsCategoryID, ({ state }) => new pluginOptions(state, this.app.plugins));
  }
}

class SettingsCategory extends CommandCategory<SettingsItem> {
  allItems = van.state<SettingsItem[]>([]);
  criteria: Array<(item: SettingsItem) => string> = [
    item => item.title,
    item => item.description,
    item => item.keywords?.join(" ") ?? "",
  ];

  private readonly installedPlugins = van.state<string[]>([]);

  constructor(
    state: stateMapping<CommandPaletteState>,
    public plugin: SettingsPlugin,
  ) {
    super(state, "Settings", "Configure Touch Grass Bible settings");
    this.allItems = van.derive(() => {
      void this.installedPlugins.val;
      return this.buildItems();
    });
  }

  renderItem(item: SettingsItem) {
    return {
      title: item.title,
      description: item.description,
      click: item.click
        ? () => {
            void item.click?.();
            return false;
          }
        : undefined,
      extras: item.extras,
    };
  }

  private buildItems(): SettingsItem[] {
    const items: SettingsItem[] = [
      {
        id: "debug-console",
        title: "Debug console",
        description: "Toggle the in-app debug console for logging and debugging purposes",
        keywords: ["logging", "console"],
        extras: toggle({
          checked: this.plugin.app.console.enabled,
          onclick: (e: MouseEvent, state) => {
            e.stopPropagation();
            this.plugin.app.console.enabled = state.val;
            this.plugin.app.settings.enableLogging = state.val;
            this.plugin.app.settingsStore.save();
          },
        }),
      },
      {
        id: "download-settings",
        title: "Download settings",
        description: "Download your current settings as a JSON file",
        click: () => {
          this.plugin.app.settingsStore.save();
          this.plugin.app.files.downloadFile("TouchGrassBibleSettings.json", this.plugin.app.settings);
        },
      },
      {
        id: "upload-settings",
        title: "Upload settings",
        description: "Upload a JSON file to update your settings",
        click: () => {
          this.plugin.app.files.uploadFile(
            ".json",
            newSettings => {
              this.plugin.app.settings = Object.assign({}, DEFAULT_SETTINGS, newSettings as object);
              this.plugin.app.settingsStore.save();
            },
            error => this.plugin.app.console.error("Failed to parse settings file:", error),
            message => this.plugin.app.console.warn(message),
          );
        },
      },
      {
        id: "reset-settings",
        title: "Reset settings",
        description: "Reset settings to default values",
        click: async () => {
          const confirmed = await this.plugin.app.commandPalette.confirm(
            "Are you sure you want to delete all your data including bookmarks?",
          );
          if (!confirmed) return;
          this.plugin.app.settings = { ...DEFAULT_SETTINGS };
          this.plugin.app.settingsStore.save();
        },
      },
    ];

    if (this.plugin.app.externalPlugins) {
      items.push(
        {
          id: "install-plugin",
          title: "Install plugin",
          description: "Upload a JavaScript plugin file (.js)",
          keywords: ["external", "js"],
          click: () => {
            this.plugin.app.files.uploadTextFile(
              ".js",
              jsCode => {
                const filename = `plugin-${Date.now()}.js`;
                void this.plugin.app.externalPlugins!.installPlugin(jsCode, filename).then(() => {
                  this.plugin.app.console.log(`Plugin installed: ${filename}`);
                  void this.plugin.app.externalPlugins!.loadAll();
                  this.installedPlugins.val = [...new Set([...this.installedPlugins.val, filename])];
                });
              },
              error => this.plugin.app.console.error("Failed to upload plugin:", error),
              message => this.plugin.app.console.warn(message),
            );
          },
        },
        {
          id: "manage-plugins",
          title: "Manage plugins",
          description: "View and manage installed plugins",
          keywords: ["external", "uninstall"],
          click: async () => {
            const installedPlugins = await this.plugin.app.externalPlugins!.getInstalledPlugins();
            if (installedPlugins.length === 0) {
              this.plugin.app.console.log("No plugins installed");
              this.installedPlugins.val = [];
              return;
            }

            this.installedPlugins.val = installedPlugins;
          },
        },
      );

      items.push(
        ...this.installedPlugins.val.map(filename => ({
          id: `uninstall-${filename}`,
          title: `Uninstall: ${filename}`,
          description: "Remove this plugin",
          keywords: [filename, "plugin", "external"],
          click: async () => {
            const confirmed = await this.plugin.app.commandPalette.confirm(`Uninstall plugin: ${filename}?`);
            if (!confirmed) return;
            await this.plugin.app.externalPlugins!.uninstallPlugin(filename);
            this.plugin.app.console.log(`Plugin uninstalled: ${filename}`);
            this.installedPlugins.val = this.installedPlugins.val.filter(item => item !== filename);
          },
        })),
      );
    }

    items.push(
      {
        id: "keyboard-shortcuts",
        title: "Keyboard shortcuts",
        description:
          "Ctrl+Enter → Open command palette\n" +
          "Escape → Close palette\n" +
          "Arrow Up/Down → Navigate palette items\n" +
          "Enter → Select item\n" +
          "Backspace → Go back in navigation\n" +
          "Arrow Right → Open navigation panel",
        keywords: ["shortcuts", "keyboard", "help"],
      },
      {
        id: "app-info",
        title: info.name,
        description: `Version: ${info.version}\nAuthor: ${info.author}\nBuilt: ${new Date(
          info.build,
        ).toString()}\nLicense: ${info.license}\n\n${info.description}`,
        keywords: ["version", "about", "license"],
      },
    );

    return items;
  }
}
