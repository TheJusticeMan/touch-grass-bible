import { BookCopy, Library, List, Search } from "lucide";
import {
  App,
  AppHistory,
  CommandPalette,
  CommandPaletteCategory,
  CommandPaletteItem,
  ScreenView,
} from "./external/App";
import { DEFAULT_SETTINGS, RealBibleAppSettings } from "./RealBibleAppSettings";
import "./style.css";
import { VerseHighlight, VerseRef } from "./VerseRef";
import info from "./info.json";

class VerseScreen extends ScreenView<TouchGrassBibleApp> {
  // Use private fields with '#' for encapsulation (ES2022 feature)
  _verse: VerseRef;

  constructor(element: HTMLElement, protected app: TouchGrassBibleApp) {
    super(element, app);
    this.ontitleclick(e => {
      e.stopPropagation();
      this.app.commandPalette.open(this.app.settings.workspaces.currentVerses);
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

    VerseRef.bible.KJV?.[book]?.[chapter].forEach((text: string, v: number) => {
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
            this.app.commandPalette.open(newVerse);
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

class verseListPallet extends CommandPaletteCategory<VerseRef, TouchGrassBibleApp> {
  verses: VerseRef[] = [];
  name = "Verse List"; // Name of the category
  icon = List; // Icon for the category, can be a string or an SVG element
  childtype: string = CrossRefsPallet.name;

  onTrigger(context?: any): void {
    this.name = "Verse List";
    if (Array.isArray(context) && context[0] instanceof VerseRef)
      this.verses = context as VerseRef[];
    else this.verses = [];
  }

  getCommands(query: string): VerseRef[] {
    // Filter verses based on the query
    return this.getcompatible(
      query,
      this.verses,
      verse => verse.toString(),
      verse => VerseRef.bible.KJV[verse.book]?.[verse.chapter]?.[verse.verse] || ""
    );
  }

  renderCommand(verse: VerseRef, Item: CommandPaletteItem<VerseRef>): void {
    Item.setTitle(verse.toString().toTitleCase())
      .setDescription(VerseRef.bible.KJV[verse.book]?.[verse.chapter]?.[verse.verse] || "")
      .setSubsearch(true);
  }

  executeCommand(command: VerseRef): void {
    this.app.MainScreen.verse = command;
    this.palette.close();
  }
}

class CrossRefsPallet extends verseListPallet {
  name = "Cross References";
  icon = Library; // Icon for the category, can be a string or an SVG element

  onTrigger(context?: any): void {
    this.name = "Cross References";
    if (context instanceof VerseRef) {
      this.verses = context.crossRefs();
    } else if (context instanceof VerseRefPart) {
      this.verses = context.verse.crossRefs();
    } else {
      this.verses = [];
    }
  }
}

class VerseRefPart {
  constructor(public specifity: number, public verse: VerseRef) {}
}

class GoToVersePalette extends CommandPaletteCategory<VerseRefPart, TouchGrassBibleApp> {
  name = "Go To Verse";
  icon = BookCopy; // Icon for the category, can be a string or an SVG element
  list: VerseRefPart[] = [];
  part: VerseRefPart = new VerseRefPart(0, new VerseRef("GENESIS", 1, 1));
  childtype: string = GoToVersePalette.name;

  onTrigger(context?: any): void {
    this.name = "Go To Verse";
    if (context instanceof VerseRefPart) {
      this.part = context;

      switch (context.specifity) {
        case 0: // Book
          this.name = "Go To Verse";
          this.list = VerseRef.booksOfTheBible.map(
            book => new VerseRefPart(1, new VerseRef(book, 1, 1))
          );
          break;
        case 1: // Book and Chapter
          this.name = `Go To Verse: ${context.verse.book}`;
          this.palette.inputMode = "numeric";
          this.list =
            VerseRef.bible.KJV[context.verse.book]
              ?.slice(1)
              .map(
                (chapter, index) =>
                  new VerseRefPart(2, new VerseRef(context.verse.book, index + 1, 1))
              ) || [];
          break;
        case 2: // Book, Chapter, and Verse
          this.name = `Go To Verse: ${context.verse.book}:${context.verse.chapter}`;
          this.list =
            VerseRef.bible.KJV[context.verse.book]?.[context.verse.chapter]
              ?.slice(1)
              .map((text, index) => {
                return new VerseRefPart(
                  3,
                  new VerseRef(context.verse.book, context.verse.chapter, index + 1)
                );
              }) || [];
          break;
        case 3: // Full Verse
          this.app.MainScreen.verse = context.verse;
      }
    } else {
      this.part = new VerseRefPart(0, new VerseRef("GENESIS", 1, 1));
      this.list = VerseRef.booksOfTheBible.map(
        book => new VerseRefPart(1, new VerseRef(book, 1, 1))
      );
    }
  }

  getCommands(query: string): VerseRefPart[] {
    switch (this.part.specifity) {
      case 0: // Book
        this.childtype = GoToVersePalette.name;
        return this.getcompatible(query, this.list, part => part.verse.book);
      case 1: // Book and Chapter
        this.childtype = GoToVersePalette.name;
        return this.getcompatible(query, this.list, part => part.verse.chapter.toString());
      case 2: // Book, Chapter, and Verse
        this.childtype = CrossRefsPallet.name;
        return this.getcompatible(
          query,
          this.list,
          part => part.verse.verse.toString(),
          part =>
            VerseRef.bible.KJV[part.verse.book]?.[part.verse.chapter]?.[part.verse.verse] || ""
        );
      default:
        return [];
    }
  }

  renderCommand(command: VerseRefPart, Item: CommandPaletteItem<VerseRefPart>): void {
    switch (this.part.specifity) {
      case 0: // Book
        Item.setTitle(command.verse.book.toString().toTitleCase()).setSubsearch(true);
        break;
      case 1: // Book and Chapter
        Item.setTitle(
          `${command.verse.book.toString().toTitleCase()} ${command.verse.chapter}`
        ).setSubsearch(true);
        break;
      case 2: // Book, Chapter, and Verse
        Item.setTitle(command.verse.toString().toTitleCase()).setDescription(
          VerseRef.bible.KJV[command.verse.book]?.[command.verse.chapter]?.[command.verse.verse] ||
            ""
        );
        break;
    }
  }

  executeCommand(command: VerseRefPart): void {
    if (command.specifity === 3) {
      this.app.MainScreen.verse = command.verse;
      this.palette.close();
    } else {
      this.palette.setCategory(this.childtype);
      this.palette.display(command);
    }
  }
}

class BibleSearchPalette extends CommandPaletteCategory<VerseRef, TouchGrassBibleApp> {
  name = "Bible Search";
  icon = Search; // Icon for the category, can be a string or an SVG element
  verses: VerseRef[] = [];
  bible = VerseRef.bible.KJV;
  childtype: string = CrossRefsPallet.name;

  onTrigger(context?: any): void {
    this.name = "Bible Search";
  }

  getCommands(query: string): VerseRef[] {
    const maxResults = this.palette.maxResults - this.palette.commandItems.length; // Limit the number of results to avoid performance issues
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

  renderCommand(verse: VerseRef, Item: CommandPaletteItem<VerseRef>): void {
    Item.setTitle(verse.toString().toTitleCase())
      .setDescription(VerseRef.bible.KJV[verse.book]?.[verse.chapter]?.[verse.verse] || "")
      .setSubsearch(true)
      .setHidden(false);
  }

  executeCommand(command: VerseRef): void {
    this.app.MainScreen.verse = command;
    this.palette.close();
  }
}

class topicListPallet extends CommandPaletteCategory<VerseRef | string, TouchGrassBibleApp> {
  topics: string[] | VerseRef[] = [];
  name = "Topics"; // Name of the category
  icon = Library; // Icon for the category, can be a string or an SVG element
  childtype: string = topicListPallet.name;

  onTrigger(context?: any): void {
    this.name = "Topics";
    if (typeof context === "string" && context.startsWith("topic:")) {
      const topic = context.slice(6); // Remove "topic:" prefix
      this.topics = VerseRef.topics[topic].map(OSIS => VerseRef.fromOSIS(OSIS[0] as string));
      this.name = `Topic: ${topic.toTitleCase()}`;
    } else {
      this.topics = Object.keys(VerseRef.topics).map(topic => `topic:${topic.toLowerCase()}`);
      this.name = "Topics";
    }
  }

  getCommands(query: string): (VerseRef | string)[] {
    if (typeof this.topics[0] === "string") {
      if (!query) return [];
      this.childtype = CrossRefsPallet.name;
      return this.getcompatible(query, this.topics as string[], topic => topic.slice(6));
    } else {
      this.childtype = topicListPallet.name;
      return this.getcompatible(
        query,
        this.topics as VerseRef[],
        verse => verse.toString(),
        verse => VerseRef.bible.KJV[verse.book]?.[verse.chapter]?.[verse.verse] || ""
      );
    }
  }

  renderCommand(command: VerseRef | string, Item: CommandPaletteItem<VerseRef | string>): void {
    if (typeof command === "string") {
      Item.setTitle(command.slice(6).toTitleCase()).setSubsearch(true);
    } else {
      Item.setTitle(command.toString().toTitleCase())
        .setDescription(VerseRef.bible.KJV[command.book]?.[command.chapter]?.[command.verse] || "")
        .setSubsearch(true);
    }
  }

  executeCommand(command: VerseRef | string): void {
    if (typeof command === "string") {
      this.palette.display(command);
    } else {
      this.app.MainScreen.verse = command;
      this.palette.close();
    }
  }
}

declare const processstart: number;
class TouchGrassBibleApp extends App {
  settings: RealBibleAppSettings;
  commandPalette: CommandPalette<TouchGrassBibleApp>;
  MainScreen: VerseScreen;

  constructor(doc: Document) {
    super(doc, "Touch Grass Bible");
  }

  async onload() {
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
    // make an input element for capturing keyboard shortcuts
    document.addEventListener("keydown", e => {
      if (e.key === "Enter" && !this.commandPalette.isOpen) {
        this.commandPalette.open();
      }
    });

    this.commandPalette = new CommandPalette(this);
    this.commandPalette.addPalette(verseListPallet);
    this.commandPalette.addPalette(CrossRefsPallet);
    this.commandPalette.addPalette(GoToVersePalette);
    this.commandPalette.addPalette(topicListPallet);
    this.commandPalette.addPalette(BibleSearchPalette);

    this.console.log(new Date().getTime() - processstart, "ms startup time");
  }

  onunload(): boolean {
    return true;
  }

  onHistoryPop(entry: AppHistory): void {
    if (entry.name === "Command Palette") {
      this.commandPalette.handleBack();
    }
  }

  async loadsettings(DEFAULT_SETTINGS: any) {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  saveSettings() {
    this.saveData(this.settings);
  }
}

const TGB = TouchGrassBibleApp;
const app = new TouchGrassBibleApp(document);
