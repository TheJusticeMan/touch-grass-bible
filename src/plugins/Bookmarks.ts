import { Bookmark, Plus, X } from "lucide";
import TouchGrassBibleApp from "../main";
import Plugin from "../Plugin";
import { BookmarkCategoryID, TSKCrossRefCategoryID, VerseListCategoryID } from "./categoryIDs";
import { BibleTopics, BibleTopicsType } from "../BibleTopics";
import { CMD } from "src/external/Comands";
import {
  CommandCategory,
  UnifiedCommandPalette,
  CommandItem,
  CommandPaletteState,
} from "src/external/CommandPalette";
import { Button, IconButton, TextInput } from "src/external/Components";
import { VerseRef } from "src/VerseRef";
import { VerseInfoComponent } from "src/VerseScreen";

interface BookmarkSettings {
  Bookmarks: BibleTopicsType;
}

const defaultBookmarks: BookmarkSettings = {
  Bookmarks: {
    "Start Up Verses": [
      [new VerseRef("GENESIS", 1, 1).toOSIS(), 0],
      [new VerseRef("JOHN", 3, 16).toOSIS(), 0],
      [new VerseRef("PSALMS", 23, 2).toOSIS(), 0],
      [new VerseRef("1 CORINTHIANS", 13, 4).toOSIS(), 0],
      [new VerseRef("PHILIPPIANS", 4, 13).toOSIS(), 0],
      [new VerseRef("ROMANS", 8, 28).toOSIS(), 0],
    ],
  },
};

export default class BookmarkPlugin extends Plugin {
  tag = this.app.commandPalette.useState("Start Up Verses"); // State to track the currently selected bookmark tag
  settings: BookmarkSettings = defaultBookmarks;
  Bookmarks = new BibleTopics({});

  async onload(): Promise<void> {
    this.settings = await this.loadSettings(defaultBookmarks);
    if (this.app.settings.Bookmarks) {
      this.settings.Bookmarks = { ...this.app.settings.Bookmarks };
      delete this.app.settings.Bookmarks;
      this.app.saveSettings();
    }

    this.console.log("Loaded bookmarks from settings:", this.settings.Bookmarks);
    this.Bookmarks = new BibleTopics(this.settings.Bookmarks);

    this.app.verseState.onChange(verse => {
      return (this.Bookmarks.addToHistory(verse), this.saveSettings());
    });

    if (window.location.hash) {
      const id = window.location.hash.substring(1);
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }

    this.registerPalette(() => new VerseListCategory(this.app.commandPalette, this), VerseListCategoryID);
    this.registerPalette(() => new BookmarkCategory(this.app.commandPalette, this), BookmarkCategoryID);

    this.addVerseAction({
      id: "bookmark",
      name: "Bookmark verse",
      icon: Bookmark,
      onTrigger: (verseInfo: VerseInfoComponent) => {
        this.syncBookmarkStatus(verseInfo);
      },
    });
  }

  syncBookmarkStatus(verseInfo: VerseInfoComponent) {
    const usedTags = this.Bookmarks.getTopicsFromVerse(verseInfo.verse);
    verseInfo.element.empty();
    const unusedTags = this.Bookmarks.keys.filter(tag => !usedTags.includes(tag));

    usedTags.forEach(topic => {
      new Button(verseInfo.element)
        .setButtonText(`${VerseListCategory.convertTopicDate(topic)}`)
        .addClass("bookmark-added")
        .on("click", () => {
          this.Bookmarks.remove(topic, verseInfo.verse);
          this.syncBookmarkStatus(verseInfo);
        })
        .on("menu", e => {
          e.stopPropagation();
          this.tag.set(topic);
          this.app.openCommandPalette({
            topCategory: BookmarkCategoryID,
          });
        });
    });
    // add new tag button
    new IconButton(verseInfo.element).setIcon(Plus).on("click", () => {
      let tag = "";

      const addBookmark = () => {
        if (tag.length === 0) return;
        this.Bookmarks.add(tag, verseInfo.verse);
        this.syncBookmarkStatus(verseInfo);
      };

      new TextInput(verseInfo.element)
        .setPlaceholder("Enter bookmark name...")
        .addClass("note-area")
        .on("click", e => e.stopPropagation())
        .on("input", (value: string) => (tag = value.trim()))
        .on("keydown", e => (e as KeyboardEvent).key === "Enter" && addBookmark());

      new Button(verseInfo.element).setButtonText("Add").on("click", () => addBookmark());
    });
    if (unusedTags.length > 0) verseInfo.element.createEl("hr");
    unusedTags.forEach(topic => {
      new Button(verseInfo.element)
        .setButtonText(`${VerseListCategory.convertTopicDate(topic)}`)
        .addClass("bookmark-not-added")
        .on("click", () => {
          this.Bookmarks.add(topic, verseInfo.verse);
          this.syncBookmarkStatus(verseInfo);
        })
        .on("menu", e => {
          e.stopPropagation();
          this.tag.set(topic);
          this.app.openCommandPalette({
            topCategory: BookmarkCategoryID,
          });
        });
    });
  }

  async saveSettings(): Promise<void> {
    this.settings.Bookmarks = this.Bookmarks.toJSON();
    await super.saveSettings(this.settings);
  }
}

class VerseListCategory extends CommandCategory<VerseRef> {
  readonly description = "List of opened verses";
  verses: VerseRef[] = [];
  name = "Open";
  isediting = false;

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: BookmarkPlugin,
  ) {
    super(commandPalette);
  }

  onTrigger(): void {
    new CMD(this.defaultCMD)
      .setName(this.isediting ? "Stop Editing Bookmark Tag" : "Edit Bookmark Tag")
      .on("_click", () => {
        this.isediting = !this.isediting;
        this.commandPalette.update({ topCategory: VerseListCategoryID }).display();
      });
    new CMD(this.defaultCMD).setName("Merge verses from the same chapter").on("_click", () => {
      const versesToKeep = this.plugin.Bookmarks.get(this.plugin.tag.get())
        .reverse()
        .reduce((acc: VerseRef[], v) => {
          if (!acc.some(av => av.isSameChapter(v))) acc.push(v);
          return acc;
        }, [])
        .reverse();
      this.plugin.Bookmarks.set(this.plugin.tag.get(), ...versesToKeep);
      this.commandPalette.display();
      this.plugin.saveSettings();
    });
    this.title = `Bookmark tag: ${VerseListCategory.convertTopicDate(this.plugin.tag.get())}`;
    this.verses = this.plugin.Bookmarks.get(this.plugin.tag.get()).reverse();
  }

  getCommands(query: string): VerseRef[] {
    return this.getcompatible(
      query,
      this.verses,
      verse => verse.toString(),
      verse => verse.vTXT,
    ); //.reverse();
  }

  renderCommand(verse: VerseRef, Item: CommandItem<VerseRef>) {
    Item.setTitle(verse.toString()).setDescription(verse.vTXT).addctx();
    if (this.isediting) {
      Item.addIconButton(btn =>
        btn
          .setIcon(X)
          .setTooltip("Delete verse from tag")
          .on("click", () => {
            this.plugin.Bookmarks.remove(this.plugin.tag.get(), verse);
            this.commandPalette.display();
            this.plugin.saveSettings();
          }),
      );
    }

    return (state: CommandPaletteState) => {
      this.plugin.app.verseState.set(verse);

      return state.update({ topCategory: TSKCrossRefCategoryID });
    };
  }

  static convertTopicDate(str: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return str.toTitleCase();

    const inputDate = new Date(str);
    const { today, yesterday } = this.LocalDateStrings;

    if (str === today) return "Today";
    if (str === yesterday) return "Yesterday";
    // in the last 7 days
    if (inputDate.getTime() >= Date.now() - 6 * 86400000)
      return inputDate.toLocaleDateString("en-US", {
        weekday: "long",
        day: "numeric",
      });
    return inputDate.toDateString();
  }

  static get LocalDateStrings(): { today: string; yesterday: string } {
    const formatDate = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate(),
      ).padStart(2, "0")}`;
    const now = new Date();
    return {
      today: formatDate(now),
      yesterday: formatDate(new Date(now.getTime() - 86400000)),
    };
  }

  executeCommand(): void {
    this.commandPalette.close();
  }
}

class BookmarkCategory extends CommandCategory<string> {
  tags: string[] = [];
  name = "Bookmarks";
  description = "List of bookmark tags";
  app: TouchGrassBibleApp;

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: BookmarkPlugin,
  ) {
    super(commandPalette);
    this.app = plugin.app;
  }

  onTrigger(_state: CommandPaletteState): void {
    const tag = this.plugin.tag.get();
    const verse = this.app.verseState.get();
    new CMD(this.defaultCMD)
      .setName(`Delete ${verse.toString()} from "${tag}"`)
      .setDescription("Delete a verse from a bookmark tag")
      .on("_click", () => {
        const tag = this.plugin.tag.get();
        const verse = this.app.verseState.get();
        this.plugin.Bookmarks.remove(tag, verse);
        this.commandPalette.display();
        this.plugin.saveSettings();
      });

    new CMD(this.defaultCMD)
      .setName(`Delete tag: ${this.plugin.tag.get()}`)
      .setDescription("Delete a bookmark tag")
      .on("_click", () => {
        const tag = this.plugin.tag.get();
        this.plugin.Bookmarks.delete(tag);
        this.commandPalette.display();
        this.plugin.saveSettings();
      });
    new CMD(this.defaultCMD)
      .setName(`Save ${verse.toString()} to new tag`)
      .setDescription("Save the current verse to a bookmark tag")
      .on("_click", () => {
        this.console.log("Prompting for new bookmark tag for", verse.toString());
        this.commandPalette.prompt("Enter new bookmark tag").then(st => {
          this.console.log("Adding bookmark", verse.toString(), "to tag", st);
          if (!st) return;
          this.console.log("Adding bookmark", verse.toString(), "to tag", st);
          const tag = st.toTitleCase();
          this.plugin.Bookmarks.add(tag, verse);
          this.commandPalette.display();
          this.plugin.saveSettings();
        });
      });

    this.tags = this.plugin.Bookmarks.keys;
  }

  getCommands(query: string): string[] {
    return this.getcompatible(
      query,
      this.tags,
      topic => topic,
      topic => VerseListCategory.convertTopicDate(topic),
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

  renderCommand(
    command: string,
    Item: CommandItem<string>,
  ): (state: CommandPaletteState) => CommandPaletteState {
    Item.setTitle(VerseListCategory.convertTopicDate(command))
      .addctx()
      .setDescription(
        this.plugin.Bookmarks.get(command)
          .map(v => v.toString())
          .join(", "),
      );

    return state => {
      this.plugin.tag.set(command);
      return state.update({ topCategory: BookmarkCategoryID });
    };
  }

  executeCommand(_command: VerseRef | string): void {
    this.commandPalette.display();
  }
}
