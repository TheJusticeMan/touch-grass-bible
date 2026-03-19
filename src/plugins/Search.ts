import {
  CommandCategory,
  CommandItem,
  CommandPaletteState,
  UnifiedCommandPalette,
} from "src/external/CommandPalette";
import Plugin from "../core/Plugin";
import { VerseRef, bibleData } from "../models/VerseRef";
import { BibleSearchCategoryID, GoToVerseCategoryID, TSKCrossRefCategoryID } from "./categoryIDs";

export default class BibleSearchPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerPalette(() => new BibleSearchCategory(this.palette.instance, this), BibleSearchCategoryID);
    this.registerPalette(() => new GoToVerseCategory(this.palette.instance, this), GoToVerseCategoryID);
  }
}

class BibleSearchCategory extends CommandCategory<VerseRef> {
  readonly name = "Search bible";
  readonly description = "Search for verses in the Bible";
  verses: VerseRef[] = [];
  bible: bibleData = {}; // Default to an empty object

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: BibleSearchPlugin,
  ) {
    super(commandPalette);
  }

  onTrigger(_state: CommandPaletteState): void {
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

  renderCommand(
    verse: VerseRef,
    Item: CommandItem<VerseRef>,
  ): (state: CommandPaletteState) => CommandPaletteState {
    Item.setTitle(verse.toString()).setDescription(verse.vTXT).addctx().setHidden(false);
    return state => {
      this.plugin.app.verseState.set(verse);
      return state.update({ topCategory: TSKCrossRefCategoryID });
    };
  }

  executeCommand(_command: VerseRef): void {
    this.commandPalette.close();
  }
}

type BibleMatch = {
  book: string;
  chapter?: number;
  verse?: number;
};

/**
 * Command category that allows users to navigate to specific Bible verses through a command palette.
 *
 * Provides intelligent parsing of user input to match Bible books, chapters, and verses progressively.
 * Uses a greedy matching algorithm that finds the longest prefix match at each stage (book → chapter → verse).
 *
 * @template BibleMatch - The type representing a partial or complete Bible verse reference with optional book, chapter, and verse properties.
 *
 * @example
 * ```typescript
 * const category = new GoToVerseCategory(commandPalette, plugin);
 * // User types "john 3" → suggests John 3:1-51
 * // User types "john 3:1" → selects John 3:1
 * ```
 */
class GoToVerseCategory extends CommandCategory<BibleMatch> {
  readonly name = "Go to verse";
  readonly description = "Navigate to a specific verse in the Bible";

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: BibleSearchPlugin,
  ) {
    super(commandPalette);
  }
  onTrigger(): void {}
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
