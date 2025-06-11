import { sidePanel } from "./external/App";
import TouchGrassBibleApp from "./main";
import { VerseRef } from "./VerseRef";

export class notesPanel extends sidePanel<TouchGrassBibleApp> {
  currentFocus: HTMLTextAreaElement | null = null;
  constructor(app: TouchGrassBibleApp, parent: HTMLElement) {
    super(app, parent, "left");

    this.on("open", () => {
      if (this.currentFocus) {
        this.currentFocus.focus();
        this.currentFocus.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
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

          el.createEl(
            "textarea",
            {
              value: v.note,
              placeholder: ` - Add your note here...\n\n${v.vTXT.replace(/[\]\[#]/g, "").trim()}`,
            },
            textarea => {
              textarea.addEventListener("input", () => {
                v.note = textarea.value || "";
                this.app.saveSettingsAfterDelay();
              });
              if (v.isSame(verse)) this.currentFocus = textarea;
            }
          );
        });
      });

    this.content.createEl;
  }
}
