import {
  CommandCategory,
  CommandItem,
  CommandPaletteDialog,
  CommandPaletteViewState,
  renderIcon,
  van,
} from "@touchgrass/framework";
import { Bookmark, Plus, X } from "lucide";
import { VerseRef } from "src/models/VerseRef";
import Plugin from "../core/Plugin";
import { BibleTopics, BibleTopicsType } from "../models/BibleTopics";
import { BookmarkCategoryID, TSKCrossRefCategoryID, VerseListCategoryID } from "./categoryIDs";

const { div, button, input, hr } = van.tags;

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
  tag = this.app.commandPalette.useVanState("Start Up Verses"); // State to track the currently selected bookmark tag
  settings: BookmarkSettings = defaultBookmarks;
  Bookmarks = new BibleTopics({});

  async onload(): Promise<void> {
    this.settings = await this.loadSettings(defaultBookmarks);
    if (this.app.settings.Bookmarks) {
      this.settings.Bookmarks = { ...this.app.settings.Bookmarks };
      delete this.app.settings.Bookmarks;
      this.app.settingsStore.save();
    }

    //this.console.log("Loaded bookmarks from settings:", this.settings.Bookmarks);
    this.Bookmarks = new BibleTopics(this.settings.Bookmarks);

    this.registerUnload(
      this.app.onVerseStateChange(verse => {
        this.Bookmarks.addToHistory(verse);
        void this.saveSettings();
      }),
    );

    if (window.location.hash) {
      const id = window.location.hash.substring(1);
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }

    this.registerPalette(dialog => new VerseListCategory(dialog, this), VerseListCategoryID);
    this.registerPalette(dialog => new BookmarkCategory(dialog, this), BookmarkCategoryID);

    this.addVerseAction({
      id: "bookmark",
      name: "Bookmark verse",
      icon: Bookmark,
      onTrigger: verseInfo => this.syncBookmarkStatus(verseInfo),
    });
  }

  syncBookmarkStatus(verseInfo: { verse: VerseRef; event: Event; element: HTMLElement }) {
    const usedTags = van.state(this.Bookmarks.getTopicsFromVerse(verseInfo.verse));
    const isAddingTag = van.state(false);
    const newTag = van.state("");

    const refreshUsedTags = () => {
      usedTags.val = this.Bookmarks.getTopicsFromVerse(verseInfo.verse);
    };

    const openBookmarkTagMenu = (topic: string, e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.tag.val = topic;
      this.app.openCommandPalette({
        topCategory: BookmarkCategoryID,
      });
    };

    const addBookmarkTag = () => {
      const tag = newTag.val.trim();
      if (!tag) return;
      this.Bookmarks.add(tag, verseInfo.verse);
      newTag.val = "";
      isAddingTag.val = false;
      refreshUsedTags();
    };

    van.add(
      verseInfo.element,
      div(
        () =>
          div(
            ...usedTags.val.map(topic =>
              button(
                {
                  class: "bookmark-added",
                  onclick: () => {
                    this.Bookmarks.remove(topic, verseInfo.verse);
                    refreshUsedTags();
                  },
                  oncontextmenu: (e: Event) => openBookmarkTagMenu(topic, e),
                },
                `${VerseListCategory.convertTopicDate(topic)}`,
              ),
            ),
          ),
        () =>
          isAddingTag.val
            ? div(
                input({
                  class: "note-area",
                  placeholder: "Enter bookmark name...",
                  value: () => newTag.val,
                  oninput: (e: Event) => (newTag.val = (e.target as HTMLInputElement).value),
                  onkeydown: (e: Event) => (e as KeyboardEvent).key === "Enter" && addBookmarkTag(),
                  onclick: (e: Event) => e.stopPropagation(),
                }),
                button({ onclick: addBookmarkTag }, "Add"),
              )
            : button(
                {
                  class: "icon-button",
                  onclick: (e: Event) => {
                    e.stopPropagation();
                    isAddingTag.val = true;
                  },
                  "aria-label": "Add bookmark tag",
                  title: "Add bookmark tag",
                },
                renderIcon(Plus),
              ),
        () => {
          const unusedTags = this.Bookmarks.keys.filter(tag => !usedTags.val.includes(tag));
          return unusedTags.length > 0 ? hr() : null;
        },
        () => {
          const unusedTags = this.Bookmarks.keys.filter(tag => !usedTags.val.includes(tag));
          return div(
            ...unusedTags.map(topic =>
              button(
                {
                  class: "bookmark-not-added",
                  onclick: () => {
                    this.Bookmarks.add(topic, verseInfo.verse);
                    refreshUsedTags();
                  },
                  oncontextmenu: (e: Event) => openBookmarkTagMenu(topic, e),
                },
                `${VerseListCategory.convertTopicDate(topic)}`,
              ),
            ),
          );
        },
      ),
    );
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
    public dialog: CommandPaletteDialog,
    public plugin: BookmarkPlugin,
  ) {
    super(dialog);
  }

  onTrigger(): void {
    this.defaultCMD.addCMD(
      this.isediting ? "Stop Editing Bookmark Tag" : "Edit Bookmark Tag",
      "",
      item =>
        void item.onClick(() => {
          this.isediting = !this.isediting;
          this.dialog.palette.update({ topCategory: VerseListCategoryID }).display();
        }),
    );
    this.defaultCMD.addCMD(
      "Merge verses from the same chapter",
      "",
      item =>
        void item.onClick(() => {
          const versesToKeep = this.plugin.Bookmarks.get(this.plugin.tag.val)
            .reverse()
            .reduce((acc: VerseRef[], v) => {
              if (!acc.some(av => av.isSameChapter(v))) acc.push(v);
              return acc;
            }, [])
            .reverse();
          this.plugin.Bookmarks.set(this.plugin.tag.val, ...versesToKeep);
          this.dialog.palette.display();
          this.plugin.saveSettings();
        }),
    );
    this.title = `Bookmark tag: ${VerseListCategory.convertTopicDate(this.plugin.tag.val)}`;
    this.verses = this.plugin.Bookmarks.get(this.plugin.tag.val).reverse();
  }

  getCommands(query: string): VerseRef[] {
    return this.getcompatible(
      query,
      this.verses,
      verse => verse.toString(),
      verse => verse.vTXT,
    ); //.reverse();
  }

  renderCommand(
    verse: VerseRef,
    Item: CommandItem<VerseRef>,
  ): Partial<CommandPaletteViewState> | (() => Partial<CommandPaletteViewState>) {
    Item.setTitle(verse.toString()).setDescription(verse.vTXT).addctx();
    if (this.isediting) {
      Item.prependComponent(
        div(
          {
            class: "icon-button",
            title: "Delete verse from tag",
            onclick: (e: Event) => {
              e.stopPropagation();

              this.plugin.Bookmarks.remove(this.plugin.tag.val, verse);
              this.dialog.palette.display();
              this.plugin.saveSettings();
            },
          },
          renderIcon(X),
        ),
      );
    }

    return () => {
      this.plugin.app.verseState.val = verse;

      return { topCategory: TSKCrossRefCategoryID };
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
    this.dialog.palette.close();
  }
}

class BookmarkCategory extends CommandCategory<string> {
  tags: string[] = [];
  name = "Bookmarks";
  description = "List of bookmark tags";

  constructor(
    public dialog: CommandPaletteDialog,
    public plugin: BookmarkPlugin,
  ) {
    super(dialog);
  }

  onTrigger(_state: CommandPaletteViewState): void {
    void _state;
    const tag = this.plugin.tag.val;
    const verse = this.plugin.app.verseState.val;
    this.defaultCMD.addCMD(
      `Delete ${verse.toString()} from "${tag}"`,
      "Delete a verse from a bookmark tag",
      item =>
        void item.onClick(() => {
          const tag = this.plugin.tag.val;
          const verse = this.plugin.app.verseState.val;
          this.plugin.Bookmarks.remove(tag, verse);
          this.dialog.palette.display();
          this.plugin.saveSettings();
        }),
    );

    this.defaultCMD.addCMD(
      `Delete tag: ${this.plugin.tag.val}`,
      "Delete a bookmark tag",
      item =>
        void item.onClick(() => {
          const tag = this.plugin.tag.val;
          this.plugin.Bookmarks.delete(tag);
          this.dialog.palette.display();
          this.plugin.saveSettings();
        }),
    );
    this.defaultCMD.addCMD(
      `Save ${verse.toString()} to new tag`,
      "Save the current verse to a bookmark tag",
      item =>
        void item.onClick(() => {
          this.console.log("Prompting for new bookmark tag for", verse.toString());
          this.plugin.app.commandPalette.prompt("Enter new bookmark tag").then(st => {
            this.console.log("Adding bookmark", verse.toString(), "to tag", st);
            if (!st) return;
            this.console.log("Adding bookmark", verse.toString(), "to tag", st);
            const tag = st.toTitleCase();
            this.plugin.Bookmarks.add(tag, verse);
            this.dialog.palette.display();
            this.plugin.saveSettings();
          });
        }),
    );

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
  ): Partial<CommandPaletteViewState> | (() => Partial<CommandPaletteViewState>) {
    const verses = this.plugin.Bookmarks.get(command);
    Item.setTitle(VerseListCategory.convertTopicDate(command))
      .addctx()
      .setDescription(
        verses
          .slice(0, 5)
          .map(v => v.toString())
          .join(", ") + (verses.length > 5 ? `, and ${verses.length - 5} more...` : ""),
      );

    return () => {
      this.plugin.tag.val = command;
      return { topCategory: VerseListCategoryID };
    };
  }

  executeCommand(_command: VerseRef | string): void {
    void _command;
    this.dialog.palette.display();
  }
}
