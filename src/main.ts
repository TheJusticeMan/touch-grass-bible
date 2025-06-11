import { ChevronLeft, ChevronRight, Sidebar } from "lucide";
import { BibleTopics, BibleTopicsType } from "./BibleTopics";
import { App, Command, DefaultCommandCategory, ScreenView, Scrollpast, sidePanel } from "./external/App";
import info from "./info.json";
import "./style.css";
import { DEFAULT_SETTINGS, TGAppSettings } from "./TGAppSettings";
import {
  BibleSearchCategory,
  BookmarkCategory,
  CrossRefCategory,
  GoToVerseCategory,
  TGCommandPalette,
  TGPaletteState,
  topicListCategory,
  translationCategory,
  VerseListCategory,
} from "./TGPaletteCategories";
import { bibleData, VerseHighlight, VerseRef } from "./VerseRef";
import { notesPanel } from "./sidepanels";

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
  scrollToTop: boolean;

  onload(): void {
    this.on("titleclick", e => {
      e.stopPropagation();
      this.app.openCommandPalette({ topic: "", specificity: 0 });
    });

    this.app.commandPalette.on("close", () => {
      const { verse, defaultTranslation } = this.app.commandPalette.state;
      this.verse = verse;
      VerseRef.Bookmarks.addToHistory(this.verse);
      this.app.saveSettings();
    });

    // Initialize with a default verse
    this.verse = this.app.commandPalette.state.verse || new VerseRef("GENESIS", 1, 1);
    new Scrollpast(this.content)
      .on("scrollpasttop", () => this.goprevChapter())
      .on("scrollpastbottom", () => this.gonextChapter());
  }
  // Title property syncs app title and DOM
  get title(): string {
    return this.app.title;
  }

  set title(value: string) {
    this.app.title = value;
    if (this.titleEl) {
      this.sptitle(frag => {
        frag.createEl("button", {}, el => {
          el.addEventListener("click", e => {
            e.stopPropagation();
            this.goprevChapter();
          });
          el.setIcon(ChevronLeft);
        });
        frag.createEl("span", { text: value, cls: "titleText" });
        frag.createEl("button", {}, el => {
          el.addEventListener("click", e => {
            e.stopPropagation();
            this.gonextChapter();
          });
          el.setIcon(ChevronRight);
        });
        return frag;
      });
      //this.titleEl.textContent = value;
    }
  }

  // Getter and setter for the current verse
  get verse(): VerseRef {
    return this._verse;
  }

  set verse(value: VerseRef) {
    const sameChapter =
      this._verse && this._verse.book === value.book && this._verse.chapter === value.chapter;
    this.scrollToTop = this._verse ? !sameChapter : true; // Reset scrollToTop if the verse changes
    this._verse = value;
    this.app.commandPalette.state.verse = value;
    this.update();
    this.app.leftpanel?.updateContent(value);
    this.scrollToTop = true; // Reset scrollToTop after updating
  }

  gonextChapter(): VerseRef {
    const { book, chapter } = this._verse;
    const nextChapter = chapter + 1;
    const nextBookIndex = VerseRef.booksOfTheBible.indexOf(book) + 1;
    if (nextChapter > VerseRef.bible[book].length - 1) {
      if (nextBookIndex > VerseRef.booksOfTheBible.length) {
        return (this.verse = new VerseRef(VerseRef.booksOfTheBible[0], 1, 1));
      }
      return (this.verse = new VerseRef(VerseRef.booksOfTheBible[nextBookIndex], 1, 1));
    }
    return (this.verse = new VerseRef(book, nextChapter, 1));
  }

  goprevChapter(): VerseRef {
    const { book, chapter } = this._verse;
    const prevChapter = chapter - 1;
    const prevBookIndex = VerseRef.booksOfTheBible.indexOf(book) - 1;
    if (prevChapter < 1) {
      if (prevBookIndex < 0) {
        const book = VerseRef.booksOfTheBible.at(-1)!;
        const lastChapter = VerseRef.bible[book].length - 1;
        return (this.verse = new VerseRef(book, lastChapter, 1));
      }
      const book = VerseRef.booksOfTheBible[prevBookIndex];
      const lastChapter = VerseRef.bible[book].length - 1;
      return (this.verse = new VerseRef(book, lastChapter, 1));
    }
    return (this.verse = new VerseRef(book, prevChapter, 1));
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

    this._verse.cTXT.forEach((text: string, v: number) => {
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
    if (this.scrollToTop) this.content.scroll(0, 0);
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
  leftpanel: notesPanel;
  saveTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(doc: Document) {
    super(doc, "Touch Grass Bible");
  }

  async onload() {
    this.MainScreen = new VerseScreen(this.contentEl, this);
    //this.MainScreen.onload();
    this.leftpanel = new notesPanel(this, this.contentEl);
    this.on("ArrowRightKeyDown", e => this.leftpanel.toggle());
    this.commandPalette = new TGCommandPalette(this);
    this.commandPalette.state = new TGPaletteState(this, "");
    this.commandPalette
      .addPalette(VerseListCategory)
      .addPalette(CrossRefCategory)
      .addPalette(BookmarkCategory)
      .addPalette(GoToVerseCategory)
      .addPalette(topicListCategory)
      .addPalette(BibleSearchCategory)
      .addPalette(translationCategory)
      .on("open", e => this.target.push(this.commandPalette))
      .on("close", e => this.target.pop())
      .on("display", e => {
        if (this.target.at(-1) !== this.commandPalette) {
          this.target.push(this.commandPalette);
        }
        return (VerseRef.defaultTranslation = this.commandPalette.state.defaultTranslation);
      });

    this.commands = this.commandPalette.addPalettereturns(DefaultCommandCategory);
    await this.loadsettings(DEFAULT_SETTINGS);
    // Load all JSON files in parallel for faster startup
    const [crossRefs, topics, translations] = await Promise.all([
      this.loadJSON<{ [x: string]: never[] }>("crossrefs.json"),
      this.loadJSON<BibleTopicsType>("topics.json"),
      this.loadJSON<{ [translation: string]: bibleData }>("translations.json"),
    ]);

    VerseRef.bibleTranslations = translations;
    VerseRef.crossRefs = crossRefs;
    VerseRef.topics = new BibleTopics(topics);
    VerseRef.Bookmarks = new BibleTopics(this.settings.Bookmarks);
    this.commandPalette.state.verse = VerseRef.RandomVerse;
    this.console.enabled = this.settings.enableLogging;
    this.console.log(info.name, info.version, "loaded");
    this.on("EnterKeyDown", e => !this.commandPalette.isOpen && this.openCommandPalette());

    this.console.log(new Date().getTime() - processstart, "ms startup time");
    this.addCommand({
      name: "Delete verse from tag",
      description: "Delete a verse from a bookmark tag",
      render: (cmd, item) => {
        const { verse, tag } = cmd.context as TGPaletteState;
        item.setTitle(`Delete ${verse.toString().toTitleCase()} from "${tag}"`);
        return { topCategory: BookmarkCategory, tag };
      },
      action: cmd => {
        const { verse, tag } = cmd.context as TGPaletteState;
        VerseRef.Bookmarks.remove(tag, verse);
        this.commandPalette.display();
        this.saveSettings();
      },
    });
    this.addCommand({
      name: "Delete tag",
      description: "Delete a bookmark tag",
      render: (cmd, item) => {
        const { tag } = cmd.context as TGPaletteState;
        item.setTitle(`Delete tag: ${tag}`);
        return { topCategory: BookmarkCategory, tag };
      },
      action: cmd => {
        const { tag } = cmd.context as TGPaletteState;
        VerseRef.Bookmarks.delete(tag);
        this.commandPalette.display();
        this.saveSettings();
      },
    });
    this.addCommand({
      name: "Save to bookmarks",
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
        VerseRef.Bookmarks.add(query.toTitleCase() || "Start Up Verses", verse);
        this.commandPalette.display();
        this.saveSettings();
      },
    });
    // Download command
    this.addCommand({
      name: "Download settings",
      description: "Download your current settings as a JSON file",
      action: () => {
        this.saveSettings(); // Ensure settings are saved before download
        this.downloadFile("TouchGrassBibleSettings.json", this.settings);
      },
    });

    // Upload command
    this.addCommand({
      name: "Upload settings",
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
    this.addCommand({
      name: "Reset settings",
      description: "Reset settings to default values",
      action: () => {
        this.commandPalette
          .confirm("Are you sure you want to delete all your data including bookmarks?")
          .then(confirmed => {
            if (!confirmed) return;
            this.settings = { ...DEFAULT_SETTINGS };
            VerseRef.Bookmarks = new BibleTopics(this.settings.Bookmarks);
            this.saveSettings();
            this.commandPalette.display({ topCategory: null });
          });
      },
    });
    this.addCommand({
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
    this.addCommand({
      name: info.name,
      description: `Version: ${info.version}
        Author: ${info.author}
        Built: ${new Date(info.build).toString()}
        License: ${info.license}
        
        ${info.description}`,
      render: (cmd, item) => {
        item.setHidden(false);
        return { topCategory: null };
      },
    });
    this.MainScreen.onload();
  }

  addCommand(cmd: Partial<Command<TouchGrassBibleApp>>) {
    if (!cmd.name || !cmd.description) this.console.warn("Command must have a name and description");
    this.commands.addCommand(cmd);
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
    VerseRef.myNotes = new Map(this.settings.myNotes);
  }

  saveSettings() {
    this.settings.Bookmarks = VerseRef.Bookmarks.toJSON();
    this.settings.myNotes = Array.from(VerseRef.myNotes.entries());
    this.saveData(this.settings);
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

const TGB = TouchGrassBibleApp;
const app = new TouchGrassBibleApp(document);
