import { match } from "assert";
import { CommandPaletteState, CommandCategory, CommandItem, UnifiedCommandPalette } from "./external/App";
import TouchGrassBibleApp from "./main";
import { VerseRef, bibleData, translation, translationMetadata } from "./VerseRef";

export class TGPaletteState extends CommandPaletteState<TouchGrassBibleApp> {
  verse: VerseRef = new VerseRef("GENESIS", 1, 1);
  specificity: number = 0; // 0: Book, 1: Chapter, 2: Verse, 3: Full Verse
  topic: string = "";
  tag: string = "Start Up Verses";
  constructor(
    public app: TouchGrassBibleApp,
    pallete: UnifiedCommandPalette<TouchGrassBibleApp>,
    public query: string
  ) {
    super(app, pallete, query, null);
  }
  update(partial: Partial<TGPaletteState> = {}): TGPaletteState {
    this.emit("update", partial);
    return Object.assign(Object.create(this), this, partial).makeValid();
  }
  makeValid(): TGPaletteState {
    // Ensure the state is valid by setting a default verse if none exists
    if (!this.verse) this.verse = new VerseRef("GENESIS", 1, 1);
    if (!this.query) this.query = "";
    if (!this.tag) this.tag = "Start Up Verses";
    if (!this.topic) this.topic = "";
    return this;
  }
}

export class VerseListCategory extends CommandCategory<VerseRef, TouchGrassBibleApp> {
  verses: VerseRef[] = [];
  name = "Open"; // Name of the category

  onTrigger(context: TGPaletteState): void {
    this.title = `Bookmark tag: ${context.tag}`;
    this.verses = VerseRef.Bookmarks.get(context.tag);
  }

  getCommands(query: string): VerseRef[] {
    // Filter verses based on the query
    return this.getcompatible(
      query,
      this.verses,
      verse => verse.toString(),
      verse => verse.vTXT
    );
  }

  renderCommand(verse: VerseRef, Item: CommandItem<VerseRef, TouchGrassBibleApp>): Partial<TGPaletteState> {
    Item.setTitle(verse.toString().toTitleCase()).setDescription(verse.vTXT).setContextMenuVisibility(true);
    return { topCategory: CrossRefCategory, verse, specificity: 0 };
  }

  executeCommand(command: VerseRef): void {
    this.app.commandPalette.close();
  }
}

export class CrossRefCategory extends VerseListCategory {
  readonly name = "Cross references (TSK+)";

  onTrigger(context: TGPaletteState): void {
    const { verse } = context;
    if (verse)
      (this.verses = verse.crossRefs()),
        (this.title = `Cross references for ${verse.toString().toTitleCase()}`);
    else this.verses = [];
  }
}

export class GoToVerseCategory extends CommandCategory<VerseRef, TouchGrassBibleApp> {
  readonly name = "Go to verse";
  list: VerseRef[] = [];
  specificity: number = 0; // 0: Book, 1: Chapter, 2: Verse, 3: Full Verse

  onTrigger(context: TGPaletteState): void {
    if (context) {
      const { verse, specificity: specificity } = context;
      this.specificity = context.specificity;

      switch (specificity) {
        case 0: // Book
          this.list = VerseRef.booksOfTheBible.map(book => new VerseRef(book, 1, 1));
          break;
        case 1: // Book and Chapter
          this.title = `Go to verse: ${verse.book}`;
          this.app.commandPalette.inputMode = "numeric";
          this.list = verse.bTXT?.slice(1).map((c, index) => new VerseRef(verse.book, index + 1, 1)) || [];
          break;
        case 2: // Book, Chapter, and Verse
          this.title = `Go to verse: ${verse.book}:${verse.chapter}`;
          this.list =
            verse.cTXT.slice(1).map((v, index) => new VerseRef(verse.book, verse.chapter, index + 1)) || [];
          break;
      }
    } else {
      this.specificity = 0;
      this.list = VerseRef.booksOfTheBible.map(book => new VerseRef(book, 1, 1));
    }
  }

  getCommands(query: string): VerseRef[] {
    switch (this.specificity) {
      case 0: // Book
        return this.getcompatible(query, this.list, ref => ref.book);
      case 1: // Book and Chapter
        return this.getcompatible(query, this.list, ref => ref.chapter.toString());
      case 2: // Book, Chapter, and Verse
        return this.getcompatible(
          query,
          this.list,
          ref => ref.verse.toString(),
          ref => ref.vTXT
        );
      default:
        return [];
    }
  }

  renderCommand(verse: VerseRef, Item: CommandItem<VerseRef, TouchGrassBibleApp>): Partial<TGPaletteState> {
    switch (this.specificity) {
      case 0: // Book
        Item.setTitle(verse.book.toString().toTitleCase()).setContextMenuVisibility(true);
        return { topCategory: GoToVerseCategory, specificity: 1, verse };
      case 1: // Book and Chapter
        Item.setTitle(`${verse.book.toString().toTitleCase()} ${verse.chapter}`).setContextMenuVisibility(
          true
        );
        return { topCategory: GoToVerseCategory, specificity: 2, verse };
      case 2: // Book, Chapter, and Verse
        Item.setTitle(verse.toString().toTitleCase()).setDescription(verse.vTXT);
        return { topCategory: CrossRefCategory, specificity: 0, verse };
    }
    return { topCategory: CrossRefCategory, specificity: 0, verse };
  }

  executeCommand(ref: VerseRef): void {
    if (this.specificity > 0) this.app.commandPalette.close();
    else this.app.commandPalette.display();
  }
}

export class BibleSearchCategory extends CommandCategory<VerseRef, TouchGrassBibleApp> {
  readonly name = "Search bible";
  verses: VerseRef[] = [];
  bible: bibleData = {}; // Default to an empty object
  //SiblingCategories = [GoToVerseCategory, CrossRefCategory, topicListCategory, BookmarkCategory];

  onTrigger(context: TGPaletteState): void {
    this.bible = VerseRef.bible;
  }

  getCommands(query: string): VerseRef[] {
    const maxResults = this.app.commandPalette.state.maxResults - this.app.commandPalette.length; // Limit the number of results to avoid performance issues
    if (!query) return [];

    const results: VerseRef[] = [];
    const quarylcase = query.toLowerCase();

    for (const book in this.bible) {
      const chapters = this.bible[book];
      for (let chapter = 1; chapter < chapters.length; chapter++) {
        const verses = chapters[chapter];
        for (let verse = 1; verse < verses.length; verse++) {
          if (verses[verse].toLowerCase().includes(quarylcase)) {
            results.push(new VerseRef(book, chapter, verse));
            if (results.length > maxResults) return results;
          }
        }
      }
    }
    return results;
  }

  renderCommand(verse: VerseRef, Item: CommandItem<VerseRef, TouchGrassBibleApp>): Partial<TGPaletteState> {
    Item.setTitle(verse.toString().toTitleCase())
      .setDescription(verse.vTXT)
      .setContextMenuVisibility(true)
      .setHidden(false);
    return { topCategory: CrossRefCategory, verse };
  }

  executeCommand(command: VerseRef): void {
    this.app.commandPalette.close();
  }
}

export class topicListCategory extends CommandCategory<VerseRef | string, TouchGrassBibleApp> {
  list: string[] | VerseRef[] = [];
  name = "Topics (www.openbible.info)"; // Name of the category

  onTrigger(context: TGPaletteState): void {
    if (context.topic) {
      const { topic } = context; // Get the topic from the context
      this.list = VerseRef.topics.get(topic);
      this.title = `Topic: ${topic.toTitleCase()}`;
    } else {
      this.list = VerseRef.topics.keys;
    }
  }

  getCommands(query: string): (VerseRef | string)[] {
    if (this.list.length > 0 && typeof this.list[0] === "string") {
      if (!query) return [];
      return this.getcompatible(query, this.list as string[], topic => topic);
    } else {
      return this.getcompatible(
        query,
        this.list as VerseRef[],
        verse => verse.toString(),
        verse => verse.vTXT
      );
    }
  }

  renderCommand(
    command: VerseRef | string,
    Item: CommandItem<VerseRef | string, TouchGrassBibleApp>
  ): Partial<TGPaletteState> {
    if (typeof command === "string") {
      Item.setTitle(command.toTitleCase()).setContextMenuVisibility(true);
      return { topCategory: topicListCategory, topic: command };
    } else {
      Item.setTitle(command.toString().toTitleCase())
        .setDescription(command.vTXT)
        .setContextMenuVisibility(true);
      return { topCategory: CrossRefCategory, verse: command };
    }
  }

  executeCommand(command: VerseRef | string): void {
    if (typeof command === "string") this.app.commandPalette.display();
    else this.app.commandPalette.close();
  }
}

export class BookmarkCategory extends CommandCategory<string, TouchGrassBibleApp> {
  tags: string[] = [];
  name = "Bookmarks"; // Name of the category

  onTrigger(context: TGPaletteState): void {
    this.tags = VerseRef.Bookmarks.keys;
  }

  getCommands(query: string): string[] {
    return this.getcompatible(query, this.tags, topic => topic);
  }

  renderCommand(command: string, Item: CommandItem<string, TouchGrassBibleApp>): Partial<TGPaletteState> {
    Item.setTitle(this.getDateFromString(command)).setContextMenuVisibility(true);
    return { topCategory: VerseListCategory, tag: command.toTitleCase() };
  }

  getDateFromString(str: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return str.toTitleCase();

    const inputDate = new Date(str);
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    if (str === todayStr) return "Today";
    if (str === yesterdayStr) return "Yesterday";
    // in the last 7 days
    if (inputDate.getTime() >= Date.now() - 6 * 86400000)
      return inputDate.toLocaleDateString("en-US", { weekday: "long", day: "numeric" });
    return inputDate.toDateString();
  }

  executeCommand(command: VerseRef | string): void {
    this.app.commandPalette.display();
  }
}

export class translationCategory extends CommandCategory<string, TouchGrassBibleApp> {
  readonly name = "Translations";
  translations: string[];

  onTrigger(state: CommandPaletteState<TouchGrassBibleApp>): void {
    this.translations = Object.keys(VerseRef.bibleTranslations);
  }

  getCommands(query: string): string[] {
    return this.getcompatible(query, this.translations, str => translationMetadata[str]?.name || str);
  }

  renderCommand(command: string, Item: CommandItem<string, TouchGrassBibleApp>): Partial<TGPaletteState> {
    Item.setTitle(translationMetadata[command]?.name || command).setContextMenuVisibility(true);
    return { topCategory: null, defaultTranslation: command as translation };
  }

  executeCommand(command: string): void {
    VerseRef.defaultTranslation = command as translation;
    this.app.commandPalette.close();
  }
}

export class myNotesCategory extends CommandCategory<VerseRef, TouchGrassBibleApp> {
  readonly name = "My Notes";
  notes: VerseRef[] = [];

  onTrigger(context: TGPaletteState): void {
    this.notes = Array.from(VerseRef.myNotes.keys())
      .map(osis => VerseRef.fromOSIS(osis))
      .sort((a, b) => a.toString().localeCompare(b.toString()));
    this.title = "My Notes";
  }

  getCommands(query: string): VerseRef[] {
    return this.getcompatible(query, this.notes, verse => verse.note);
  }

  renderCommand(verse: VerseRef, Item: CommandItem<VerseRef, TouchGrassBibleApp>): Partial<TGPaletteState> {
    Item.setTitle(verse.toString().toTitleCase())
      .setDescription(verse.note || "No note")
      .setContextMenuVisibility(true);
    return { topCategory: CrossRefCategory, verse };
  }

  executeCommand(command: VerseRef): void {
    this.app.commandPalette.close();
  }
}

export class TGCommandPalette extends UnifiedCommandPalette<TouchGrassBibleApp> {
  state: TGPaletteState;
}
