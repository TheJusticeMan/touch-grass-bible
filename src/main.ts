export const processstart = new Date().getTime();
import info from "@build-info";
import { createPlatformBridge } from "@platform";
import {
  App,
  CommandPaletteState,
  SettingsStore,
  State,
  van,
  type Panel,
  type PanelContainerSerialized,
  type PlatformBridge,
} from "@touchgrass/framework";
import { DEFAULT_SETTINGS, TGAppSettings } from "./config/TGAppSettings";
import { ExternalPlugins } from "./core/ExternalPlugins";
import { InternalPlugins, type IconActionItem } from "./core/Plugin";
import { TranslationManager } from "./core/TranslationManager";
import "./main.css";
import { VerseRef, type translation } from "./models/VerseRef";
import {
  AIPlugin,
  AppearancePlugin,
  BibleMapPlugin,
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
import { clampBaseFontSize } from "./ui/pinchZoom";
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
  private _verseActions: Map<string, IconActionItem> = new Map();
  private verseActions: State<IconActionItem[]> = van.state([]);
  firstLoad = true;
  readonly settingsStore: SettingsStore<TGAppSettings>;
  readonly translationManager: TranslationManager;
  readonly verseState = this.commandPalette.useState(new VerseRef("GENESIS", 1, 1));
  readonly translationState = this.commandPalette.useState<translation>("KJV");
  private readonly verseStateListeners: Set<(value: VerseRef, previous: VerseRef) => void> = new Set();
  lastOpenedVerseScreen: VerseScreen | null = null;

  constructor(doc: Document, platformBridge: PlatformBridge) {
    super(doc, "Touch Grass Bible", platformBridge, {
      type: "panel",
      direction: "horizontal",
      activeIndex: 1,
      size: 1,
      children: [
        {
          size: 1,
          type: "view",
          isPersistent: true,
          activeIndex: 0,
          children: [{ viewType: "journal-panel", title: "Journal", state: "" }],
        },
        {
          size: 3,
          type: "view",
          isPersistent: true,
          activeIndex: 0,
          children: [{ viewType: "verse-screen", title: "Scripture", state: "" }],
        },
        {
          size: 2,
          type: "view",
          isPersistent: true,
          activeIndex: 0,
          children: [{ viewType: "notes-panel", title: "Notes", state: "" }],
        },
      ],
    });
    this.settingsStore = new SettingsStore<TGAppSettings>({
      defaultValue: DEFAULT_SETTINGS,
      defaultSaveDelayMs: 5000,
      fileManager: this.files,
      fileName: "app-data",
    });
    this.translationManager = new TranslationManager(this);
    this.initializeVanVerseStateBridge();
  }

  private initializeVanVerseStateBridge(): void {
    // Cross-derive the app-level Van verse state and the active verse screen's verse state to keep them in sync, while also exposing onChange-style listeners for consumers that haven't migrated to Van state yet.

    van.derive(() => {
      const activeView = this.workspace.layoutController.activeView.val || this.lastOpenedVerseScreen;
      if (
        activeView instanceof VerseScreen &&
        (activeView !== this.lastOpenedVerseScreen ||
          activeView.state.verse.val !== activeView.state.verse.oldVal)
      ) {
        this.verseState.val = activeView.state.verse.val;
        this.lastOpenedVerseScreen = activeView;
      }
      if (this.lastOpenedVerseScreen) {
        if (
          this.verseState.val !== this.verseState.oldVal &&
          !this.lastOpenedVerseScreen.state.verse.val.isSame(this.verseState.val)
        )
          this.lastOpenedVerseScreen.state.verse.val = this.verseState.val;

        if (
          this.translationState.val !== this.translationState.oldVal &&
          this.lastOpenedVerseScreen.state.translation.val !== this.translationState.val
        )
          this.lastOpenedVerseScreen.state.translation.val = this.translationState.val;
      }
    });

    // Keep the app-level Van verse state updated for active VerseScreen2 instances.
    van.derive(() => {
      const activeView = this.workspace.layoutController.activeView.val || this.lastOpenedVerseScreen;
      if (!(activeView instanceof VerseScreen)) return;

      const viewVerse = activeView.state.verse.val;
      if (!this.verseState.val.isSame(viewVerse)) {
        this.verseState.val = viewVerse;
      }
    });

    // Expose onChange-style callbacks for consumers while the app migrates to Van state.
    van.derive(() => {
      if (this.verseState.val.isSame(this.verseState.oldVal)) return;
      this.verseStateListeners.forEach(listener => listener(this.verseState.val, this.verseState.oldVal));
    });
  }

  onVerseStateChange(listener: (value: VerseRef, previous: VerseRef) => void): () => void {
    this.verseStateListeners.add(listener);
    return () => this.verseStateListeners.delete(listener);
  }

  setFontSize(value: number, persist = false, roundToWhole = true): number {
    const nextFontSize = clampBaseFontSize(value, roundToWhole);
    this.settings.style.fontSize = nextFontSize;
    document.documentElement.style.setProperty("--font-size-base", `${nextFontSize}px`);
    if (persist) {
      void this.settingsStore.save();
    }
    return nextFontSize;
  }

  async onload() {
    //this.workspace.on("ArrowRightKeyDown", () => this.workspace.activateView());

    this.settings = await this.settingsStore.load();
    this.setFontSize(this.settings.style.fontSize);
    this.ensureMainScreenTab();

    const defaultTranslation: translation = "KJV";
    VerseRef.defaultTranslation = defaultTranslation;
    try {
      await this.translationManager.loadTranslation(defaultTranslation);
    } catch (e) {
      this.console.error(`Failed to load default translation ${defaultTranslation}.`, e);
    }
    this.registerWorkspaceViews();

    this.console.enabled = this.settings.enableLogging;
    this.console.log(info.name, info.version, "loaded");
    //this.workspace.on("Ctrl+EnterKeyDown", () => !this.commandPalette.isOpen && this.openCommandPalette());

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
      {
        pluginClass: BibleMapPlugin,
        manifest: {
          id: "bible-map",
          name: "Bible Map",
          description: "Explore a 2D UMAP landscape of Bible chapters.",
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
   *   isAvailable?: (verseInfo: { verse: VerseRef }) => boolean;
   *   onTrigger: (verseInfo: { verse: VerseRef; event: Event; element: HTMLElement }) => void;
   * };
   */
  addVerseAction(action: IconActionItem): this {
    this._verseActions.set(action.id, action);
    this.emit("verse-actions-change", undefined);
    this.verseActions.val = Array.from(this._verseActions.values());
    return this;
  }

  removeVerseAction(actionId: string): this {
    this._verseActions.delete(actionId);
    this.verseActions.val = Array.from(this._verseActions.values());
    this.emit("verse-actions-change", undefined);
    return this;
  }

  openCommandPalette(CommandPalettestate: Partial<CommandPaletteState> = {}): void {
    this.commandPalette.updateViewState(CommandPalettestate);
    console.error(
      "openCommandPalette is not implemented yet. Command palette state would be:",
      this.commandPalette.state,
    );
    if (this.settings.showHelp && this.firstLoad) {
      this.firstLoad = false;
    }
  }

  onunload(): boolean {
    this.verseStateListeners.clear();
    return true;
  }

  private registerWorkspaceViews() {
    this.workspace.layoutController.registerView(
      "verse-screen",
      () => new VerseScreen(this, this.verseActions),
    );
  }

  private ensureMainScreenTab() {
    if (this.hasViewType(this.workspace.layoutController.rootPanel, "verse-screen")) {
      return;
    }
    this.workspace.layoutController.addViewToPanel("verse-screen");
  }

  private hasViewType(panel: Panel, viewTypeId: string): boolean {
    if (panel.type === "view") {
      return panel.children.val.some(view => view.val.viewTypeId === viewTypeId);
    }
    return panel.children.val.some(child => this.hasViewType(child, viewTypeId));
  }

  getDefaultWorkspaceLayout(): PanelContainerSerialized {
    return {
      type: "panel",
      direction: "horizontal",
      activeIndex: 1,
      size: 1,
      children: [
        {
          size: 1,
          type: "view",
          isPersistent: true,
          activeIndex: 0,
          children: [{ viewType: "journal-panel", title: "Journal", state: "" }],
        },
        {
          size: 3,
          type: "view",
          isPersistent: true,
          activeIndex: 0,
          children: [{ viewType: "verse-screen", title: "Scripture", state: "" }],
        },
        {
          size: 2,
          type: "view",
          isPersistent: true,
          activeIndex: 0,
          children: [{ viewType: "notes-panel", title: "Notes", state: "" }],
        },
      ],
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
