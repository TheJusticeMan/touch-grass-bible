import { CommandCategory, CommandPaletteState, stateMapping, van } from "@touchgrass/framework";
import Plugin from "../core/Plugin";
import { VerseRef, bibleData } from "../models/VerseRef";
import { BibleSearchCategoryID, GoToVerseCategoryID, TSKCrossRefCategoryID } from "./categoryIDs";
import { BibleMatch, parseGoToVerseQuery } from "./searchParser.ts";

export default class BibleSearchPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerPalette(BibleSearchCategoryID, ({ state }) => new BibleSearchCategory(state, this));
    this.registerPalette(GoToVerseCategoryID, ({ state }) => new GoToVerseCategory(state, this));
  }
}

class BibleSearchCategory extends CommandCategory<VerseRef> {
  allItems = van.state<VerseRef[]>([]);
  criteria: Array<(item: VerseRef) => string> = [verse => verse.toString(), verse => verse.vTXT];
  bible: bibleData = {}; // Default to an empty object

  constructor(
    state: stateMapping<CommandPaletteState>,
    public plugin: BibleSearchPlugin,
  ) {
    super(state, "Search bible", "Search for verses in the Bible");
  }

  getItems(): VerseRef[] {
    this.bible = VerseRef.bible;
    const query = this.state.query.val.trim();
    if (!query) {
      this.allItems.val = [];
      return super.getItems();
    }

    const maxResults = this.state.maxItems.val;

    const results: VerseRef[] = [];
    const quarylcase = query.toLowerCase();

    for (const book in this.bible) {
      const chapters = this.bible[book];
      for (let chapter = 1; chapter < chapters.length; chapter++) {
        const verses = chapters[chapter];
        for (let verse = 1; verse < verses!.length; verse++) {
          if (verses![verse]!.toLowerCase().includes(quarylcase)) {
            results.push(new VerseRef(book, chapter, verse));
            if (results.length >= maxResults) {
              this.allItems.val = results;
              return super.getItems();
            }
          }
        }
      }
    }

    this.allItems.val = results;
    return super.getItems();
  }

  renderItem(verse: VerseRef) {
    const openCrossRef = this.context(() => {
      this.plugin.app.verseState.val = verse;
      return { topCategory: TSKCrossRefCategoryID };
    });

    return {
      title: verse.toString(),
      description: verse.vTXT,
      ...openCrossRef,
      click: openCrossRef.context,
    };
  }

  executeCommand(): void {
    return;
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
  allItems = van.state<BibleMatch[]>([]);
  criteria: Array<(item: BibleMatch) => string> = [
    cmd => `${cmd.book}${cmd.chapter ? ` ${cmd.chapter}` : ""}${cmd.verse ? `:${cmd.verse}` : ""}`,
  ];

  constructor(
    state: stateMapping<CommandPaletteState>,
    public plugin: BibleSearchPlugin,
  ) {
    super(state, "Go to verse", "Navigate to a specific verse in the Bible");
  }

  getItems(): BibleMatch[] {
    this.allItems.val = parseGoToVerseQuery(this.state.query.val, VerseRef.booksOfTheBible, VerseRef.bible);
    return super.getItems();
  }

  renderItem(command: BibleMatch) {
    const { book, chapter, verse } = command;
    const verseRef = new VerseRef(book, chapter ?? 1, verse ?? 1);
    const openCrossRef = this.context(() => {
      this.plugin.app.verseState.val = verseRef;
      return { topCategory: TSKCrossRefCategoryID };
    });

    return {
      title: book + (chapter ? ` ${chapter}` : "") + (verse ? `:${verse}` : ""),
      description: verseRef.vTXT,
      ...openCrossRef,
      click: openCrossRef.context,
    };
  }

  executeCommand(command: BibleMatch): void {
    const { book, chapter, verse } = command;
    const verseRef = new VerseRef(book, chapter ?? 1, verse ?? 1);
    this.plugin.app.verseState.val = verseRef;
    this.plugin.app.commandPalette.close();
  }
}
