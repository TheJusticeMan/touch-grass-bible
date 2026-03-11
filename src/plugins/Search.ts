import { PaletteState } from "../external/PaletteStateController";
import { CommandCategory, CommandItem, CommandPaletteState, UnifiedCommandPalette } from "../main";
import Plugin from "../Plugin";
import { VerseRef, bibleData } from "../VerseRef";
import { BibleSearchCategoryID, GoToVerseCategoryID, TSKCrossRefCategoryID } from "./categoryIDs";

export default class BibleSearchPlugin extends Plugin {
  specificity = this.app.commandPalette.useState(Specificity.Book); // Start with book-level search
  async onload(): Promise<void> {
    this.registerPalette(() => new BibleSearchCategory(this.app.commandPalette, this), BibleSearchCategoryID);
    this.registerPalette(() => new GoToVerseCategory(this.app.commandPalette, this), GoToVerseCategoryID);
  }
}

// Specificity levels for GoToVerseCategory:
// 0: Book level (e.g., "Genesis")
// 1: Chapter level (e.g., "Genesis 1")
// 2: Verse level (e.g., "Genesis 1:1")
// 3: Full verse text search (handled by BibleSearchCategory)

enum Specificity {
  Book = 0,
  Chapter = 1,
  Verse = 2,
  FullVerse = 3,
}

class BibleSearchCategory extends CommandCategory<VerseRef> {
  readonly name = "Search bible";
  readonly description = "Search for verses in the Bible";
  verses: VerseRef[] = [];
  bible: bibleData = {}; // Default to an empty object
  specificity: PaletteState<Specificity>;

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: BibleSearchPlugin,
  ) {
    super(commandPalette);
    this.specificity = this.plugin.specificity; // Use the specificity state from the plugin
  }

  onTrigger(_state: CommandPaletteState): void {
    this.bible = VerseRef.bible;
    this.specificity.set(Specificity.Book); // Set to full verse search when triggered
  }

  getCommands(query: string): VerseRef[] {
    const maxResults = this.commandPalette.state.maxResults - this.commandPalette.length; // Limit the number of results to avoid performance issues
    if (!query && this.commandPalette.state.topCategory !== GoToVerseCategoryID) return [];
    //testLevenshtein(this.bible, query);

    const results: VerseRef[] = [];
    const quarylcase = query.toLowerCase() || "search the scriptures";

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

  renderCommand(
    verse: VerseRef,
    Item: CommandItem<VerseRef>,
  ): (state: CommandPaletteState) => CommandPaletteState {
    Item.setTitle(verse.toString()).setDescription(verse.vTXT).addctx().setHidden(false);
    return state => {
      this.plugin.app.verseState.set(verse);
      return state.update({ topCategory: "tsk-cross-ref" });
    };
  }

  executeCommand(_command: VerseRef): void {
    this.commandPalette.close();
  }
}

class GoToVerseCategory extends CommandCategory<VerseRef> {
  readonly name = "Go to verse";
  readonly description = "Navigate to a specific verse in the Bible";
  list: VerseRef[] = [];
  specificity: PaletteState<Specificity>;

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: BibleSearchPlugin,
  ) {
    super(commandPalette);
    this.specificity = this.plugin.specificity; // Use the specificity state from the plugin
  }

  onTrigger(state: CommandPaletteState): void {
    if (this.commandPalette.state.topCategory !== GoToVerseCategoryID) this.specificity.set(Specificity.Book); // Reset to book-level if coming from a different category
    if (state) {
      const verse = this.plugin.app.verseState.get();

      switch (this.specificity.get()) {
        case Specificity.Book: // Book
          this.list = VerseRef.booksOfTheBible.map(book => new VerseRef(book, 1, 1));
          break;
        case Specificity.Chapter: // Book and Chapter
          this.title = `Go to verse: ${verse.book}`;
          this.commandPalette.inputMode = "numeric";
          this.list = verse.bTXT?.slice(1).map((_c, index) => new VerseRef(verse.book, index + 1, 1)) || [];
          break;
        case Specificity.Verse: // Book, Chapter, and Verse
          this.title = `Go to verse: ${verse.book}:${verse.chapter}`;
          this.list =
            verse.cTXT.slice(1).map((_v, index) => new VerseRef(verse.book, verse.chapter, index + 1)) || [];
          break;
      }
    } else {
      this.specificity.set(Specificity.Book);
      this.list = VerseRef.booksOfTheBible.map(book => new VerseRef(book, 1, 1));
    }
  }

  getCommands(query: string): VerseRef[] {
    switch (this.specificity.get()) {
      case Specificity.Book: // Book
        return this.getcompatible(query, this.list, ref => ref.book);
      case Specificity.Chapter: // Book and Chapter
        return this.getcompatible(query, this.list, ref => ref.chapter.toString());
      case Specificity.Verse: // Book, Chapter, and Verse
        return this.getcompatible(
          query,
          this.list,
          ref => ref.verse.toString(),
          ref => ref.vTXT,
        );
      default:
        return [];
    }
  }

  renderCommand(
    verse: VerseRef,
    Item: CommandItem<VerseRef>,
  ): (state: CommandPaletteState) => CommandPaletteState {
    switch (this.specificity.get()) {
      case Specificity.Book: // Book
        Item.setTitle(verse.book.toTitleCase()).addctx();
        return state => {
          this.specificity.set(Specificity.Chapter);
          this.plugin.app.verseState.set(verse);
          return state.update({ topCategory: GoToVerseCategoryID });
        };
      case Specificity.Chapter: // Book and Chapter
        Item.setTitle(`${verse.book.toTitleCase()} ${verse.chapter}`).addctx();
        return state => {
          this.specificity.set(Specificity.Verse);
          this.plugin.app.verseState.set(verse);
          return state.update({ topCategory: GoToVerseCategoryID });
        };
      case Specificity.Verse: // Book, Chapter, and Verse
        Item.setTitle(verse.toString()).setDescription(verse.vTXT);
        return state => {
          this.specificity.set(Specificity.Book); // Reset to book-level for the next time
          this.plugin.app.verseState.set(verse);
          return state.update({ topCategory: TSKCrossRefCategoryID });
        };
    }
    return state => {
      this.specificity.set(Specificity.Book); // Reset to book-level for the next time
      this.plugin.app.verseState.set(verse);
      return state.update({ topCategory: TSKCrossRefCategoryID });
    };
  }

  executeCommand(_ref: VerseRef): void {
    if (this.specificity.get() > 0) this.commandPalette.close();
    else this.commandPalette.display();
  }
}
