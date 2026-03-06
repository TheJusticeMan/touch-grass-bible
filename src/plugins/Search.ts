import { CommandCategory, CommandItem, UnifiedCommandPalette } from "../main";
import Plugin from "../Plugin";
import { TGPaletteState } from "../TGPaletteCategories";
import { VerseRef, bibleData } from "../VerseRef";
import { TSKCrossRefCategoryID } from "./TSK";

export const BibleSearchCategoryID = "bible-search";
export const GoToVerseCategoryID = "go-to-verse";

export default class BibleSearchPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerPalette(() => new BibleSearchCategory(this.app.commandPalette, this), BibleSearchCategoryID);

    this.registerPalette(() => new GoToVerseCategory(this.app.commandPalette, this), GoToVerseCategoryID);
  }
}

export class BibleSearchCategory extends CommandCategory<VerseRef> {
  readonly name = "Search bible";
  readonly description = "Search for verses in the Bible";
  verses: VerseRef[] = [];
  bible: bibleData = {}; // Default to an empty object

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: Plugin,
  ) {
    super(commandPalette);
  }

  onTrigger(_state: TGPaletteState): void {
    this.bible = VerseRef.bible;
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

  renderCommand(verse: VerseRef, Item: CommandItem<VerseRef>): Partial<TGPaletteState> {
    Item.setTitle(verse.toString()).setDescription(verse.vTXT).addctx().setHidden(false);
    return { topCategory: "tsk-cross-ref", verse };
  }

  executeCommand(_command: VerseRef): void {
    this.commandPalette.close();
  }
}

export class GoToVerseCategory extends CommandCategory<VerseRef> {
  readonly name = "Go to verse";
  readonly description = "Navigate to a specific verse in the Bible";
  list: VerseRef[] = [];
  specificity: number = 0; // 0: Book, 1: Chapter, 2: Verse, 3: Full Verse

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: Plugin,
  ) {
    super(commandPalette);
  }

  onTrigger(state: TGPaletteState): void {
    if (state) {
      const { verse, specificity: specificity } = state;
      this.specificity = state.specificity;

      switch (specificity) {
        case 0: // Book
          this.list = VerseRef.booksOfTheBible.map(book => new VerseRef(book, 1, 1));
          break;
        case 1: // Book and Chapter
          this.title = `Go to verse: ${verse.book}`;
          this.commandPalette.inputMode = "numeric";
          this.list = verse.bTXT?.slice(1).map((_c, index) => new VerseRef(verse.book, index + 1, 1)) || [];
          break;
        case 2: // Book, Chapter, and Verse
          this.title = `Go to verse: ${verse.book}:${verse.chapter}`;
          this.list =
            verse.cTXT.slice(1).map((_v, index) => new VerseRef(verse.book, verse.chapter, index + 1)) || [];
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
          ref => ref.vTXT,
        );
      default:
        return [];
    }
  }

  renderCommand(verse: VerseRef, Item: CommandItem<VerseRef>): Partial<TGPaletteState> {
    switch (this.specificity) {
      case 0: // Book
        Item.setTitle(verse.book.toTitleCase()).addctx();
        return { topCategory: GoToVerseCategoryID, specificity: 1, verse };
      case 1: // Book and Chapter
        Item.setTitle(`${verse.book.toTitleCase()} ${verse.chapter}`).addctx();
        return { topCategory: GoToVerseCategoryID, specificity: 2, verse };
      case 2: // Book, Chapter, and Verse
        Item.setTitle(verse.toString()).setDescription(verse.vTXT);
        return { topCategory: TSKCrossRefCategoryID, specificity: 0, verse };
    }
    return { topCategory: TSKCrossRefCategoryID, specificity: 0, verse };
  }

  executeCommand(_ref: VerseRef): void {
    if (this.specificity > 0) this.commandPalette.close();
    else this.commandPalette.display();
  }
}
