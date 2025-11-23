import { X } from "lucide";
import { BibleTopics } from "./BibleTopics";
import { CommandCategory, CommandItem, CommandPaletteState, UnifiedCommandPalette } from "./external/App";
import { CMD, toggleCMD } from "./external/Comands";
import info from "./info.json";
import TouchGrassBibleApp from "./main";
import { DEFAULT_SETTINGS } from "./TGAppSettings";
import { bibleData, translation, translationMetadata, VerseRef } from "./VerseRef";

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
  isediting = false;

  onTrigger(state: TGPaletteState): void {
    new CMD(this.defaultCMD)
      .setName(this.isediting ? "Stop Editing Bookmark Tag" : "Edit Bookmark Tag")
      .on("_click", () => {
        this.isediting = !this.isediting;
        this.app.commandPalette.update({ topCategory: VerseListCategory }).display();
      });
    new CMD(this.defaultCMD).setName("Merge verses from the same chapter").on("_click", () => {
      const { tag } = this.commandPalette.state as TGPaletteState;

      const versesToKeep = VerseRef.Bookmarks.get(tag)
        .reverse()
        .reduce((acc: VerseRef[], v) => {
          if (!acc.some(av => av.isSameChapter(v))) acc.push(v);
          return acc;
        }, [])
        .reverse();
      VerseRef.Bookmarks.set(tag, ...versesToKeep);
      this.commandPalette.display();
      this.app.saveSettings();
    });
    this.title = `Bookmark tag: ${VerseListCategory.convertTopicDate(state.tag)}`;
    this.verses = VerseRef.Bookmarks.get(state.tag).reverse();
  }

  getCommands(query: string): VerseRef[] {
    return this.getcompatible(
      query,
      this.verses,
      verse => verse.toString(),
      verse => verse.vTXT
    ); //.reverse();
  }

  renderCommand(verse: VerseRef, Item: CommandItem<VerseRef>): Partial<TGPaletteState> {
    Item.setTitle(verse.toString()).setDescription(verse.vTXT).addctx();
    if (this.isediting) {
      Item.addIconButton(btn =>
        btn
          .setIcon(X)
          .setTooltip("Delete verse from tag")
          .on("click", () => {
            VerseRef.Bookmarks.remove(this.commandPalette.state.tag, verse);
            this.commandPalette.display();
            this.app.saveSettings();
          })
      );
    }

    return { topCategory: CrossRefCategory, verse, specificity: 0 };
  }

  static convertTopicDate(str: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return str.toTitleCase();

    const inputDate = new Date(str);
    const { today, yesterday } = this.LocalDateStrings;

    if (str === today) return "Today";
    if (str === yesterday) return "Yesterday";
    // in the last 7 days
    if (inputDate.getTime() >= Date.now() - 6 * 86400000)
      return inputDate.toLocaleDateString("en-US", { weekday: "long", day: "numeric" });
    return inputDate.toDateString();
  }

  static get LocalDateStrings(): { today: string; yesterday: string } {
    const formatDate = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate()
      ).padStart(2, "0")}`;
    const now = new Date();
    return {
      today: formatDate(now),
      yesterday: formatDate(new Date(now.getTime() - 86400000)),
    };
  }

  executeCommand(_command: VerseRef): void {
    this.commandPalette.close();
  }
}

export class CrossRefCategory extends VerseListCategory {
  readonly name = "Cross references (TSK+)";

  onTrigger(state: TGPaletteState): void {
    const { verse } = state;
    if (verse) (this.verses = verse.crossRefs()), (this.title = `Cross references for ${verse.toString()}`);
    else this.verses = [];
    /* new CMD(this.defaultCMD).setName("Clear cross reference filter").on("_click", () => {
      this.commandPalette.update({ verse: state.verse } as TGPaletteState).display();
    }); */
  }
}

export class GoToVerseCategory extends CommandCategory<VerseRef, TouchGrassBibleApp> {
  readonly name = "Go to verse";
  readonly description = "Navigate to a specific verse in the Bible";
  list: VerseRef[] = [];
  specificity: number = 0; // 0: Book, 1: Chapter, 2: Verse, 3: Full Verse

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

  executeCommand(_ref: VerseRef): void {
    if (this.specificity > 0) this.commandPalette.close();
    else this.commandPalette.display();
  }
}

export class BibleSearchCategory extends CommandCategory<VerseRef, TouchGrassBibleApp> {
  readonly name = "Search bible";
  readonly description = "Search for verses in the Bible";
  verses: VerseRef[] = [];
  bible: bibleData = {}; // Default to an empty object

  onTrigger(_state: TGPaletteState): void {
    this.bible = VerseRef.bible;
  }

  getCommands(query: string): VerseRef[] {
    const maxResults = this.commandPalette.state.maxResults - this.commandPalette.length; // Limit the number of results to avoid performance issues
    if (!query && this.commandPalette.state.topCategory !== BibleSearchCategory) return [];
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
    return { topCategory: CrossRefCategory, verse };
  }

  executeCommand(_command: VerseRef): void {
    this.commandPalette.close();
  }
}

export function testLevenshtein(bible: bibleData, quary: string) {
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

  onTrigger(state: TGPaletteState): void {
    if (state.topic) {
      const { topic } = state;
      this.list = VerseRef.topics.get(topic);
      this.title = `Topic: ${topic.toTitleCase()}`;
      new CMD(this.defaultCMD).setName("Clear topic filter").on("_click", () => {
        this.commandPalette.update({ topic: "" } as TGPaletteState).display();
      });
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

  onTrigger(_state: TGPaletteState): void {
    const { verse, tag } = this.commandPalette.state as TGPaletteState;
    new CMD(this.defaultCMD)
      .setName(`Delete ${verse.toString()} from "${tag}"`)
      .setDescription("Delete a verse from a bookmark tag")
      .on("_click", ({}) => {
        const { verse, tag } = this.commandPalette.state as TGPaletteState;
        VerseRef.Bookmarks.remove(tag, verse);
        this.commandPalette.display();
        this.app.saveSettings();
      });

    new CMD(this.defaultCMD)
      .setName(`Delete tag: ${(this.commandPalette.state as TGPaletteState).tag}`)
      .setDescription("Delete a bookmark tag")
      .on("_click", ({}) => {
        const { tag } = this.commandPalette.state as TGPaletteState;
        VerseRef.Bookmarks.delete(tag);
        this.commandPalette.display();
        this.app.saveSettings();
      });
    new CMD(this.defaultCMD)
      .setName(`Save ${verse.toString()} to new tag`)
      .setDescription("Save the current verse to a bookmark tag")
      .on("_click", ({}) => {
        this.console.log("Prompting for new bookmark tag for", verse.toString());
        this.commandPalette.prompt("Enter new bookmark tag").then(st => {
          this.console.log("Adding bookmark", verse.toString(), "to tag", st);
          if (!st) return;
          this.console.log("Adding bookmark", verse.toString(), "to tag", st);
          const tag = st.toTitleCase();
          VerseRef.Bookmarks.add(tag, verse);
          this.commandPalette.display();
          this.app.saveSettings();
        });
      });

    this.tags = VerseRef.Bookmarks.keys;
  }

  getCommands(query: string): string[] {
    return this.getcompatible(
      query,
      this.tags,
      topic => topic,
      topic => VerseListCategory.convertTopicDate(topic)
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
    Item.setTitle(VerseListCategory.convertTopicDate(command))
      .addctx()
      .setDescription(
        VerseRef.Bookmarks.get(command)
          .map(v => v.toString())
          .join(", ")
      );

    return { topCategory: VerseListCategory, tag: command.toTitleCase() };
  }

  executeCommand(_command: VerseRef | string): void {
    this.commandPalette.display();
  }
}

export class translationCategory extends CommandCategory<string, TouchGrassBibleApp> {
  readonly name = "Translations";
  readonly description = "List of available Bible translations";
  translations!: string[];

  onTrigger(_state: CommandPaletteState): void {
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

  onTrigger(_state: TGPaletteState): void {
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

  executeCommand(_command: VerseRef): void {
    this.commandPalette.close();
  }
}

export class SettingsCategory extends CommandCategory<string, TouchGrassBibleApp> {
  readonly name = "Settings";
  readonly description = "Configure Touch Grass Bible settings";

  onTrigger(_state: CommandPaletteState): void {
    new toggleCMD(this.defaultCMD)
      .setValue(this.app.settings.enableLogging)
      .setName("Debug console")
      .on("change", (enabled: boolean) => {
        this.app.console.enabled = enabled;
        this.app.settings.enableLogging = enabled;
        this.app.saveSettings();
      });
    new CMD(this.defaultCMD)
      .setName("Download settings")
      .setDescription("Download your current settings as a JSON file")
      .on("_click", () => {
        this.app.saveSettings();
        this.app.downloadFile("TouchGrassBibleSettings.json", this.app.settings);
      });
    new CMD(this.defaultCMD)
      .setName("Upload settings")
      .setDescription("Upload a JSON file to update your settings")
      .on("_click", () => {
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
      });
    new CMD(this.defaultCMD)
      .setName("Reset settings")
      .setDescription("Reset settings to default values")
      .on("_click", () => {
        this.app.commandPalette
          .confirm("Are you sure you want to delete all your data including bookmarks?")
          .then(confirmed => {
            if (!confirmed) return;
            this.app.settings = { ...DEFAULT_SETTINGS };
            VerseRef.Bookmarks = new BibleTopics(this.app.settings.Bookmarks);
            this.app.saveSettings();
            this.app.commandPalette.display({ topCategory: null });
          });
      });
    new CMD(this.defaultCMD)
      .setName(info.name)
      .setDescription(
        `Version: ${info.version}\nAuthor: ${info.author}\nBuilt: ${new Date(
          info.build
        ).toString()}\nLicense: ${info.license}\n\n${info.description}`
      );
  }

  getCommands(_query: string): string[] {
    return [];
  }

  renderCommand(_command: string, _Item: CommandItem<string>): Partial<TGPaletteState> {
    return { topCategory: null };
  }

  executeCommand(_command: string): void {}
}

export class AI extends CommandCategory<string, TouchGrassBibleApp> {
  name: string = "AI";
  description: string = "Interact with AI-powered features such as chat and suggestions.";

  onTrigger(_state: CommandPaletteState): void {
    new CMD(this.defaultCMD)
      .setName("Chat with AI")
      .setDescription("Start a conversation with the AI assistant")
      .on("_click", () => {
        //this.app.openAIChat();
        this.commandPalette.close();
      });
  }

  getCommands(_query: string): string[] {
    return [];
  }

  renderCommand(_command: string, _el: CommandItem<string>): Partial<TGPaletteState> {
    return {};
  }

  executeCommand(_command: string): void {}
}
