export const processstart = new Date().getTime();
import info from "@build-info";
import { createPlatformBridge } from "@platform";
import { DEFAULT_SETTINGS, TGAppSettings } from "./config/TGAppSettings";
import { ExternalPlugins } from "./core/ExternalPlugins";
import { InternalPlugins, type IconActionItem } from "./core/Plugin";
import {
  App,
  CommandPaletteState,
  PaletteState,
  SettingsStore,
  WorkspaceLayout,
  type PlatformBridge,
} from "@touchgrass/framework";
import "./main.css";
import { bibleData, VerseRef } from "./models/VerseRef";
import {
  AIPlugin,
  AppearancePlugin,
  BibleSearchPlugin,
  BookmarkPlugin,
  GesturePlugin,
  JournalPlugin,
  NavesTopicalBiblePlugin,
  NotesPlugin,
  SettingsPlugin,
  SharePlugin,
  TopicalBiblePlugin,
  TranslationsPlugin,
  TSKPlugin,
} from "./plugins";
import { VerseScreen } from "./ui/VerseScreen";

/**
 * Main application class for the Touch Grass Bible app.
 *
 * Handles initialization, settings management, command palette integration,
 * and loading of core Bible data (KJV, cross-references, topics).
 *
 * @extends App
 *
 * @property {TGAppSettings} settings - Application settings.
 * @property {TGCommandPalette} commandPalette - The command palette instance for user commands.
 *
 * @constructor
 * @param {Document} doc - The document object for the app context.
 *
 * @method onload - Initializes the app, loads settings and data, sets up palettes and event listeners.
 * @method openCommandPalette - Opens the command palette with an optional state.
 * @method onunload - Handles cleanup when the app is unloaded.
 * @method loadsettings - Loads and merges user settings with defaults.
 * @method saveSettings - Persists the current settings.
 */
export default class TouchGrassBibleApp extends App {
  settings: TGAppSettings = DEFAULT_SETTINGS;
  plugins = new InternalPlugins(this);
  externalPlugins: ExternalPlugins | null = null;
  private verseActions: Map<string, IconActionItem> = new Map();
  firstLoad = true;
  readonly settingsStore: SettingsStore<TGAppSettings>;
  private fallbackVerseState = this.commandPalette.useState(new VerseRef("GENESIS", 1, 1));

  get verseState(): PaletteState<VerseRef> {
    const activeVerseScreen = this.workspace.getActiveViewOfType("verse-screen");
    return activeVerseScreen instanceof VerseScreen ? activeVerseScreen.verseState : this.fallbackVerseState;
  }

  constructor(doc: Document, platformBridge: PlatformBridge) {
    super(doc, "Touch Grass Bible", platformBridge);
    this.settingsStore = new SettingsStore<TGAppSettings>({
      defaultValue: DEFAULT_SETTINGS,
      defaultSaveDelayMs: 5000,
      fileManager: this.files,
      fileName: "app-data",
    });
  }

  async onload() {
    this.workspace.on("ArrowRightKeyDown", () => this.workspace.activateView("navigation-panel"));

    await this.settingsStore.load();
    this.registerWorkspaceViews();
    this.ensureMainScreenTab();

    // Load all JSON files in parallel for faster startup
    let translations: { [translation: string]: bibleData } = {};
    try {
      translations = await this.files.loadJSON<{ [translation: string]: bibleData }>("translations.json");
    } catch (e) {
      this.console.error("Failed to load translations.json. App may not function correctly.", e);
    }

    VerseRef.bibleTranslations = translations;

    this.verseState.set(VerseRef.RandomVerse);
    this.console.enabled = this.settings.enableLogging;
    this.console.log(info.name, info.version, "loaded");
    this.workspace.on("Ctrl+EnterKeyDown", () => !this.commandPalette.isOpen && this.openCommandPalette());

    this.console.log(new Date().getTime() - processstart, "ms startup time");
    this.console.log("Touch Grass Bible is ready!");
    this.plugins.addPlugins(
      {
        pluginClass: BookmarkPlugin,
        manifest: {
          id: "bookmarks",
          name: "Bookmarks",
          description: "View and manage your bookmarked verses.",
          version: "1.0.0",
        },
      },
      {
        pluginClass: TSKPlugin,
        manifest: {
          id: "tsk",
          name: "TSK+",
          description: "Enhanced cross references from Treasury of Scripture Knowledge.",
          version: "1.0.0",
        },
      },
      {
        pluginClass: BibleSearchPlugin,
        manifest: {
          id: "bible-search",
          name: "Bible Search",
          description: "Search for verses in the Bible.",
          version: "1.0.0",
        },
      },
      {
        pluginClass: TopicalBiblePlugin,
        manifest: {
          id: "topical-bible",
          name: "Topical Bible",
          description: "Browse topics and their associated verses from OpenBible.info.",
          version: "1.0.0",
        },
      },
      {
        pluginClass: NavesTopicalBiblePlugin,
        manifest: {
          id: "naves-topical-bible",
          name: "Nave's Topical Bible",
          description: "Browse Nave's Topical Bible topics, subtopics, related topics, and verses.",
          version: "1.0.0",
        },
      },
      {
        pluginClass: NotesPlugin,
        manifest: {
          id: "notes",
          name: "Notes",
          description: "Create and manage personal notes on verses.",
          version: "1.0.0",
        },
      },
      {
        pluginClass: JournalPlugin,
        manifest: {
          id: "journal",
          name: "Journal",
          description: "Write a continuous journal stream with reading history.",
          version: "1.0.0",
        },
      },
      {
        pluginClass: TranslationsPlugin,
        manifest: {
          id: "translations",
          name: "Translations",
          description: "View and switch between different Bible translations.",
          version: "1.0.0",
        },
      },
      {
        pluginClass: SettingsPlugin,
        manifest: {
          id: "settings",
          name: "Settings",
          description: "Configure Touch Grass Bible settings",
          version: "1.0.0",
        },
      },
      {
        pluginClass: AIPlugin,
        manifest: {
          id: "ai",
          name: "AI Assistant",
          description: "AI-powered Bible study assistant.",
          version: "1.0.0",
        },
      },
      {
        pluginClass: SharePlugin,
        manifest: {
          id: "share",
          name: "Share",
          description: "Share verses via external links.",
          version: "1.0.0",
        },
      },
      {
        pluginClass: GesturePlugin,
        manifest: {
          id: "gesture-commands",
          name: "Gesture Commands",
          description: "Trigger commands by drawing gestures on the floating action button.",
          version: "1.0.0",
        },
      },
      {
        pluginClass: AppearancePlugin,
        manifest: {
          id: "appearance",
          name: "Appearance",
          description: "Customize the appearance of Touch Grass Bible",
          version: "1.0.0",
        },
      },
    );
    this.plugins.load();

    if (__ENABLE_EXTERNAL_PLUGINS__) {
      this.externalPlugins = new ExternalPlugins(this);
      await this.externalPlugins.load();
      await this.externalPlugins.loadAll();
    }

    document.getElementById("loadingScreen")?.remove();
  }

  /**
   * Adds a verse action to the collection.
   * @param action - The icon action item to add.
   * @returns The current instance for method chaining.
   *
   * type IconActionItem = {
   *   id: string;
   *   name: string;
   *   description?: string;
   *   icon: IconNode;
   *   onTrigger: (verseInfo: VerseInfoComponent) => void;
   * };
   */
  addVerseAction(action: IconActionItem): this {
    this.verseActions.set(action.id, action);
    this.emit("verse-actions-change", undefined);
    return this;
  }

  removeVerseAction(actionId: string): this {
    this.verseActions.delete(actionId);
    this.emit("verse-actions-change", undefined);
    return this;
  }

  getVerseActions(): IconActionItem[] {
    return Array.from(this.verseActions.values());
  }

  openCommandPalette(CommandPaletteState: Partial<CommandPaletteState> = {}): void {
    this.commandPalette.update(CommandPaletteState).open();
    if (this.settings.showHelp && this.firstLoad) {
      this.firstLoad = false;
    }
  }

  onunload(): boolean {
    return true;
  }

  private registerWorkspaceViews() {
    this.workspace.registerView("verse-screen", panel => new VerseScreen(panel, this));
  }

  private ensureMainScreenTab() {
    if (this.workspace.hasViewInLayout("verse-screen")) {
      return;
    }
    this.workspace.ensureViewInLayout("verse-screen", this.getDefaultWorkspaceLayout());
    this.workspace.mountRoot();
  }

  getDefaultWorkspaceLayout(): WorkspaceLayout {
    return {
      version: 2,
      activeViewPanelPath: [1],
      activeViewIndex: 0,
      rootPanel: {
        id: "root",
        mode: "SplitGroup",
        splitAxis: "row",
        children: [
          {
            size: 1,
            panel: {
              id: "left-tabs",
              mode: "TabGroup",
              splitAxis: "row",
              persistent: true,
              visibleViewIndex: 0,
              views: [{ viewType: "journal-panel", title: "Journal" }],
            },
          },
          {
            size: 3,
            panel: {
              id: "main-tabs",
              mode: "TabGroup",
              splitAxis: "row",
              persistent: true,
              visibleViewIndex: 0,
              views: [{ viewType: "verse-screen", title: "Scripture" }],
            },
          },
          {
            size: 2,
            panel: {
              id: "right-tabs",
              mode: "TabGroup",
              splitAxis: "row",
              persistent: true,
              visibleViewIndex: 0,
              views: [{ viewType: "notes-panel", title: "Notes" }],
            },
          },
        ],
      },
    };
  }
}

/* if (document.readyState !== "loading") {
  // The DOM is already ready
  console.log("DOM already loaded, initializing app...");
 */ new TouchGrassBibleApp(document, createPlatformBridge());
/* } else {
  // The DOM is still loading, so wait for the event
  console.log("Waiting for DOM to load...");
  document.addEventListener("DOMContentLoaded", () => new TouchGrassBibleApp(document));
}
 */
