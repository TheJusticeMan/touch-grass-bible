import { SquarePen } from "lucide";
import Plugin from "../../core/Plugin";
import { OSIS, VerseRef } from "../../models/VerseRef";
import { myNotesCategoryID, TSKCrossRefCategoryID } from "../categoryIDs";
import { Note, NotesPanel, NoteVault } from "./NotesPanel";
import {
  CommandCategory,
  UnifiedCommandPalette,
  CommandPaletteState,
  CommandItem,
} from "src/external/CommandPalette";
import { TextArea } from "src/external/UIComponents";

interface NotesPluginSettings {
  myNotes: [string, string][];
  ExtraNotes: {
    name: string;
    content: string;
    dateCreated: string;
    dateModified: string;
  }[];
}

const defaultNotesSettings: NotesPluginSettings = {
  myNotes: [],
  ExtraNotes: [],
};

export default class NotesPlugin extends Plugin {
  myNotes = new OSISNotes(new Map<string, string>());
  Vault: NoteVault = new NoteVault();
  settings: NotesPluginSettings = defaultNotesSettings;

  async onload(): Promise<void> {
    this.settings = await this.loadSettings(defaultNotesSettings);

    if (this.app.settings.myNotes) {
      this.settings.myNotes = [...this.app.settings.myNotes];
      delete this.app.settings.myNotes;
      this.app.saveSettings();
    }
    this.myNotes = new OSISNotes(new Map(this.settings.myNotes));
    if (this.app.settings.ExtraNotes) {
      this.settings.ExtraNotes = [...this.app.settings.ExtraNotes];
      delete this.app.settings.ExtraNotes;
      this.app.saveSettings();
    }
    this.Vault.loadNotes(this.settings.ExtraNotes.map(nj => Note.fromJSON(nj)));

    this.registerPalette(() => new myNotesCategory(this.palette.instance, this), myNotesCategoryID);
    this.registerView("notes-panel", panel => {
      return new NotesPanel(panel, this);
    });
    this.addVerseAction({
      id: "add-note",
      name: "Add/edit note for this verse",
      description: "Create or edit a personal note for this verse",
      icon: SquarePen,
      onTrigger: verseInfo => {
        const noteInput = new TextArea(verseInfo.element)
          .setValue(this.myNotes.get(verseInfo.verse) || "")
          .addClass("note-area")
          .setPlaceholder(" - Add your note here...")
          .on("click", e => e.stopPropagation())
          .on("input", (value: string) => {
            this.myNotes.set(verseInfo.verse, value);
            this.app.saveSettingsAfterDelay();
          });
        noteInput.focus(); // Auto-focus for better UX
      },
    });
  }

  async saveSettings() {
    this.settings.myNotes = Array.from(this.myNotes.myNotes.entries());
    await super.saveSettings(this.settings);
  }
}
class myNotesCategory extends CommandCategory<VerseRef> {
  readonly name = "Notes";
  readonly description = "List of your personal notes on verses";
  notes: VerseRef[] = [];

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: NotesPlugin,
  ) {
    super(commandPalette);
  }

  onTrigger(_state: CommandPaletteState): void {
    this.notes = Array.from(this.plugin.myNotes.keys())

      .sort((a, b) => a.toString().localeCompare(b.toString()));
    this.title = "Notes";
  }

  getCommands(query: string): VerseRef[] {
    return this.getcompatible(query, this.notes, verse => this.plugin.myNotes.get(verse) || "");
  }

  renderCommand(verse: VerseRef, Item: CommandItem<VerseRef>) {
    Item.setTitle(verse.toString())
      .setDescription(this.plugin.myNotes.get(verse) || "No note")
      .addctx();
    return (state: CommandPaletteState) => {
      this.plugin.app.verseState.set(verse);
      return state.update({ topCategory: TSKCrossRefCategoryID });
    };
  }

  executeCommand(_command: VerseRef): void {
    this.commandPalette.close();
  }
}

export class OSISNotes {
  constructor(public myNotes: Map<OSIS, string>) {}

  get(verse: VerseRef): string {
    return this.myNotes.get(verse.OSIS) || "";
  }

  set(verse: VerseRef, note: string): void {
    if (note.trim() === "") {
      this.myNotes.delete(verse.OSIS);
    } else {
      this.myNotes.set(verse.OSIS, note);
    }
  }

  keys(): IterableIterator<VerseRef> {
    const iterator = this.myNotes.keys();
    return {
      [Symbol.iterator]() {
        return this;
      },
      next(): IteratorResult<VerseRef> {
        const result = iterator.next();
        if (result.done) {
          return { done: true, value: undefined };
        }
        return { done: false, value: VerseRef.fromOSIS(result.value) };
      },
    };
  }
}
