import { CommandCategory, CommandPaletteState, stateMapping, van } from "@touchgrass/framework";
import { SquarePen } from "lucide";
import Plugin from "../../core/Plugin";
import { OSIS, VerseRef } from "../../models/VerseRef";
import { myNotesCategoryID, TSKCrossRefCategoryID } from "../categoryIDs";
import {
  NoteEditorFloatingView,
  NoteEditorFloatingViewID,
  NotesPanel,
  NoteVault,
  type SerializedNote,
} from "./NotesPanel.ts";
const { textarea } = van.tags;

interface NotesPluginSettings {
  myNotes: [string, string][];
  ExtraNotes: SerializedNote[];
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
      this.app.settingsStore.save();
    }
    this.myNotes = new OSISNotes(new Map(this.settings.myNotes));
    if (this.app.settings.ExtraNotes) {
      this.settings.ExtraNotes = [...this.app.settings.ExtraNotes];
      delete this.app.settings.ExtraNotes;
      this.app.settingsStore.save();
    }
    this.Vault.loadNotes(this.settings.ExtraNotes);

    this.registerPalette(myNotesCategoryID, ({ state }) => new myNotesCategory(state, this));
    this.registerView("notes-panel", () => new NotesPanel(this));
    this.registerView(NoteEditorFloatingViewID, () => new NoteEditorFloatingView(this));
    this.addVerseAction({
      id: "add-note",
      name: "Add/edit note for this verse",
      description: "Create or edit a personal note for this verse",
      icon: SquarePen,
      onTrigger: verseInfo => {
        const noteTextarea = textarea({
          class: "note-area",
          placeholder: " - Add your note here...",
          value: this.myNotes.get(verseInfo.verse) || "",
          onclick: (e: Event) => e.stopPropagation(),
          oninput: (e: Event) => {
            const value = (e.target as HTMLTextAreaElement).value;
            this.myNotes.set(verseInfo.verse, value);
            this.app.settingsStore.saveAfterDelay();
          },
        });
        van.add(verseInfo.element, noteTextarea);
        noteTextarea.focus();
      },
    });
  }

  async saveSettings() {
    this.settings.myNotes = Array.from(this.myNotes.myNotes.entries());
    await super.saveSettings(this.settings);
  }
}

class myNotesCategory extends CommandCategory<VerseRef> {
  allItems = van.state<VerseRef[]>([]);
  criteria: Array<(item: VerseRef) => string> = [
    verse => verse.toString(),
    verse => this.plugin.myNotes.get(verse) || "",
  ];

  constructor(
    state: stateMapping<CommandPaletteState>,
    public plugin: NotesPlugin,
  ) {
    super(state, "Notes", "List of your personal notes on verses");
    this.allItems = van.derive(() => {
      this.title.val = "Notes";
      return Array.from(this.plugin.myNotes.keys()).sort((a, b) => a.toString().localeCompare(b.toString()));
    });
  }

  renderItem(verse: VerseRef) {
    const openCrossRef = this.context(() => {
      this.plugin.app.verseState.val = verse;
      return { topCategory: TSKCrossRefCategoryID };
    });

    return {
      title: verse.toString(),
      description: this.plugin.myNotes.get(verse) || "No note",
      ...openCrossRef,
      click: openCrossRef.context,
    };
  }

  executeCommand(): void {
    return;
  }
}

class OSISNotes {
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
