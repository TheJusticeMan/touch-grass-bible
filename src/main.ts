export const processstart = new Date().getTime();
import { BibleTopics } from "./BibleTopics";
import { App, UnifiedCommandPalette } from "./external/App";
import info from "./info.json";
import { Note, NotesPanel, NoteVault } from "./NotesPanel";
import BookmarkPlugin from "./plugins/Bookmarks";
import NotesPlugin from "./plugins/Notes";
import BibleSearchPlugin from "./plugins/Search";
import SettingsPlugin from "./plugins/Settings";
import TopicalBiblePlugin from "./plugins/TopicalBible";
import TranslationsPlugin from "./plugins/Translations";
import TSK from "./plugins/TSK";
import { navigationPanel } from "./sidepanels";
import "./style.css";
import { DEFAULT_SETTINGS, TGAppSettings } from "./TGAppSettings";
import { TGPaletteState } from "./TGPaletteCategories";
import { bibleData, VerseRef } from "./VerseRef";
import { VerseScreen } from "./VerseScreen";
import { Panel, View, WorkspaceLayout } from "./external/Workspace";
import type { IconActionItem } from "./Plugin";

export * from "./external/App";
export * from "./TGAppSettings";
export * from "./TGPaletteCategories";
export * from "./VerseRef";
export * from "./VerseScreen";

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
  settings!: TGAppSettings;
  private workspaceHostEl!: HTMLDivElement;
  private verseActions: Map<string, IconActionItem> = new Map();
  firstLoad = true;
  saveTimeoutId: ReturnType<typeof setTimeout> | null = null;
  workspaceSaveTimeoutId: ReturnType<typeof setTimeout> | null = null;
  Notes: NoteVault = new NoteVault();

  constructor(doc: Document) {
    super(doc, "Touch Grass Bible");
  }

  async onload() {
    this.initializeWorkspaceHost();
    this.on("ArrowRightKeyDown", () => {
      this.workspace.activateView("navigation-panel");
    });
    this.commandPalette = new UnifiedCommandPalette(this as App);
    this.commandPalette.state = new TGPaletteState(this.commandPalette, "");
    this.commandPalette.on("update", e => {
      VerseRef.defaultTranslation = (e as TGPaletteState).defaultTranslation;
      const activeVerseScreen = this.getActiveVerseScreen();
      if (activeVerseScreen) {
        activeVerseScreen.verse = (e as TGPaletteState).verse;
      }
    });

    await this.loadsettings(DEFAULT_SETTINGS);
    await this.loadWorkspaceLayout();
    this.registerWorkspaceViews();
    this.ensureMainScreenTab();
    this.workspace.on("layout-change", () => {
      this.saveWorkspaceAfterDelay();
    });
    this.Notes.loadNotes(this.settings.ExtraNotes.map(nj => Note.fromJSON(nj)));

    // Load all JSON files in parallel for faster startup
    const translations = await this.loadJSON<{ [translation: string]: bibleData }>("translations.json");
    this.commandPalette.columns = this.contentEl.offsetWidth > 800;
    window.addEventListener("resize", () => {
      const isWide = this.contentEl.offsetWidth > 800;
      if (this.commandPalette.columns !== isWide) {
        this.commandPalette.columns = isWide;
        void (this.commandPalette.isOpen && this.commandPalette.display());
      }
    });

    VerseRef.bibleTranslations = translations;
    VerseRef.Bookmarks = new BibleTopics(this.settings.Bookmarks);
    (this.commandPalette.state as TGPaletteState).verse = VerseRef.RandomVerse;
    this.console.enabled = this.settings.enableLogging;
    this.console.log(info.name, info.version, "loaded");
    //this.on("EnterKeyDown", e => !this.commandPalette.isOpen && this.openCommandPalette());
    this.on("Ctrl+EnterKeyDown", () => !this.commandPalette.isOpen && this.openCommandPalette());

    this.console.log(new Date().getTime() - processstart, "ms startup time");
    this.console.log("Touch Grass Bible is ready!");

    new BookmarkPlugin(this, {
      id: "bookmarks",
      name: "Bookmarks",
      description: "View and manage your bookmarked verses.",
      version: "1.0.0",
    }).load();
    new TSK(this, {
      id: "tsk",
      name: "TSK+",
      description: "Enhanced cross references from Treasury of Scripture Knowledge.",
      version: "1.0.0",
    }).load();
    new BibleSearchPlugin(this, {
      id: "bible-search",
      name: "Bible Search",
      description: "Search for verses in the Bible.",
      version: "1.0.0",
    }).load();
    new TopicalBiblePlugin(this, {
      id: "topical-bible",
      name: "Topical Bible",
      description: "Browse topics and their associated verses from OpenBible.info.",
      version: "1.0.0",
    }).load();
    new NotesPlugin(this, {
      id: "notes",
      name: "Notes",
      description: "Create and manage personal notes on verses.",
      version: "1.0.0",
    }).load();
    new TranslationsPlugin(this, {
      id: "translations",
      name: "Translations",
      description: "View and switch between different Bible translations.",
      version: "1.0.0",
    }).load();
    new SettingsPlugin(this, {
      id: "settings",
      name: "Settings",
      description: "Configure Touch Grass Bible settings",
      version: "1.0.0",
    }).load();
  }

  addVerseAction(action: IconActionItem): this {
    this.verseActions.set(action.id, action);
    return this;
  }

  removeVerseAction(actionId: string): this {
    this.verseActions.delete(actionId);
    return this;
  }

  getVerseActions(): IconActionItem[] {
    return Array.from(this.verseActions.values());
  }

  getActiveVerseScreen(): VerseScreen | null {
    const { activeView } = this.workspace;
    return activeView instanceof VerseScreen ? activeView : null;
  }

  setActiveVerse(verse: VerseRef): boolean {
    const active = this.getActiveVerseScreen();
    if (active) {
      active.verse = verse;
      return true;
    }

    if (!this.workspace.activateView("verse-screen")) {
      return false;
    }

    const activated = this.getActiveVerseScreen();
    if (!activated) {
      return false;
    }

    activated.verse = verse;
    return true;
  }

  openCommandPalette(TGPaletteState: Partial<TGPaletteState> = {}): void {
    this.commandPalette.update(TGPaletteState).open();
    if (this.settings.showHelp && this.firstLoad) {
      this.firstLoad = false;
    }
  }

  onunload(): boolean {
    this.saveWorkspaceLayout();
    return true;
  }

  async loadsettings(DEFAULT_SETTINGS: TGAppSettings) {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    VerseRef.myNotes = new Map(this.settings.myNotes);
  }

  saveSettings() {
    this.settings.Bookmarks = VerseRef.Bookmarks.toJSON();
    this.settings.myNotes = Array.from(VerseRef.myNotes.entries());
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

  async loadWorkspaceLayout() {
    const rawLayout = await this.loadConfig("workspace");
    let parsedLayout: unknown;
    try {
      parsedLayout = JSON.parse(rawLayout);
    } catch (error) {
      this.console.warn("Invalid workspace config JSON. Falling back to default layout.", error);
      this.initializeWorkspace(this.buildDefaultWorkspaceLayout(), this.workspaceHostEl);
      return;
    }

    const restored = this.initializeWorkspace(
      parsedLayout as ReturnType<typeof this.workspace.serializeLayout>,
      this.workspaceHostEl,
    );
    if (!restored) {
      this.console.warn("Workspace layout rejected. Falling back to default layout.");
      this.initializeWorkspace(this.buildDefaultWorkspaceLayout(), this.workspaceHostEl);
    }
  }

  saveWorkspaceLayout() {
    const serializedLayout = this.workspace.serializeLayout();
    void this.saveConfig("workspace", JSON.stringify(serializedLayout));
  }

  saveWorkspaceAfterDelay(delay: number = 500) {
    if (this.workspaceSaveTimeoutId !== null) {
      clearTimeout(this.workspaceSaveTimeoutId);
      this.workspaceSaveTimeoutId = null;
    }
    this.workspaceSaveTimeoutId = setTimeout(() => {
      this.saveWorkspaceLayout();
      this.workspaceSaveTimeoutId = null;
    }, delay);
  }

  private initializeWorkspaceHost() {
    if (this.workspaceHostEl) return;
    this.workspaceHostEl = this.contentEl.createEl("div", { cls: "workspace-root-host" });
  }

  private mountWorkspaceRoot() {
    if (!this.workspaceHostEl) {
      this.initializeWorkspaceHost();
    }
    this.workspaceHostEl.empty();
    this.workspaceHostEl.appendChild(this.workspace.rootPanel.containerEl);
  }

  private registerWorkspaceViews() {
    this.workspace.registerView("verse-screen", panel => {
      const verseScreen = new VerseScreen(panel, this);
      verseScreen.onload();
      return verseScreen;
    });

    this.workspace.registerView("reading-tools", panel => {
      const view = new View(panel);
      view.containerEl.classList.add("workspace-static-view");
      view.containerEl.createEl("h3", { text: "Reading Tools" });
      view.containerEl.createEl("p", {
        text: "Use Ctrl+Enter to open the command palette, then search books, verses, notes, and references.",
      });
      return view;
    });

    this.workspace.registerView("navigation-panel", panel => {
      return new navigationPanel(panel, this);
    });

    this.workspace.registerView("notes-panel", panel => {
      return new NotesPanel(panel, this);
    });
  }

  private ensureMainScreenTab() {
    if (this.hasRegisteredViewInLayout("verse-screen")) {
      return;
    }
    this.workspace.restoreLayout(this.buildDefaultWorkspaceLayout());
    this.mountWorkspaceRoot();
  }

  private hasRegisteredViewInLayout(viewId: string, panel: Panel = this.workspace.rootPanel): boolean {
    if (panel.getMode() === "views") {
      return panel.getViews().some((view: { id: string }) => view.id === viewId);
    }

    return panel.childPanels.some(child => this.hasRegisteredViewInLayout(viewId, child.panel));
  }

  private buildDefaultWorkspaceLayout(): WorkspaceLayout {
    return {
      version: 1,
      rootPanel: {
        id: "root",
        mode: "panels",
        splitDirection: "horizontal",
        children: [
          {
            size: 3,
            panel: {
              id: "main-tabs",
              mode: "views",
              splitDirection: "horizontal",
              views: [
                { id: "verse-screen", title: "Scripture" },
                { id: "reading-tools", title: "Tools" },
              ],
            },
          },
          {
            size: 2,
            panel: {
              id: "secondary-tabs",
              mode: "views",
              splitDirection: "horizontal",
              views: [
                { id: "navigation-panel", title: "Navigate" },
                { id: "notes-panel", title: "Notes" },
              ],
            },
          },
        ],
      },
    };
  }
}

export const app = new TouchGrassBibleApp(document);
