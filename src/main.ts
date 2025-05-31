import {
  App,
  AppState,
  CommandPalette,
  CommandPaletteCategory,
  CommandPaletteItem,
  ScreenView,
} from "./external/App";
import { CommandPaletteState, RealCommandPaletteCategory } from "./external/CommandPalette";
import info from "./info.json";
import "./style.css";
import { DEFAULT_SETTINGS, TGAppSettings } from "./TGAppSettings";
import { VerseHighlight, VerseRef } from "./VerseRef";

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
      this.app.openCommandPalette({ verses: this.app.settings.workspaces.currentVerses });
    });

    // Initialize with a default verse
    this.verse = new VerseRef("GENESIS", 6, 1);
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
    this.app.commandPalette.state.verse = value; // Update command palette state
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
            this.app.openCommandPalette({ _topCategory: CrossRefsPalette.name, verse: newVerse });
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

class TGPaletteState extends CommandPaletteState<TouchGrassBibleApp> {
  verse: VerseRef = new VerseRef("GENESIS", 1, 1);
  verses: VerseRef[] = [];
  specifity: number = 0; // 0: Book, 1: Chapter, 2: Verse, 3: Full Verse
  topic: string = "";
  tag: string = "";
  constructor(public app: TouchGrassBibleApp, public query: string) {
    super(app, query, "");
  }
  update(partial: Partial<TGPaletteState> = {}): TGPaletteState {
    return Object.assign(Object.create(this), this, partial).updateTopCategory();
  }
}

class verseListPalette extends CommandPaletteCategory<VerseRef, TouchGrassBibleApp> {
  verses: VerseRef[] = [];
  name = "Verse List"; // Name of the category

  onTrigger(context: TGPaletteState): void {
    this.verses = context.verses || [];
  }

  getCommands(query: string): VerseRef[] {
    // Filter verses based on the query
    return this.getcompatible(
      query,
      this.verses,
      verse => verse.toString(),
      verse => verse.verseData("KJV")
    );
  }

  renderCommand(
    verse: VerseRef,
    Item: CommandPaletteItem<VerseRef, TouchGrassBibleApp>
  ): Partial<TGPaletteState> {
    Item.setTitle(verse.toString().toTitleCase())
      .setDescription(verse.verseData("KJV"))
      .setSubsearch(true);
    return { _topCategory: CrossRefsPalette.name, verse: verse, specifity: 0 };
  }

  executeCommand(command: VerseRef): void {
    this.app.MainScreen.verse = command;
    this.app.commandPalette.close();
  }
}

class CrossRefsPalette extends verseListPalette {
  readonly name = "Cross References";

  onTrigger(context: TGPaletteState): void {
    const { verse } = context;
    if (verse) {
      this.verses = verse.crossRefs();
      this.title = `Cross References for ${verse.toString().toTitleCase()}`;
    } else {
      this.verses = [];
    }
  }
}

class GoToVersePalette extends CommandPaletteCategory<VerseRef, TouchGrassBibleApp> {
  readonly name = "Go To Verse";
  list: VerseRef[] = [];
  specifity: number = 0; // 0: Book, 1: Chapter, 2: Verse, 3: Full Verse

  onTrigger(context: TGPaletteState): void {
    if (context) {
      const { verse, specifity } = context;
      this.specifity = context.specifity;

      switch (specifity) {
        case 0: // Book
          this.list = VerseRef.booksOfTheBible.map(book => new VerseRef(book, 1, 1));
          break;
        case 1: // Book and Chapter
          this.title = `Go To Verse: ${verse.book}`;
          this.app.commandPalette.inputMode = "numeric";
          this.list =
            verse
              .bookData("KJV")
              ?.slice(1)
              .map((chapter, index) => new VerseRef(verse.book, index + 1, 1)) || [];
          break;
        case 2: // Book, Chapter, and Verse
          this.title = `Go To Verse: ${verse.book}:${verse.chapter}`;
          this.list =
            verse
              .chapterData("KJV")
              .slice(1)
              .map((text, index) => {
                return new VerseRef(verse.book, verse.chapter, index + 1);
              }) || [];
          break;
        case 3: // Full Verse
          this.app.MainScreen.verse = verse;
      }
    } else {
      this.specifity = 0;
      this.list = VerseRef.booksOfTheBible.map(book => new VerseRef(book, 1, 1));
    }
  }

  getCommands(query: string): VerseRef[] {
    switch (this.specifity) {
      case 0: // Book
        return this.getcompatible(query, this.list, ref => ref.book);
      case 1: // Book and Chapter
        return this.getcompatible(query, this.list, ref => ref.chapter.toString());
      case 2: // Book, Chapter, and Verse
        return this.getcompatible(
          query,
          this.list,
          ref => ref.verse.toString(),
          ref => ref.verseData("KJV")
        );
      default:
        return [];
    }
  }

  renderCommand(
    verse: VerseRef,
    Item: CommandPaletteItem<VerseRef, TouchGrassBibleApp>
  ): Partial<TGPaletteState> {
    switch (this.specifity) {
      case 0: // Book
        Item.setTitle(verse.book.toString().toTitleCase()).setSubsearch(true);
        return { _topCategory: GoToVersePalette.name, specifity: 1, verse };
      case 1: // Book and Chapter
        Item.setTitle(`${verse.book.toString().toTitleCase()} ${verse.chapter}`).setSubsearch(true);
        return { _topCategory: GoToVersePalette.name, specifity: 2, verse };
      case 2: // Book, Chapter, and Verse
        Item.setTitle(verse.toString().toTitleCase()).setDescription(verse.verseData("KJV"));
        return { _topCategory: CrossRefsPalette.name, specifity: 0, verse };
    }
    return { _topCategory: CrossRefsPalette.name, specifity: 0, verse };
  }

  executeCommand(ref: VerseRef): void {
    if (this.specifity >= 2) {
      this.app.MainScreen.verse = ref;
      this.app.commandPalette.close();
    } else {
      this.app.commandPalette.display();
    }
  }
}

class BibleSearchPalette extends CommandPaletteCategory<VerseRef, TouchGrassBibleApp> {
  readonly name = "Bible Search";
  verses: VerseRef[] = [];
  bible = VerseRef.bible.KJV;

  onTrigger(context: TGPaletteState): void {
    this.bible = VerseRef.bible.KJV;
  }

  getCommands(query: string): VerseRef[] {
    const maxResults = this.app.commandPalette.state.maxResults - this.app.commandPalette.length; // Limit the number of results to avoid performance issues
    if (!query) return [];

    const results: VerseRef[] = [];
    const quarylcase = query.toLowerCase();

    for (const book in this.bible) {
      if (this.bible.hasOwnProperty(book)) {
        const chapters = this.bible[book];
        for (let chapter = 1; chapter < chapters.length; chapter++) {
          const verses = chapters[chapter];
          for (let verse = 1; verse < verses.length; verse++) {
            const text = verses[verse];
            if (text && text.toLowerCase().includes(quarylcase)) {
              results.push(new VerseRef(book, chapter, verse));
              if (results.length > maxResults) return results;
            }
          }
        }
      }
    }
    return results;
  }

  renderCommand(
    verse: VerseRef,
    Item: CommandPaletteItem<VerseRef, TouchGrassBibleApp>
  ): Partial<TGPaletteState> {
    Item.setTitle(verse.toString().toTitleCase())
      .setDescription(verse.verseData("KJV"))
      .setSubsearch(true)
      .setHidden(false);
    return { _topCategory: "", verse };
  }

  executeCommand(command: VerseRef): void {
    this.app.MainScreen.verse = command;
    this.app.commandPalette.close();
  }
}

class topicListPalette extends CommandPaletteCategory<VerseRef | string, TouchGrassBibleApp> {
  topics: string[] | VerseRef[] = [];
  name = "Topics"; // Name of the category

  onTrigger(context: TGPaletteState): void {
    if (context.topic) {
      const { topic } = context; // Get the topic from the context
      this.topics = VerseRef.topics[topic].map(OSIS => VerseRef.fromOSIS(OSIS[0] as string));
      this.title = `Topic: ${topic.toTitleCase()}`;
    } else {
      this.topics = Object.keys(VerseRef.topics);
    }
  }

  getCommands(query: string): (VerseRef | string)[] {
    if (this.topics.length > 0 && typeof this.topics[0] === "string") {
      if (!query) return [];
      return this.getcompatible(query, this.topics as string[], topic => topic);
    } else {
      return this.getcompatible(
        query,
        this.topics as VerseRef[],
        verse => verse.toString(),
        verse => verse.verseData("KJV")
      );
    }
  }

  renderCommand(
    command: VerseRef | string,
    Item: CommandPaletteItem<VerseRef | string, TouchGrassBibleApp>
  ): Partial<TGPaletteState> {
    if (typeof command === "string") {
      Item.setTitle(command.toTitleCase()).setSubsearch(true);
      return { _topCategory: topicListPalette.name, topic: command };
    } else {
      Item.setTitle(command.toString().toTitleCase())
        .setDescription(command.verseData("KJV"))
        .setSubsearch(true);
      return { _topCategory: CrossRefsPalette.name, verse: command };
    }
  }

  executeCommand(command: VerseRef | string): void {
    if (typeof command === "string") this.app.commandPalette.display();
    else this.app.commandPalette.close();
  }
}

class personalTopicListPalette extends CommandPaletteCategory<
  VerseRef | string,
  TouchGrassBibleApp
> {
  tags: string[] | VerseRef[] = [];
  name = "Topics"; // Name of the category

  onTrigger(context: TGPaletteState): void {
    if (context.tag) {
      const { tag } = context; // Get the topic from the context
      this.tags = VerseRef.tags[tag].map(OSIS => VerseRef.fromOSIS(OSIS[0] as string));
      this.title = `Topic: ${tag.toTitleCase()}`;
    } else {
      this.tags = Object.keys(VerseRef.tags);
    }
  }

  getCommands(query: string): (VerseRef | string)[] {
    if (this.tags.length > 0 && typeof this.tags[0] === "string") {
      if (!query) return [];
      return this.getcompatible(query, this.tags as string[], topic => topic);
    } else {
      return this.getcompatible(
        query,
        this.tags as VerseRef[],
        verse => verse.toString(),
        verse => verse.verseData("KJV")
      );
    }
  }

  renderCommand(
    command: VerseRef | string,
    Item: CommandPaletteItem<VerseRef | string, TouchGrassBibleApp>
  ): Partial<TGPaletteState> {
    if (typeof command === "string") {
      Item.setTitle(command.toTitleCase()).setSubsearch(true);
      return { _topCategory: personalTopicListPalette.name, tag: command };
    } else {
      Item.setTitle(command.toString().toTitleCase())
        .setDescription(command.verseData("KJV"))
        .setSubsearch(true);
      return { _topCategory: CrossRefsPalette.name, verse: command };
    }
  }

  executeCommand(command: VerseRef | string): void {
    if (typeof command === "string") this.app.commandPalette.display();
    else this.app.commandPalette.close();
  }
}

class TGCommandPalette extends CommandPalette<TouchGrassBibleApp> {
  state: TGPaletteState;

  constructor(app: TouchGrassBibleApp) {
    super(app);
    this.state = new TGPaletteState(app, "");
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
class TouchGrassBibleApp extends App {
  settings: TGAppSettings;
  commandPalette: TGCommandPalette;
  MainScreen: VerseScreen;
  commands: RealCommandPaletteCategory<TouchGrassBibleApp>;

  constructor(doc: Document) {
    super(doc, "Touch Grass Bible");
  }

  async onload() {
    this.commandPalette = new TGCommandPalette(this);
    //this.commands = this.commandPalette.addPalettereturns(RealCommandPaletteCategory);
    this.commandPalette
      .addPalette(verseListPalette)
      .addPalette(CrossRefsPalette)
      //.addPalette(personalTopicListPalette)
      .addPalette(GoToVersePalette)
      .addPalette(topicListPalette)
      .addPalette(BibleSearchPalette);
    await this.loadsettings(DEFAULT_SETTINGS);
    // Load all JSON files in parallel for faster startup
    const [kjv, crossRefs, topics] = await Promise.all([
      this.loadJSON("KJV.json"),
      this.loadJSON("crossrefs.json"),
      this.loadJSON("topics.json"),
    ]);

    VerseRef.bible.KJV = kjv;
    VerseRef.crossRefs = crossRefs;
    VerseRef.topics = topics;

    this.console.enabled = this.settings.enableLogging;
    this.console.log(info.name, info.version, "loaded");

    this.MainScreen = new VerseScreen(this.contentEl, this);
    document.addEventListener("keydown", e => {
      if (e.key === "Enter" && !this.commandPalette.isOpen) {
        this.openCommandPalette();
      }
    });

    this.console.log(new Date().getTime() - processstart, "ms startup time");
    this.on("historypop", (e: AppState) => {
      if (e.name === "Command Palette") {
        this.commandPalette.handleBack();
      }
    });

    /* this.commands.addCommand({
      name: "Save To Bookmarks",
      description: "Save the current verse to bookmarks",
      action: cmd => {
        const { verses, query } = cmd.context as TGPaletteState;
        if (!VerseRef.tags[query]) VerseRef.tags[query] = [];
        VerseRef.tags[query].push(...verses.map(v => v.toOSIS()));
      },
      prerender: cmd => {
        return {};
      },
    }); */
  }

  openCommandPalette(TGPaletteState: Partial<TGPaletteState> = {}): void {
    this.commandPalette.open(TGPaletteState);
  }

  onunload(): boolean {
    return true;
  }

  async loadsettings(DEFAULT_SETTINGS: TGAppSettings) {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  saveSettings() {
    this.saveData(this.settings);
  }
}

const TGB = TouchGrassBibleApp;
const app = new TouchGrassBibleApp(document);
