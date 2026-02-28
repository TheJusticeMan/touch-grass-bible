import { X } from "lucide";
import { CMD, CommandCategory, CommandItem, TGPaletteState, UnifiedCommandPalette, VerseRef } from "../main";
import Plugin from "../Plugin";

export default class Bookmark extends Plugin {
  tag = "Start Up Verses";

  async onload(): Promise<void> {
    if (window.location.hash) {
      const id = window.location.hash.substring(1);
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }

    this.registerPalette(
      () => new VerseListCategory(this.app.commandPalette, this),
      this.manifest.id + "-verse-list",
    );
  }
}

export class VerseListCategory extends CommandCategory<VerseRef> {
  readonly description = "List of opened verses";
  verses: VerseRef[] = [];
  name = "Open";
  isediting = false;

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: Bookmark,
  ) {
    super(commandPalette);
  }

  onTrigger(): void {
    new CMD(this.defaultCMD)
      .setName(this.isediting ? "Stop Editing Bookmark Tag" : "Edit Bookmark Tag")
      .on("_click", () => {
        this.isediting = !this.isediting;
        this.commandPalette.update({ topCategory: this.plugin.manifest.id + "-verse-list" }).display();
      });
    new CMD(this.defaultCMD).setName("Merge verses from the same chapter").on("_click", () => {
      const versesToKeep = VerseRef.Bookmarks.get(this.plugin.tag)
        .reverse()
        .reduce((acc: VerseRef[], v) => {
          if (!acc.some(av => av.isSameChapter(v))) acc.push(v);
          return acc;
        }, [])
        .reverse();
      VerseRef.Bookmarks.set(this.plugin.tag, ...versesToKeep);
      this.commandPalette.display();
      this.plugin.app.saveSettings();
    });
    this.title = `Bookmark tag: ${VerseListCategory.convertTopicDate(this.plugin.tag)}`;
    this.verses = VerseRef.Bookmarks.get(this.plugin.tag).reverse();
  }

  getCommands(query: string): VerseRef[] {
    return this.getcompatible(
      query,
      this.verses,
      verse => verse.toString(),
      verse => verse.vTXT,
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
            VerseRef.Bookmarks.remove(this.plugin.tag, verse);
            this.commandPalette.display();
            this.plugin.app.saveSettings();
          }),
      );
    }

    return { topCategory: this.plugin.manifest.id + "-cross-ref", verse, specificity: 0 };
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
