import { Upload } from "lucide";
import { BibleTopics, BibleTopicsType } from "./BibleTopics";
import { App, DefaultCommandCategory, ScreenView } from "./external/App";
import info from "./info.json";
import "./style.css";
import { DEFAULT_SETTINGS, TGAppSettings } from "./TGAppSettings";
import {
  CrossRefCategory,
  TGPaletteState,
  VerseListCategory,
  BookmarkCategory,
  GoToVerseCategory,
  topicListCategory,
  BibleSearchCategory,
  TGCommandPalette,
} from "./TGPaletteCategories";
import { bibleData, VerseHighlight, VerseRef } from "./VerseRef";

/**
 * Represents the main screen for displaying and interacting with a single verse in the TouchGrassBibleApp.
 *
 * The `VerseScreen` class extends `ScreenView` and manages the display, selection, and highlighting of verses.
 * It synchronizes the current verse with the application's command palette and updates the UI accordingly.
 *
 * ### Features
 * - Displays verses from a specified book, chapter, and verse reference.
 * - Allows users to select verses by clicking, updating the active verse and UI.
 * - Supports context menu actions for verses, such as opening the command palette with cross-references.
 * - Keeps the application title and DOM in sync with the current verse.
 * - Handles paragraph breaks and highlights the active verse.
 *
 * @template T The application type, expected to be `TouchGrassBibleApp`.
 * @extends ScreenView<TouchGrassBibleApp>
 *
 * @property {VerseRef} verse - The current verse reference being displayed and interacted with.
 * @property {string} title - The title of the screen, synchronized with the app's title and DOM.
 *
 * @method update - Updates the display and UI based on the current verse, including highlighting and scrolling.
 *
 * @constructor
 * @param {HTMLElement} element - The root element for the screen view.
 * @param {TouchGrassBibleApp} app - The application instance.
 */
class VerseScreen extends ScreenView<TouchGrassBibleApp> {
  _verse: VerseRef;

  constructor(element: HTMLElement, protected app: TouchGrassBibleApp) {
    super(element, app);
    this.on("titleclick", e => {
      e.stopPropagation();
      this.app.openCommandPalette({ topic: "", specificity: 0 });
    });
    this.app.commandPalette.on("close", () => {
      const { verse } = this.app.commandPalette.state;
      if (verse && !verse.isSame(this.verse)) this.verse = verse;
      VerseRef.Bookmarks.addToHistory(this.verse);
      this.app.saveSettings();
    });

    // Initialize with a default verse
    this.verse = this.app.commandPalette.state.verse || new VerseRef("GENESIS", 1, 1);
  }

  // Title property syncs app title and DOM
  get title(): string {
    return this.app.title;
  }

  set title(value: string) {
    this.app.title = value;
    if (this.titleEl) {
      this.titleEl.textContent = value;
    }
  }

  // Getter and setter for the current verse
  get verse(): VerseRef {
    return this._verse;
  }

  set verse(value: VerseRef) {
    this._verse = value;
    this.update();
  }

  /**
   * Updates the display based on the current verse.
   */
  update(): void {
    // Update the window title to the verse's title in Title Case
    this.title = this._verse.toString().toTitleCase();

    // Clear previous content
    this.content.empty();

    const { book, chapter, verse } = this._verse;

    this._verse.chapterData("KJV").forEach((text: string, v: number) => {
      if (v === 0) return; // Skip non-verse entries (headings, etc.)

      const verseText = VerseHighlight.highlight(`${v} ${text}`);
      const isActive = verse === v;
      const isParagraphBreak = text.includes("#");
      const classes = ["verse"];

      if (isActive) classes.push("verseActive");
      if (isParagraphBreak) classes.push("versePBreak");

      // Create verse element
      this.content.createEl(
        "div",
        {
          text: verseText,
          cls: classes,
        },
        (el: HTMLElement) => {
          const newVerse = new VerseRef(book, chapter, v);

          // Attach click event to select the verse
          el.addEventListener("click", () => {
            this.verse = newVerse;
          });

          // Attach context menu to open command palette
          el.addEventListener("contextmenu", (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            this.app.openCommandPalette({ topCategory: CrossRefCategory, verse: newVerse });
          });
        }
      );
    });

    // Reset scroll and focus on active verse
    this.content.scroll(0, 0);
    this.content.querySelector(".verseActive")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}

declare const processstart: number;

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
 * @method onHistoryPop - Handles navigation history events, specifically for the command palette.
 * @method loadsettings - Loads and merges user settings with defaults.
 * @method saveSettings - Persists the current settings.
 */
export default class TouchGrassBibleApp extends App {
  settings: TGAppSettings;
  commandPalette: TGCommandPalette;
  MainScreen: VerseScreen;
  commands: DefaultCommandCategory<TouchGrassBibleApp>;
  firstLoad = true;

  constructor(doc: Document) {
    super(doc, "Touch Grass Bible");
  }

  async onload() {
    this.commandPalette = new TGCommandPalette(this);
    this.commandPalette.state = new TGPaletteState(this, "");
    this.commandPalette
      .addPalette(VerseListCategory)
      .addPalette(CrossRefCategory)
      .addPalette(BookmarkCategory)
      .addPalette(GoToVerseCategory)
      .addPalette(topicListCategory)
      .addPalette(BibleSearchCategory)
      .on("open", e => this.target.push(this.commandPalette))
      .on("close", e => this.target.pop());

    this.commands = this.commandPalette.addPalettereturns(DefaultCommandCategory);
    await this.loadsettings(DEFAULT_SETTINGS);
    // Load all JSON files in parallel for faster startup
    const [kjv, crossRefs, topics] = await Promise.all([
      this.loadJSON<bibleData>("KJV.json"),
      this.loadJSON<{ [x: string]: never[] }>("crossrefs.json"),
      this.loadJSON<BibleTopicsType>("topics.json"),
    ]);

    VerseRef.bible.KJV = kjv;
    VerseRef.crossRefs = crossRefs;
    VerseRef.topics = new BibleTopics(topics);
    VerseRef.Bookmarks = new BibleTopics(this.settings.Bookmarks);
    this.console.enabled = this.settings.enableLogging;
    this.console.log(info.name, info.version, "loaded");

    this.MainScreen = new VerseScreen(this.contentEl, this);
    this.on("keydown", e => e.key === "Enter" && !this.commandPalette.isOpen && this.openCommandPalette());

    this.console.log(new Date().getTime() - processstart, "ms startup time");
    this.commands.addCommand({
      name: "Delete Verse from tag",
      description: "Delete a verse from a bookmark tag",
      render: (cmd, item) => {
        const { verse, tag } = cmd.context as TGPaletteState;
        item.setTitle(`Delete ${verse.toString().toTitleCase()} from "${tag}"`);
        return { topCategory: BookmarkCategory, tag };
      },
      action: cmd => {
        const { verse, tag } = cmd.context as TGPaletteState;
        VerseRef.Bookmarks.removeFromTopic(tag, verse);
        this.commandPalette.display();
        this.saveSettings();
      },
    });
    this.commands.addCommand({
      name: "Delete Tag",
      description: "Delete a bookmark tag",
      render: (cmd, item) => {
        const { tag } = cmd.context as TGPaletteState;
        item.setTitle(`Delete Tag: ${tag}`);
        return { topCategory: BookmarkCategory, tag };
      },
      action: cmd => {
        const { tag } = cmd.context as TGPaletteState;
        VerseRef.Bookmarks.delete(tag);
        this.commandPalette.display();
        this.saveSettings();
      },
    });
    this.commands.addCommand({
      name: "Save To Bookmarks",
      description: "Save the current verse to a bookmark tag",
      getCommand: (query: string) => query !== "Welcome to Touch Grass Bible!",
      render: (cmd, item) => {
        const { verse, query } = cmd.context as TGPaletteState;
        const tag = (query || "Start Up Verses").toTitleCase();
        item.setTitle(`Save ${verse.toString().toTitleCase()} to "${tag}"`);
        return { topCategory: BookmarkCategory, tag };
      },
      action: cmd => {
        const { verse, query } = cmd.context as TGPaletteState;
        VerseRef.Bookmarks.saveToTopic(query.toTitleCase() || "Start Up Verses", verse);
        this.commandPalette.display();
        this.saveSettings();
      },
    });
    // Download command
    this.commands.addCommand({
      name: "Download Settings",
      description: "Download your current settings as a JSON file",
      action: () => {
        this.saveSettings(); // Ensure settings are saved before download
        this.downloadFile("TouchGrassBibleSettings.json", this.settings);
      },
    });

    // Upload command
    this.commands.addCommand({
      name: "Upload Settings",
      description: "Upload a JSON file to update your settings",
      action: () => {
        this.uploadFile(
          ".json",
          newSettings => {
            this.settings = Object.assign({}, DEFAULT_SETTINGS, newSettings);
            VerseRef.Bookmarks.addData(this.settings.Bookmarks);
            this.saveSettings();
          },
          error => this.console.error("Failed to parse settings file:", error),
          message => this.console.warn(message)
        );
      },
    });

    this.commands.addCommand({
      name: "Welcome to Touch Grass Bible!",
      description:
        "From here you can search for verses, topics, and more.  Remember to take breaks!  Touch grass!",
      getCommand: (query: string) => query === "Welcome to Touch Grass Bible!",
      render: (cmd, item) => {
        item.setHidden(false);
        return { topCategory: null };
      },
      action: cmd => {
        this.settings.showHelp = !this.settings.showHelp;
        this.saveSettings();
        this.commandPalette.display();
      },
    });
    this.commands.addCommand({
      name: info.name,
      description: `Version: ${info.version}\nAuthor: ${info.author}\nBuilt: ${new Date(
        info.build
      ).toString()}\nLicense${info.license}\n\n${info.description}`,
      render: (cmd, item) => {
        item.setHidden(false);
        return { topCategory: null };
      },
    });
  }

  openCommandPalette(TGPaletteState: Partial<TGPaletteState> = {}): void {
    this.commandPalette.open(TGPaletteState);
    if (this.settings.showHelp && this.firstLoad) {
      this.firstLoad = false;
      this.commandPalette.setValue("Welcome to Touch Grass Bible!", true);
    }
  }

  onunload(): boolean {
    return true;
  }

  async loadsettings(DEFAULT_SETTINGS: TGAppSettings) {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  saveSettings() {
    this.settings.Bookmarks = VerseRef.Bookmarks.toJSON();
    this.saveData(this.settings);
  }
}

const TGB = TouchGrassBibleApp;
export const app = new TouchGrassBibleApp(document);
