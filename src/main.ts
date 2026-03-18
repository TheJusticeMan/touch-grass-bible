export const processstart = new Date().getTime();
import { App } from "./external/App";
import "./external/MyHTML";
import { View, WorkspaceLayout } from "./external/Workspace";
import info from "./info.json";
import "./main.css";
import { internalPlugins, type IconActionItem } from "./Plugin";
import AIPlugin from "./plugins/AI";
import BookmarkPlugin from "./plugins/Bookmarks";
import GestureCommandsPlugin from "./plugins/GestureCommands";
import JournalPlugin from "./plugins/Journal";
import NavesTopicalBiblePlugin from "./plugins/NavesTopicalBible/NavesTopicalBible";
import NotesPlugin from "./plugins/Notes/Notes";
import BibleSearchPlugin from "./plugins/Search";
import SettingsPlugin from "./plugins/Settings";
import TopicalBiblePlugin from "./plugins/TopicalBible";
import TranslationsPlugin from "./plugins/Translations";
import TSK from "./plugins/TSK";
import { NavigationPanel } from "./sidepanels";
import { DEFAULT_CATEGORY_ORDER, DEFAULT_SETTINGS, TGAppSettings } from "./TGAppSettings";

import type { PlatformBridge } from "@platform";
import { CommandPaletteState } from "./external/CommandPalette";
import type { PaletteState } from "./external/PaletteStateController";
import SharePlugin from "./plugins/Share";
import { bibleData, VerseRef } from "./VerseRef";
import { VerseScreen } from "./VerseScreen";

function isPlainObject(value: unknown): value is object {
  return value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value);
}

function deepMerge<T extends object>(defaults: T, saved: Partial<T>): T {
  const result = { ...defaults } as T;
  for (const key in saved) {
    const k = key as keyof T;
    if (isPlainObject(saved[k])) {
      if (isPlainObject(defaults[k])) {
        result[k] = deepMerge(defaults[k] as object, saved[k] as object) as T[keyof T];
      } else {
        result[k] = saved[k] as T[keyof T];
      }
    } else if (saved[k] !== undefined) {
      result[k] = saved[k] as T[keyof T];
    }
  }
  return result;
}

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
  plugins = new internalPlugins(this);
  private verseActions: Map<string, IconActionItem> = new Map();
  firstLoad = true;
  saveTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private fallbackVerseState = this.commandPalette.useState(new VerseRef("GENESIS", 1, 1));
  fab: HTMLButtonElement | null = null;

  get verseState(): PaletteState<VerseRef> {
    const activeVerseScreen = this.workspace.getActiveViewOfType("verse-screen");
    return activeVerseScreen instanceof VerseScreen ? activeVerseScreen.verseState : this.fallbackVerseState;
  }

  constructor(doc: Document, platformBridge?: PlatformBridge) {
    super(doc, "Touch Grass Bible", platformBridge);
  }

  async onload() {
    this.on("ArrowRightKeyDown", () => this.workspace.activateView("navigation-panel"));

    await this.loadsettings(DEFAULT_SETTINGS);
    this.commandPalette.setCategoryOrder(this.settings.categoryOrder || DEFAULT_CATEGORY_ORDER);
    this.registerWorkspaceViews();
    this.ensureMainScreenTab();

    // Load all JSON files in parallel for faster startup
    let translations: { [translation: string]: bibleData } = {};
    try {
      translations = await this.loadJSON<{ [translation: string]: bibleData }>("translations.json");
    } catch (e) {
      this.console.error("Failed to load translations.json. App may not function correctly.", e);
    }
    this.commandPalette.columns = this.contentEl.offsetWidth > 800;
    window.addEventListener("resize", () => {
      const isWide = this.contentEl.offsetWidth > 800;
      if (this.commandPalette.columns !== isWide) {
        this.commandPalette.columns = isWide;
        void (this.commandPalette.isOpen && this.commandPalette.display());
      }
    });

    VerseRef.bibleTranslations = translations;

    this.verseState.set(VerseRef.RandomVerse);
    this.console.enabled = this.settings.enableLogging;
    this.console.log(info.name, info.version, "loaded");
    this.on("Ctrl+EnterKeyDown", () => !this.commandPalette.isOpen && this.openCommandPalette());

    this.fab = this.contentEl.createEl("button", {
      cls: "command-palette-fab",
      text: "CMD",
      attr: {
        type: "button",
        "aria-label": "Open command palette",
      },
    });
    this.fab.addEventListener("click", () => this.openCommandPalette());
    this.commandPalette.on("open", () => this.fab?.classList.add("is-hidden"));
    this.commandPalette.on("close", () => this.fab?.classList.remove("is-hidden"));

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
        pluginClass: TSK,
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
        pluginClass: GestureCommandsPlugin,
        manifest: {
          id: "gesture-commands",
          name: "Gesture Commands",
          description: "Trigger commands by drawing gestures on the floating action button.",
          version: "1.0.0",
        },
      },
    );
    this.plugins.load();
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

  async loadsettings(DEFAULT_SETTINGS: TGAppSettings) {
    this.settings = deepMerge(DEFAULT_SETTINGS, (await this.loadData()) as Partial<TGAppSettings>);
  }

  saveSettings() {
    this.saveData(this.settings as Partial<TGAppSettings>);
  }

  saveSettingsAfterDelay(delay: number = 5000) {
    // Clear the previous timeout if it exists
    if (this.saveTimeoutId !== null) {
      clearTimeout(this.saveTimeoutId);
      this.saveTimeoutId = null; // Reset the timeout ID
    }

    // Set a new timeout
    this.saveTimeoutId = setTimeout(() => {
      this.saveSettings();
      this.console.log("Settings saved after 5 seconds");
      this.saveTimeoutId = null; // Reset after execution
    }, delay);
  }

  private registerWorkspaceViews() {
    this.workspace.registerView("verse-screen", panel => new VerseScreen(panel, this));

    this.workspace.registerView("reading-tools", panel => {
      const view = new View(panel);
      view.containerEl.classList.add("workspace-static-view");
      view.containerEl.createEl("h3", { text: "Reading Tools" });
      view.containerEl.createEl("p", {
        text: "Use Ctrl+Enter to open the command palette, then search books, verses, notes, and references.",
      });
      return view;
    });

    this.workspace.registerView("navigation-panel", panel => new NavigationPanel(panel, this));
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
              views: [{ viewType: "navigation-panel", title: "Navigate" }],
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
              views: [
                { viewType: "verse-screen", title: "Scripture" },
                { viewType: "reading-tools", title: "Tools" },
              ],
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

export const app = new TouchGrassBibleApp(document);
