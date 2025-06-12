import { sidePanel } from "./external/App";
import { TextArea } from "./external/Components";
import TouchGrassBibleApp from "./main";
import { VerseRef } from "./VerseRef";

export class notesPanel extends sidePanel<TouchGrassBibleApp> {
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
      .map((v, i) => new VerseRef(verse.book, verse.chapter, i + 1))
      .forEach(v => {
        this.content.createEl("div", { cls: ["note"] }, el => {
          el.createEl("span", { text: `${v.verse}`, cls: "verseNumber" });
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
