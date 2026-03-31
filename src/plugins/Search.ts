import { CommandCategory, CommandItem, CommandPaletteState, UnifiedCommandPalette } from "src/external";
import Plugin from "../core/Plugin";
import { VerseRef, bibleData } from "../models/VerseRef";
import { BibleSearchCategoryID, GoToVerseCategoryID, TSKCrossRefCategoryID } from "./categoryIDs";
import { BibleMatch, parseGoToVerseQuery } from "./searchParser.ts";

export default class BibleSearchPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerPalette(() => new BibleSearchCategory(this.app.commandPalette, this), BibleSearchCategoryID);
    this.registerPalette(() => new GoToVerseCategory(this.app.commandPalette, this), GoToVerseCategoryID);
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
    void _state;
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
    void _command;
    this.commandPalette.close();
  }
}

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
    return parseGoToVerseQuery(query, VerseRef.booksOfTheBible, VerseRef.bible);
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
