import { Item, sidePanel, TextArea } from "./external/App";
import TouchGrassBibleApp, { BibleSearchCategory, BookmarkCategory, myNotesCategory } from "./main";
import "./NotesPanel.css";
import { VerseRef } from "./VerseRef";

export class notesPanelZZZ extends sidePanel<TouchGrassBibleApp> {
  currentFocus: TextArea | null = null;
  constructor(app: TouchGrassBibleApp, parent: HTMLElement) {
    super(app, parent, "left");

    this.on("open", () => {
      this.currentFocus?.focus().scrollIntoViewSS();
    });
  }

  updateContent(verse: VerseRef) {
    this.content.empty();
    verse.cTXT
      .slice(1)
      .map((_v, i) => new VerseRef(verse.book, verse.chapter, i + 1))
      .forEach(v => {
        this.content.createEl("div", { cls: ["note"] }, el => {
          el.createEl("span", { text: `${v.toString().toTitleCase()}`, cls: "verseNumber" });
          new TextArea(el)
            .setValue(v.note)
            .setPlaceholder(` - Add your note here...\n\n${v.vTXT.replace(/[\]\[#]/g, "").trim()}`)
            .on("input", (value: string) => {
              v.note = value;
              this.app.saveSettingsAfterDelay();
            })
            .next(t => v.isSame(verse) && (this.currentFocus = t));
        });
      });
  }
}

/**
 * Navigation panel for navigating through books and chapters.
 * The side will be a menu for opening the command palette.
 */
export class navigationPanel extends sidePanel<TouchGrassBibleApp> {
  constructor(app: TouchGrassBibleApp, parent: HTMLElement) {
    super(app, parent, "left");

    this.on("open", () => {});
    this.updateContent();
  }

  updateContent() {
    this.content.empty();
    new Item(this.content)
      .setName("Search")
      .on("click", () => this.close().app.commandPalette.update({ topCategory: BibleSearchCategory }).open());
    new Item(this.content)
      .setName("Notes")
      .on("click", () => this.close().app.commandPalette.update({ topCategory: myNotesCategory }).open());
    new Item(this.content)
      .setName("Bookmarks")
      .on("click", () => this.close().app.commandPalette.update({ topCategory: BookmarkCategory }).open());
    new Item(this.content).setName("Menu").on("click", () => this.close().app.commandPalette.menu());
  }
}
