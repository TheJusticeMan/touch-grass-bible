export const processstart = new Date().getTime();
import { BibleTopics, BibleTopicsType } from "./BibleTopics";
import { App, UnifiedCommandPalette } from "./external/App";
import info from "./info.json";
import { Note, NotesPanel, NoteVault } from "./NotesPanel";
import { navigationPanel } from "./sidepanels";
import "./style.css";
import { DEFAULT_SETTINGS, TGAppSettings } from "./TGAppSettings";
import {
  BibleSearchCategory,
  BookmarkCategory,
  CrossRefCategory,
  GoToVerseCategory,
  myNotesCategory,
  SettingsCategory,
  TGPaletteState,
  topicListCategory,
  translationCategory,
  VerseListCategory,
} from "./TGPaletteCategories";
import { bibleData, VerseRef } from "./VerseRef";
import { VerseScreen } from "./VerseScreen";

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
 * @property {VerseScreen} MainScreen - The main screen displaying Bible verses.
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
  MainScreen!: VerseScreen;
  firstLoad = true;
  leftpanel!: navigationPanel;
  rightpanel!: NotesPanel;
  saveTimeoutId: ReturnType<typeof setTimeout> | null = null;
  Notes: NoteVault = new NoteVault();

  constructor(doc: Document) {
    super(doc, "Touch Grass Bible");
  }

  async onload() {
    this.MainScreen = new VerseScreen(this.contentEl, this);

    //this.leftpanel = new notesPanel(this, this.contentEl);
    this.leftpanel = new navigationPanel(this, this.contentEl);
    this.rightpanel = new NotesPanel(this, this.contentEl);
    this.on("ArrowRightKeyDown", () => this.leftpanel.open());
    this.commandPalette = new UnifiedCommandPalette(this as App);
    this.commandPalette.state = new TGPaletteState(this.commandPalette, "") as TGPaletteState;
    this.commandPalette
      .addPalettes(
        VerseListCategory,
        CrossRefCategory,
        BookmarkCategory,
        GoToVerseCategory,
        topicListCategory,
        BibleSearchCategory,
        translationCategory,
        myNotesCategory,
        //AI,
        SettingsCategory,
      )
      .on("update", e => {
        VerseRef.defaultTranslation = (e as TGPaletteState).defaultTranslation;
        this.MainScreen.verse = (e as TGPaletteState).verse;
      });

    await this.loadsettings(DEFAULT_SETTINGS);
    this.Notes.loadNotes(this.settings.ExtraNotes.map(nj => Note.fromJSON(nj)));

    // Load all JSON files in parallel for faster startup
    const [crossRefs, topics, translations] = await Promise.all([
      this.loadJSON<{ [x: string]: never[] }>("crossrefs.json"),
      this.loadJSON<BibleTopicsType>("topics.json"),
      this.loadJSON<{ [translation: string]: bibleData }>("translations.json"),
    ]);

    this.commandPalette.columns = this.contentEl.offsetWidth > 800;
    window.addEventListener("resize", () => {
      const isWide = this.contentEl.offsetWidth > 800;
      if (this.commandPalette.columns !== isWide) {
        this.commandPalette.columns = isWide;
        void (this.commandPalette.isOpen && this.commandPalette.display());
      }
    });

    VerseRef.bibleTranslations = translations;
    VerseRef.crossRefs = crossRefs;
    VerseRef.topics = new BibleTopics(topics);
    VerseRef.Bookmarks = new BibleTopics(this.settings.Bookmarks);
    (this.commandPalette.state as TGPaletteState).verse = VerseRef.RandomVerse;
    this.console.enabled = this.settings.enableLogging;
    this.console.log(info.name, info.version, "loaded");
    //this.on("EnterKeyDown", e => !this.commandPalette.isOpen && this.openCommandPalette());
    this.on("Ctrl+EnterKeyDown", () => !this.commandPalette.isOpen && this.openCommandPalette());

    this.console.log(new Date().getTime() - processstart, "ms startup time");
    this.console.log("Touch Grass Bible is ready!");

    this.MainScreen.onload();
    /* this.rightpanel.open(); */
  }

  openCommandPalette(TGPaletteState: Partial<TGPaletteState> = {}): void {
    this.commandPalette.update(TGPaletteState).open();
    if (this.settings.showHelp && this.firstLoad) {
      this.firstLoad = false;
    }
  }

  onunload(): boolean {
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
}

export const app = new TouchGrassBibleApp(document);
