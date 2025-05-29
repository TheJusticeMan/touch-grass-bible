import { BookCopy, Library, List, Search } from "lucide";
import {
  App,
  AppHistory,
  CommandPalette,
  CommandPaletteCategory,
  CommandPaletteItem,
  ScreenView,
} from "./external/App";
import { DEFAULT_SETTINGS, TGAppSettings } from "./TGAppSettings";
import "./style.css";
import { VerseHighlight, VerseRef } from "./VerseRef";
import info from "./info.json";
import { CommandPaletteState } from "./external/CommandPalette";

class VerseScreen extends ScreenView<TouchGrassBibleApp> {
  // Use private fields with '#' for encapsulation (ES2022 feature)
  _verse: VerseRef;

  constructor(element: HTMLElement, protected app: TouchGrassBibleApp) {
    super(element, app);
    this.ontitleclick(e => {
      e.stopPropagation();
      this.app.commandPalette.open(
        this.app.newstate({ verses: this.app.settings.workspaces.currentVerses })
      );
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
            this.app.commandPalette.open(
              this.app.newstate({
                topCategory: this.app.getPaletteByName(CrossRefsPalette.name),
                verse: newVerse,
              })
            );
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
  verse?: VerseRef = new VerseRef("GENESIS", 1, 1);
  verses?: VerseRef[] = [];
  part?: VerseRefPart = new VerseRefPart(0, this.verse || new VerseRef("GENESIS", 1, 1));
  topic?: string = "";
  constructor(
    public app: TouchGrassBibleApp,
    public query: string,
    topCategory: CommandPaletteCategory<any, TouchGrassBibleApp> | string | null = null,
    part: VerseRefPart | VerseRef | VerseRef[] | string
  ) {
    super(app, query, topCategory instanceof CommandPaletteCategory ? topCategory : null);
    if (typeof topCategory === "string") {
      this.topCategory = this.app?.getPaletteByName(topCategory) || null;
    } else {
      this.topCategory = topCategory;
    }
    if (part instanceof VerseRefPart) {
      this.part = part;
      this.verse = part.verse;
    } else if (part instanceof VerseRef) {
      this.verse = part;
      this.part = new VerseRefPart(0, part);
    } else if (typeof part === "string") {
      this.topic = part.toLowerCase(); // Assuming part is a topic string like "topic:example"
    } else {
      this.verses = part;
      this.verse = part[0];
    }
  }
  update(partial: Partial<TGPaletteState>): TGPaletteState {
    return { ...this, ...partial };
  }
}

class verseListPalette extends CommandPaletteCategory<VerseRef, TouchGrassBibleApp> {
  verses: VerseRef[] = [];
  name = "Verse List"; // Name of the category
  icon = List; // Icon for the category, can be a string or an SVG element

  onTrigger(context: TGPaletteState): void {
    this.title = "Verse List";
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
  ): TGPaletteState {
    Item.setTitle(verse.toString().toTitleCase())
      .setDescription(verse.verseData("KJV"))
      .setSubsearch(true);
    return new TGPaletteState(this.app, "", CrossRefsPalette.name, verse);
  }

  executeCommand(command: VerseRef): void {
    this.app.MainScreen.verse = command;
    this.app.commandPalette.close();
  }
}

class CrossRefsPalette extends verseListPalette {
  readonly name = "Cross References";
  icon = Library; // Icon for the category, can be a string or an SVG element

  onTrigger(context: TGPaletteState): void {
    this.title = "Cross References";
    if (context.verse) {
      this.verses = context.verse.crossRefs();
      this.title = `Cross References for ${context.verse.toString().toTitleCase()}`;
    } else if (context.part) {
      this.verses = context.part.verse.crossRefs();
      this.title = `Cross References for ${context.part.verse.toString().toTitleCase()}`;
    } else if (context.topic) {
      this.verses = VerseRef.topics[context.topic].map(OSIS =>
        VerseRef.fromOSIS(OSIS[0] as string)
      );
      this.title = `Topic: ${context.topic.toTitleCase()}`;
    } else {
      this.verses = [];
    }
  }
}

class VerseRefPart {
  constructor(public specifity: number, public verse: VerseRef) {}
}

class GoToVersePalette extends CommandPaletteCategory<VerseRefPart, TouchGrassBibleApp> {
  readonly name = "Go To Verse";
  icon = BookCopy; // Icon for the category, can be a string or an SVG element
  list: VerseRefPart[] = [];
  part: VerseRefPart = new VerseRefPart(0, new VerseRef("GENESIS", 1, 1));

  onTrigger(context: TGPaletteState): void {
    this.title = "Go To Verse";
    if (context.part) {
      this.part = context.part;
      const { verse, specifity } = context.part;

      switch (specifity) {
        case 0: // Book
          this.title = "Go To Verse";
          this.list = VerseRef.booksOfTheBible.map(
            book => new VerseRefPart(1, new VerseRef(book, 1, 1))
          );
          break;
        case 1: // Book and Chapter
          this.title = `Go To Verse: ${verse.book}`;
          this.app.commandPalette.inputMode = "numeric";
          this.list =
            verse
              .bookData("KJV")
              ?.slice(1)
              .map(
                (chapter, index) => new VerseRefPart(2, new VerseRef(verse.book, index + 1, 1))
              ) || [];
          break;
        case 2: // Book, Chapter, and Verse
          this.title = `Go To Verse: ${verse.book}:${verse.chapter}`;
          this.list =
            verse
              .chapterData("KJV")
              .slice(1)
              .map((text, index) => {
                return new VerseRefPart(3, new VerseRef(verse.book, verse.chapter, index + 1));
              }) || [];
          break;
        case 3: // Full Verse
          this.app.MainScreen.verse = verse;
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
        return this.getcompatible(query, this.list, part => part.verse.book);
      case 1: // Book and Chapter
        return this.getcompatible(query, this.list, part => part.verse.chapter.toString());
      case 2: // Book, Chapter, and Verse
        return this.getcompatible(
          query,
          this.list,
          part => part.verse.verse.toString(),
          part => part.verse.verseData("KJV")
        );
      default:
        return [];
    }
  }

  renderCommand(
    command: VerseRefPart,
    Item: CommandPaletteItem<VerseRefPart, TouchGrassBibleApp>
  ): TGPaletteState {
    switch (this.part.specifity) {
      case 0: // Book
        Item.setTitle(command.verse.book.toString().toTitleCase()).setSubsearch(true);
        return new TGPaletteState(this.app, "", GoToVersePalette.name, command);
      case 1: // Book and Chapter
        Item.setTitle(
          `${command.verse.book.toString().toTitleCase()} ${command.verse.chapter}`
        ).setSubsearch(true);
        return new TGPaletteState(this.app, "", GoToVersePalette.name, command);
      case 2: // Book, Chapter, and Verse
        Item.setTitle(command.verse.toString().toTitleCase()).setDescription(
          command.verse.verseData("KJV")
        );
        return new TGPaletteState(this.app, "", GoToVersePalette.name, command);
    }
    return new TGPaletteState(this.app, "", CrossRefsPalette.name, command.verse);
  }

  executeCommand(command: VerseRefPart): void {
    if (command.specifity === 3) {
      this.app.MainScreen.verse = command.verse;
      this.app.commandPalette.close();
    } else {
      this.app.commandPalette.display();
    }
  }
}

class BibleSearchPalette extends CommandPaletteCategory<VerseRef, TouchGrassBibleApp> {
  readonly name = "Bible Search";
  icon = Search; // Icon for the category, can be a string or an SVG element
  verses: VerseRef[] = [];
  bible = VerseRef.bible.KJV;

  onTrigger(context: TGPaletteState): void {
    this.title = "Bible Search";
  }

  getCommands(query: string): VerseRef[] {
    const maxResults =
      this.app.commandPalette.state.maxResults - this.app.commandPalette.commandItems.length; // Limit the number of results to avoid performance issues
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
  ): TGPaletteState {
    Item.setTitle(verse.toString().toTitleCase())
      .setDescription(verse.verseData("KJV"))
      .setSubsearch(true)
      .setHidden(false);
    return new TGPaletteState(this.app, "", null, verse);
  }

  executeCommand(command: VerseRef): void {
    this.app.MainScreen.verse = command;
    this.app.commandPalette.close();
  }
}

class topicListPalette extends CommandPaletteCategory<VerseRef | string, TouchGrassBibleApp> {
  topics: string[] | VerseRef[] = [];
  readonly name = "Topics"; // Name of the category
  icon = Library; // Icon for the category, can be a string or an SVG element

  onTrigger(context: TGPaletteState): void {
    this.title = "Topics";
    if (context.topic) {
      const { topic } = context; // Get the topic from the context
      this.topics = VerseRef.topics[topic].map(OSIS => VerseRef.fromOSIS(OSIS[0] as string));
      this.title = `Topic: ${topic.toTitleCase()}`;
    } else {
      this.topics = Object.keys(VerseRef.topics);
      this.title = "Topics";
    }
  }

  getCommands(query: string): (VerseRef | string)[] {
    if (typeof this.topics[0] === "string") {
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
  ): TGPaletteState {
    if (typeof command === "string") {
      Item.setTitle(command.toTitleCase()).setSubsearch(true);
      return new TGPaletteState(this.app, "", topicListPalette.name, command);
    } else {
      Item.setTitle(command.toString().toTitleCase())
        .setDescription(command.verseData("KJV"))
        .setSubsearch(true);
      return new TGPaletteState(this.app, "", CrossRefsPalette.name, command);
    }
  }

  executeCommand(command: VerseRef | string): void {
    if (typeof command === "string") {
      this.app.commandPalette.state.topic = command;
      this.app.commandPalette.display();
    } else {
      this.app.MainScreen.verse = command;
      this.app.commandPalette.close();
    }
  }
}

class TGCommandPalette extends CommandPalette<TouchGrassBibleApp> {
  state: TGPaletteState = new TGPaletteState(app, "", null, new VerseRef("GENESIS", 1, 1));
}

declare const processstart: number;
class TouchGrassBibleApp extends App {
  settings: TGAppSettings;
  commandPalette: TGCommandPalette;
  MainScreen: VerseScreen;

  constructor(doc: Document) {
    super(doc, "Touch Grass Bible");
  }

  async onload() {
    this.commandPalette = new TGCommandPalette(this);
    this.commandPalette.addPalette(verseListPalette);
    this.commandPalette.addPalette(CrossRefsPalette);
    this.commandPalette.addPalette(GoToVersePalette);
    this.commandPalette.addPalette(topicListPalette);
    this.commandPalette.addPalette(BibleSearchPalette);
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

    this.console.log(new Date().getTime() - processstart, "ms startup time");
  }

  newstate(partial: Partial<TGPaletteState>): TGPaletteState {
    return this.commandPalette.state.update(partial);
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
