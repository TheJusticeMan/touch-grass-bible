import {
  CommandCategory,
  CommandItem,
  CommandPaletteState,
  UnifiedCommandPalette,
} from "src/external/CommandPalette";
import { PaletteState } from "../external/PaletteStateController";
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
    this.specificity.set(Specificity.Book); // Set to book-level search when triggered
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

/**
 * Find a verse as we type, matching against the book name, chapter number, verse number
 *
 * Look at the first few characters of the query to an if there are few enough books that match
 *
 * WE are tying to get the best match for the user as they type, so we want to be flexible with the query and not require them to type the full book name or chapter number or verse number
 *
 * We can use the specificity state to determine how much of the verse reference we are trying to match against, and we can update the specificity state as the user types to narrow down the results
 *
 * First figure out what books match the first part of the query, then if there is less than 5 books that match, we can move on to matching the chapter number, then the verse number, and finally the full verse text
 * loop
 *
 *
 *
 */
type BibleMatch = {
  book: string;
  chapter?: number;
  verse?: number;
};

class GoToVerseCategory extends CommandCategory<BibleMatch> {
  readonly name = "Go to verse";
  readonly description = "Navigate to a specific verse in the Bible";

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: BibleSearchPlugin,
  ) {
    super(commandPalette);
  }
  onTrigger(): void {
    throw new Error("Method not implemented.");
  }
  getCommands(query: string): BibleMatch[] {
    const eat = (q: string, list: string[]) => {
      const lowerQ = q.toLowerCase().trim();

      // Pre-calculate matches to find the global maxMatchLen for this query
      const matches = list.map(item => {
        const lowerItem = item.toLowerCase();
        let matchLen = 0;
        while (
          matchLen < lowerQ.length &&
          matchLen < lowerItem.length &&
          lowerQ[matchLen] === lowerItem[matchLen]
        ) {
          matchLen++;
        }
        return { item, lowerItem, matchLen };
      });

      const maxMatchLen = Math.max(0, ...matches.map(m => m.matchLen));

      // Only return if we actually matched something substantial
      if (maxMatchLen === 0) return [];

      return matches
        .filter(m => m.matchLen === maxMatchLen)
        .map(m => ({
          item: m.item,
          remaining: lowerQ.slice(m.matchLen).trim(),
        }));
    };

    const bestBookMatches = eat(query, VerseRef.booksOfTheBible);

    // We only proceed with specific number parsing if we have a clear book match
    if (bestBookMatches.length === 1) {
      const { item: book, remaining } = bestBookMatches[0];

      // 1. Try to "eat" the Chapter
      // We need a list of strings representing possible chapters (1-150)
      const chapterList = Array.from({ length: VerseRef.bible[book].length - 1 }, (_, i) =>
        (i + 1).toString(),
      );
      console.log(`Trying to match chapter from: "${remaining}" against ${chapterList} chapters`);
      const chapterMatches = eat(remaining, chapterList);

      let chapter: number | undefined;

      if (chapterMatches.length === 1) {
        const { item: chItem, remaining: verseRemaining } = chapterMatches[0];
        chapter = parseInt(chItem, 10);

        // 2. Try to "eat" the Verse from what's left
        const verseList = Array.from({ length: VerseRef.bible[book][chapter].length - 1 }, (_, i) =>
          (i + 1).toString(),
        );
        const verseMatches = eat(verseRemaining, verseList);

        this.console.log(
          `Trying to match verse from: "${verseRemaining}" against ${verseList.length} verses in chapter ${chapter} of ${book}`,
        );

        if (!verseMatches.length) return verseList.map(v => ({ book, chapter, verse: parseInt(v, 10) }));

        return verseMatches.map(({ item }) => ({
          book,
          chapter,
          verse: parseInt(item, 10),
        }));
      }

      if (!chapterMatches.length) return chapterList.map(ch => ({ book, chapter: parseInt(ch, 10) }));

      return chapterMatches.map(({ item }) => ({
        book,
        chapter: parseInt(item, 10),
      }));
    } else {
      return bestBookMatches.map(m => ({
        book: m.item,
      }));
    }
  }
  renderCommand(
    command: BibleMatch,
    el: CommandItem<BibleMatch>,
  ): Partial<CommandPaletteState> | ((state: CommandPaletteState) => CommandPaletteState) {
    const { book, chapter, verse } = command;
    el.setTitle(book + (chapter ? ` ${chapter}` : "") + (verse ? `:${verse}` : ""));
    return { topCategory: TSKCrossRefCategoryID };
  }
  executeCommand(command: BibleMatch): void {
    const { book, chapter, verse } = command;
    const verseRef = new VerseRef(book, chapter ?? 1, verse ?? 1);
    this.plugin.app.verseState.set(verseRef);
    this.commandPalette.close();
  }
}
