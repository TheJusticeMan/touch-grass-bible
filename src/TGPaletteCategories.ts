import { BibleTopics } from "./BibleTopics";
import { CommandCategory, CommandItem, CommandPaletteState, UnifiedCommandPalette } from "./external/App";
import info from "./info.json";
import TouchGrassBibleApp from "./main";
import { DEFAULT_SETTINGS } from "./TGAppSettings";
import { VerseRef, bibleData, translation, translationMetadata } from "./VerseRef";

export class TGPaletteState extends CommandPaletteState {
  verse: VerseRef = new VerseRef("GENESIS", 1, 1);
  specificity: number = 0; // 0: Book, 1: Chapter, 2: Verse, 3: Full Verse
  topic: string = "";
  tag: string = "Start Up Verses";
  defaultTranslation: translation = "KJV"; // Default translation for Bible references
  constructor(pallete: UnifiedCommandPalette<TouchGrassBibleApp>, public query: string) {
    super(pallete, query, null);
  }
  update(partial: Partial<TGPaletteState> = {}): this {
    return Object.assign(Object.create(this), this, partial).makeValid();
  }
  makeValid(): TGPaletteState {
    if (!this.verse) this.verse = new VerseRef("GENESIS", 1, 1);
    if (!this.query) this.query = "";
    if (!this.tag) this.tag = "Start Up Verses";
    if (!this.topic) this.topic = "";
    return this;
  }
}

export class VerseListCategory extends CommandCategory<VerseRef, TouchGrassBibleApp> {
  readonly description = "List of opened verses";

  verses: VerseRef[] = [];
  name = "Open";

  onTrigger(context: TGPaletteState): void {
    this.title = `Bookmark tag: ${this.convertTopicDate(context.tag)}`;
    this.verses = VerseRef.Bookmarks.get(context.tag);
  }

  getCommands(query: string): VerseRef[] {
    return this.getcompatible(
      query,
      this.verses,
      verse => verse.toString(),
      verse => verse.vTXT
    ).reverse();
  }

  renderCommand(verse: VerseRef, Item: CommandItem<VerseRef>): Partial<TGPaletteState> {
    Item.setTitle(verse.toString()).setDescription(verse.vTXT).addctx();
    /* .addIconButton(btn => {
        btn
          .setIcon(Cross)
          .setTooltip("Delete verse from tag")
          .on("click", () => {
            VerseRef.Bookmarks.remove(this.title, verse);
            this.commandPalette.display();
            this.app.saveSettings();
          });
      }); */

    return { topCategory: CrossRefCategory, verse, specificity: 0 };
  }

  convertTopicDate(str: string): string {
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

  executeCommand(command: VerseRef): void {
    this.commandPalette.close();
  }
}

export class CrossRefCategory extends VerseListCategory {
  readonly name = "Cross references (TSK+)";

  onTrigger(context: TGPaletteState): void {
    const { verse } = context;
    if (verse) (this.verses = verse.crossRefs()), (this.title = `Cross references for ${verse.toString()}`);
    else this.verses = [];
  }
}

export class GoToVerseCategory extends CommandCategory<VerseRef, TouchGrassBibleApp> {
  readonly name = "Go to verse";
  readonly description = "Navigate to a specific verse in the Bible";
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
          this.commandPalette.inputMode = "numeric";
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

  renderCommand(verse: VerseRef, Item: CommandItem<VerseRef>): Partial<TGPaletteState> {
    switch (this.specificity) {
      case 0: // Book
        Item.setTitle(verse.book.toTitleCase()).addctx();
        return { topCategory: GoToVerseCategory, specificity: 1, verse };
      case 1: // Book and Chapter
        Item.setTitle(`${verse.book.toTitleCase()} ${verse.chapter}`).addctx();
        return { topCategory: GoToVerseCategory, specificity: 2, verse };
      case 2: // Book, Chapter, and Verse
        Item.setTitle(verse.toString()).setDescription(verse.vTXT);
        return { topCategory: CrossRefCategory, specificity: 0, verse };
    }
    return { topCategory: CrossRefCategory, specificity: 0, verse };
  }

  executeCommand(ref: VerseRef): void {
    if (this.specificity > 0) this.commandPalette.close();
    else this.commandPalette.display();
  }
}

export class BibleSearchCategory extends CommandCategory<VerseRef, TouchGrassBibleApp> {
  readonly name = "Search bible";
  readonly description = "Search for verses in the Bible";
  verses: VerseRef[] = [];
  bible: bibleData = {}; // Default to an empty object

  onTrigger(context: TGPaletteState): void {
    this.bible = VerseRef.bible;
  }

  getCommands(query: string): VerseRef[] {
    const maxResults = this.commandPalette.state.maxResults - this.commandPalette.length; // Limit the number of results to avoid performance issues
    if (!query) return [];
    testLevenshtein(this.bible, query);

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

  renderCommand(verse: VerseRef, Item: CommandItem<VerseRef>): Partial<TGPaletteState> {
    Item.setTitle(verse.toString()).setDescription(verse.vTXT).addctx().setHidden(false);
    return { topCategory: CrossRefCategory, verse };
  }

  executeCommand(command: VerseRef): void {
    this.commandPalette.close();
  }
}

function testLevenshtein(bible: bibleData, quary: string) {
  const startTime = performance.now();
  const lowerQuery = quary.toLowerCase();
  const results: VerseRef[] = [];
  const distances: number[] = [];
  let length = 0;
  function getDude(lowerQuery: string, maxLength: number) {
    const dude: string[] = [];
    for (let i = 0; i < lowerQuery.length; i++) {
      for (let j = 0; j < i; j++) {
        dude.push(lowerQuery.slice(j, 1 + j + (lowerQuery.length - i)));
        if (dude.length >= maxLength) return new RegExp(dude.join("|"), "ig");
      }
    }
    length = dude.length;
    return new RegExp(dude.join("|"), "ig");
  }
  // it will be a lot of matches, so we limit the regex to 100000 characters that's not quite the calculation, but it works for now
  const dudeRegex = getDude(lowerQuery, 100000 / lowerQuery.length);
  for (const book in bible) {
    const chapters = bible[book];
    for (let chapter = 1; chapter < chapters.length; chapter++) {
      const verses = chapters[chapter];
      for (let verse = 1; verse < verses.length; verse++) {
        const text = verses[verse];
        let s = dudeRegex.exec(text);
        if (!s) continue;
        const length = s[0].length;
        if (length < 2) continue; // Skip if the match is too short
        let i = 0;
        for (i = 0; s && length === s[0].length; i++) {
          s = dudeRegex.exec(text);
        }
        const len = i * length;
        if (len > quary.length / 2) {
          results.push(new VerseRef(book, chapter, verse));
          distances.push(len);
        }
        /* const distance = levenshtein(verses[verse].toLowerCase(), lowerQuery);
        if (distance < 30) {
          results.push(new VerseRef(book, chapter, verse));
          //distances.push(distance);
        } */
      }
    }
  }
  const endTime = performance.now();
  console.log(
    `Levenshtein search completed in ${endTime - startTime} ms`,
    results.length,
    "results found",
    length,
    "length of query"
  );
  //console.log(`Found ${results.length} results for query "${quary}"`);
  //console.log("Results:", results);
  //console.log("Distances:", distances);
}

export class topicListCategory extends CommandCategory<VerseRef | string, TouchGrassBibleApp> {
  list: string[] | VerseRef[] = [];
  name = "Topics (www.openbible.info)";
  description = "List of topics from OpenBible.info";

  onTrigger(context: TGPaletteState): void {
    if (context.topic) {
      const { topic } = context;
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

  renderCommand(command: VerseRef | string, Item: CommandItem<VerseRef | string>): Partial<TGPaletteState> {
    if (typeof command === "string") {
      Item.setTitle(command.toTitleCase()).addctx();
      return { topCategory: topicListCategory, topic: command };
    } else {
      Item.setTitle(command.toString()).setDescription(command.vTXT).addctx();
      return { topCategory: CrossRefCategory, verse: command };
    }
  }

  executeCommand(command: VerseRef | string): void {
    if (typeof command === "string") this.commandPalette.display();
    else this.commandPalette.close();
  }
}

export class BookmarkCategory extends CommandCategory<string, TouchGrassBibleApp> {
  tags: string[] = [];
  name = "Bookmarks";
  description = "List of bookmark tags";

  onInit(): void {
    this.addCommands(
      {
        name: "Delete verse from tag",
        description: "Delete a verse from a bookmark tag",
        render: (cmd, item) => {
          const { verse, tag } = cmd.context as TGPaletteState;
          item.setTitle(`Delete ${verse.toString()} from "${tag}"`);
          return { topCategory: BookmarkCategory, tag };
        },
        action: cmd => {
          const { verse, tag } = cmd.context as TGPaletteState;
          VerseRef.Bookmarks.remove(tag, verse);
          this.commandPalette.display();
          this.app.saveSettings();
        },
      },
      {
        name: "Delete tag",
        description: "Delete a bookmark tag",
        render: (cmd, item) => {
          const { tag } = cmd.context as TGPaletteState;
          item.setTitle(`Delete tag: ${tag}`);
          return { topCategory: BookmarkCategory, tag };
        },
        action: cmd => {
          const { tag } = cmd.context as TGPaletteState;
          VerseRef.Bookmarks.delete(tag);
          this.commandPalette.display();
          this.app.saveSettings();
        },
      },
      {
        name: "Save to bookmarks",
        description: "Save the current verse to a bookmark tag",
        getCommand: (query: string) => query !== "Welcome to Touch Grass Bible!",
        render: (cmd, item) => {
          const { verse, query } = cmd.context as TGPaletteState;
          const tag = (query || "Start Up Verses").toTitleCase();
          item.setTitle(`Save ${verse.toString()} to "${tag}"`);
          return { topCategory: BookmarkCategory, tag };
        },
        action: cmd => {
          const { verse, query } = cmd.context as TGPaletteState;
          VerseRef.Bookmarks.add(query.toTitleCase() || "Start Up Verses", verse);
          this.commandPalette.display();
          this.app.saveSettings();
        },
      }
    );
    if (false)
      this.addSetting(setting => {
        setting
          .setName("Bookmark Settings")
          .setDescription("Manage your bookmark settings")
          .addButton(button => {
            button.setButtonText("Reset Bookmarks").on("click", () => {
              VerseRef.Bookmarks = new BibleTopics({});
            });
          });
      });
  }

  onTrigger(context: TGPaletteState): void {
    this.tags = VerseRef.Bookmarks.keys;
  }

  getCommands(query: string): string[] {
    this.console.log(Number(false) - Number(true));
    return this.getcompatible(
      query,
      this.tags,
      topic => topic,
      topic => this.convertTopicDate(topic)
    ).sort(this.dateCompare);
  }

  /**
   * Compares two strings, sorting non-date strings before date strings (in `YYYY-MM-DD` format),
   * and sorting date strings in descending order (most recent first).
   *
   * @param a - The first string to compare.
   * @param b - The second string to compare.
   * @returns A negative number if `a` should come before `b`, a positive number if `a` should come after `b`, or zero if they are considered equal.
   */
  dateCompare(a: string, b: string): number {
    // sorts first non-date strings, then date strings starting with the most recent
    const isdate = (s: string) => Number(/^\d{4}-\d{2}-\d{2}$/.test(s));
    return isdate(b) - isdate(a) || isdate(a) ? b.localeCompare(a) : a.localeCompare(b);
  }

  renderCommand(command: string, Item: CommandItem<string>): Partial<TGPaletteState> {
    Item.setTitle(this.convertTopicDate(command))
      .addctx()
      .setDescription(
        VerseRef.Bookmarks.get(command)
          .map(v => v.toString())
          .join(", ")
      );

    return { topCategory: VerseListCategory, tag: command.toTitleCase() };
  }

  convertTopicDate(str: string): string {
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
    this.commandPalette.display();
  }
}

export class translationCategory extends CommandCategory<string, TouchGrassBibleApp> {
  readonly name = "Translations";
  readonly description = "List of available Bible translations";
  translations: string[];

  onTrigger(state: CommandPaletteState): void {
    this.translations = Object.keys(VerseRef.bibleTranslations);
  }

  getCommands(query: string): string[] {
    return this.getcompatible(query, this.translations, str => translationMetadata[str]?.name || str);
  }

  renderCommand(command: string, Item: CommandItem<string>): Partial<TGPaletteState> {
    Item.setTitle(translationMetadata[command]?.name || command).addctx();
    return { topCategory: null, defaultTranslation: command as translation };
  }

  executeCommand(command: string): void {
    VerseRef.defaultTranslation = command as translation;
    this.commandPalette.close();
  }
}

export class myNotesCategory extends CommandCategory<VerseRef, TouchGrassBibleApp> {
  readonly name = "Notes";
  readonly description = "List of your personal notes on verses";
  notes: VerseRef[] = [];

  onTrigger(context: TGPaletteState): void {
    this.notes = Array.from(VerseRef.myNotes.keys())
      .map(osis => VerseRef.fromOSIS(osis))
      .sort((a, b) => a.toString().localeCompare(b.toString()));
    this.title = "Notes";
  }

  getCommands(query: string): VerseRef[] {
    return this.getcompatible(query, this.notes, verse => verse.note);
  }

  renderCommand(verse: VerseRef, Item: CommandItem<VerseRef>): Partial<TGPaletteState> {
    Item.setTitle(verse.toString())
      .setDescription(verse.note || "No note")
      .addctx();
    return { topCategory: CrossRefCategory, verse };
  }

  executeCommand(command: VerseRef): void {
    this.commandPalette.close();
  }
}

export class SettingsCategory extends CommandCategory<string, TouchGrassBibleApp> {
  readonly name = "Settings";
  readonly description = "Configure Touch Grass Bible settings";

  onInit(): void {
    this.addCommands(
      {
        name: "Download settings",
        description: "Download your current settings as a JSON file",
        action: () => {
          this.app.saveSettings();
          this.app.downloadFile("TouchGrassBibleSettings.json", this.app.settings);
        },
      },
      {
        name: "Upload settings",
        description: "Upload a JSON file to update your settings",
        action: () => {
          this.app.uploadFile(
            ".json",
            newSettings => {
              this.app.settings = Object.assign({}, DEFAULT_SETTINGS, newSettings);
              VerseRef.Bookmarks.addData(this.app.settings.Bookmarks);
              this.app.saveSettings();
            },
            error => this.app.console.error("Failed to parse settings file:", error),
            message => this.app.console.warn(message)
          );
        },
      },
      {
        name: "Reset settings",
        description: "Reset settings to default values",
        action: () => {
          this.app.commandPalette
            .confirm("Are you sure you want to delete all your data including bookmarks?")
            .then(confirmed => {
              if (!confirmed) return;
              this.app.settings = { ...DEFAULT_SETTINGS };
              VerseRef.Bookmarks = new BibleTopics(this.app.settings.Bookmarks);
              this.app.saveSettings();
              this.app.commandPalette.display({ topCategory: null });
            });
        },
      },
      {
        name: "Welcome to Touch Grass Bible!",
        description:
          "From here you can search for verses, topics, and more.  Remember to take breaks!  Touch grass!",
        getCommand: (query: string) => query === "Welcome to Touch Grass Bible!",
        render: (cmd, item) => {
          item.setHidden(false);
          return { topCategory: null };
        },
        action: cmd => {
          this.app.settings.showHelp = !this.app.settings.showHelp;
          this.app.saveSettings();
          this.app.commandPalette.display();
        },
      },
      {
        name: info.name,
        description: `Version: ${info.version}
      Author: ${info.author}
      Built: ${new Date(info.build).toString()}
      License: ${info.license}
      
      ${info.description}`,
        render: (cmd, item) => {
          item.setHidden(false);
          return { topCategory: null };
        },
      }
    );
  }

  onTrigger(state: CommandPaletteState): void {}

  getCommands(query: string): string[] {
    return [];
  }

  renderCommand(command: string, Item: CommandItem<string>): Partial<TGPaletteState> {
    return { topCategory: null };
  }

  executeCommand(command: string): void {}
}
