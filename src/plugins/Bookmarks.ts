import { CommandCategory, CommandPaletteState, renderIcon, stateMapping, van } from "@touchgrass/framework";
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
  tag = this.app.commandPalette.useState("Start Up Verses");
  settings: BookmarkSettings = defaultBookmarks;
  Bookmarks = new BibleTopics({});

  async onload(): Promise<void> {
    this.settings = await this.loadSettings(defaultBookmarks);
    if (this.app.settings.Bookmarks) {
      this.settings.Bookmarks = { ...this.app.settings.Bookmarks };
      delete this.app.settings.Bookmarks;
      this.app.settingsStore.save();
    }

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

    this.registerPalette(VerseListCategoryID, ({ state }) => new VerseListCategory(state, this));
    this.registerPalette(BookmarkCategoryID, ({ state }) => new BookmarkCategory(state, this));

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
      this.app.commandPalette.open({
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
  allItems = van.state<VerseRef[]>([]);
  criteria: Array<(item: VerseRef) => string> = [verse => verse.toString(), verse => verse.vTXT];
  isediting = van.state(false);

  constructor(
    state: stateMapping<CommandPaletteState>,
    public plugin: BookmarkPlugin,
  ) {
    super(state, "Open", "List of opened verses");
    this.deriveExtraCMDs(() => {
      const isediting = this.isediting.val;
      return [
        {
          title: isediting ? "Stop Editing Bookmark Tag" : "Edit Bookmark Tag",
          description: "",
          cb: () => ({
            click: () => {
              this.isediting.val = !this.isediting.val;
              this.updateViewState({ topCategory: VerseListCategoryID });
              return false;
            },
          }),
        },
        {
          title: "Merge verses from the same chapter",
          description: "",
          cb: () => ({
            click: () => {
              const versesToKeep = this.plugin.Bookmarks.get(this.plugin.tag.val)
                .reverse()
                .reduce((acc: VerseRef[], v) => {
                  if (!acc.some(av => av.isSameChapter(v))) acc.push(v);
                  return acc;
                }, [])
                .reverse();
              this.plugin.Bookmarks.set(this.plugin.tag.val, ...versesToKeep);
              this.updateViewState({ topCategory: VerseListCategoryID });
              void this.plugin.saveSettings();
              return false;
            },
          }),
        },
      ];
    });

    this.allItems = van.derive(() => {
      const tag = this.plugin.tag.val;

      this.title.val = `Bookmark tag: ${VerseListCategory.convertTopicDate(tag)}`;
      return this.plugin.Bookmarks.get(tag).reverse();
    });
  }

  renderItem(verse: VerseRef) {
    return {
      ...this.context(() => {
        this.plugin.app.verseState.val = verse;
        return { topCategory: TSKCrossRefCategoryID };
      }),
      title: verse.toString(),
      description: verse.vTXT,
      extras: this.isediting.val
        ? div(
            {
              class: "icon-button",
              title: "Delete verse from tag",
              onclick: (e: Event) => {
                e.stopPropagation();
                this.plugin.Bookmarks.remove(this.plugin.tag.val, verse);
                this.updateViewState({ topCategory: VerseListCategoryID });
                void this.plugin.saveSettings();
              },
            },
            renderIcon(X),
          )
        : undefined,
      click: this.context(() => {
        this.plugin.app.verseState.val = verse;
        return { topCategory: TSKCrossRefCategoryID };
      }).context,
    };
  }

  static convertTopicDate(str: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return str.toTitleCase();

    const inputDate = new Date(str);
    const { today, yesterday } = this.LocalDateStrings;

    if (str === today) return "Today";
    if (str === yesterday) return "Yesterday";
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
    return;
  }
}

class BookmarkCategory extends CommandCategory<string> {
  allItems = van.state<string[]>([]);
  criteria: Array<(item: string) => string> = [
    topic => topic,
    topic => VerseListCategory.convertTopicDate(topic),
  ];

  constructor(
    state: stateMapping<CommandPaletteState>,
    public plugin: BookmarkPlugin,
  ) {
    super(state, "Bookmarks", "List of bookmark tags");
    this.deriveExtraCMDs(() => {
      const tag = this.plugin.tag.val;
      const verse = this.plugin.app.verseState.val;

      return [
        {
          title: `Delete ${verse.toString()} from "${tag}"`,
          description: "Delete a verse from a bookmark tag",
          cb: () => ({
            click: () => {
              const activeTag = this.plugin.tag.val;
              const activeVerse = this.plugin.app.verseState.val;
              this.plugin.Bookmarks.remove(activeTag, activeVerse);
              this.updateViewState({ topCategory: BookmarkCategoryID });
              void this.plugin.saveSettings();
              return false;
            },
          }),
        },
        {
          title: `Delete tag: ${tag}`,
          description: "Delete a bookmark tag",
          cb: () => ({
            click: () => {
              const activeTag = this.plugin.tag.val;
              this.plugin.Bookmarks.delete(activeTag);
              this.updateViewState({ topCategory: BookmarkCategoryID });
              void this.plugin.saveSettings();
              return false;
            },
          }),
        },
        {
          title: `Save ${verse.toString()} to new tag`,
          description: "Save the current verse to a bookmark tag",
          cb: () => ({
            click: () => {
              this.plugin.console.log("Prompting for new bookmark tag for", verse.toString());
              void this.plugin.app.commandPalette.prompt("Enter new bookmark tag").then(st => {
                if (!st) return;
                const nextTag = st.toTitleCase();
                this.plugin.Bookmarks.add(nextTag, verse);
                this.updateViewState({ topCategory: BookmarkCategoryID });
                void this.plugin.saveSettings();
              });
              return false;
            },
          }),
        },
      ];
    });

    this.allItems = van.derive(() => [...this.plugin.Bookmarks.keys].sort(this.dateCompare));
  }

  dateCompare(a: string, b: string): number {
    const isdate = (s: string) => Number(/^\d{4}-\d{2}-\d{2}$/.test(s));
    return isdate(b) - isdate(a) || isdate(a) ? b.localeCompare(a) : a.localeCompare(b);
  }

  renderItem(command: string) {
    const verses = this.plugin.Bookmarks.get(command);
    const openTag = this.context(() => {
      this.plugin.tag.val = command;
      return { topCategory: VerseListCategoryID };
    });

    return {
      title: VerseListCategory.convertTopicDate(command),
      description:
        verses
          .slice(0, 5)
          .map(v => v.toString())
          .join(", ") + (verses.length > 5 ? `, and ${verses.length - 5} more...` : ""),
      ...openTag,
      click: openTag.context,
    };
  }

  executeCommand(): void {
    return;
  }
}
