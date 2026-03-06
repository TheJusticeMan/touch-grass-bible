import { SquarePen } from "lucide";
import { CommandCategory, CommandItem, TextArea, UnifiedCommandPalette } from "../main";
import Plugin from "../Plugin";
import { TGPaletteState } from "../TGPaletteCategories";
import { VerseRef } from "../VerseRef";
import { TSKCrossRefCategoryID } from "./TSK";

export const myNotesCategoryID = "my-notes";

export default class NotesPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerPalette(() => new myNotesCategory(this.app.commandPalette, this), myNotesCategoryID);
    this.addVerseAction({
      id: "add-note",
      name: "Add/edit note for this verse",
      description: "Create or edit a personal note for this verse",
      icon: SquarePen,
      onTrigger: verseInfo => {
        const noteInput = new TextArea(verseInfo.element)
          .setValue(verseInfo.verse.note || "")
          .addClass("noteArea")
          .setPlaceholder(" - Add your note here...")
          .on("click", e => e.stopPropagation())
          .on("input", (value: string) => {
            verseInfo.verse.note = value;
            this.app.saveSettingsAfterDelay();
          });
        noteInput.focus(); // Auto-focus for better UX
      },
    });
  }
}
export class myNotesCategory extends CommandCategory<VerseRef> {
  readonly name = "Notes";
  readonly description = "List of your personal notes on verses";
  notes: VerseRef[] = [];

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: NotesPlugin,
  ) {
    super(commandPalette);
  }

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
    return { topCategory: TSKCrossRefCategoryID, verse };
  }

  executeCommand(_command: VerseRef): void {
    this.commandPalette.close();
  }
}
