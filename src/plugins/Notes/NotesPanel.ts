import { ChevronLeft, Plus, X } from "lucide";
import { renderIcon, State, van, View } from "@touchgrass/framework";
import NotesPlugin from "./Notes";
import "./NotesPanel.css";

const { button, div, input, span, textarea } = van.tags;

export const NoteEditorFloatingViewID = "note-editor-floating";

export type SerializedNote = {
  name: string;
  content: string;
  dateCreated: string;
  dateModified: string;
  tags?: string[];
};

type NoteModel = {
  name: State<string>;
  content: State<string>;
  dateCreated: State<Date>;
  dateModified: State<Date>;
  tags: State<string[]>;
};

function createNoteModel(serialized: SerializedNote): NoteModel {
  return {
    name: van.state(serialized.name),
    content: van.state(serialized.content),
    dateCreated: van.state(new Date(serialized.dateCreated)),
    dateModified: van.state(new Date(serialized.dateModified)),
    tags: van.state(serialized.tags ?? []),
  };
}

function serializeNote(note: NoteModel): SerializedNote {
  return {
    name: note.name.val,
    content: note.content.val,
    dateCreated: note.dateCreated.val.toISOString(),
    dateModified: note.dateModified.val.toISOString(),
    tags: note.tags.val,
  };
}

type NoteEditorSession = {
  note: NoteModel;
};

const noteEditorSessions = new Map<string, NoteEditorSession>();

function createNoteEditorSession(note: NoteModel): string {
  const sessionId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  noteEditorSessions.set(sessionId, { note });
  return sessionId;
}

function getNoteEditorSession(sessionId: string): NoteEditorSession | undefined {
  return noteEditorSessions.get(sessionId);
}

function closeNoteEditorSession(sessionId: string): void {
  noteEditorSessions.delete(sessionId);
}

export class NoteVault {
  readonly notes = van.state<NoteModel[]>([]);

  loadNotes(notes: SerializedNote[]) {
    this.notes.val = notes.map(createNoteModel);
  }

  createNote(name = "New Note", content = "", tags: string[] = []): NoteModel {
    const now = new Date();
    return createNoteModel({
      name,
      content,
      dateCreated: now.toISOString(),
      dateModified: now.toISOString(),
      tags,
    });
  }

  addNote(note: NoteModel) {
    this.notes.val = [...this.notes.val, note];
  }

  removeNote(note: NoteModel) {
    this.notes.val = this.notes.val.filter(n => n !== note);
  }

  getAllNotes(): NoteModel[] {
    return this.notes.val;
  }

  serializeNotes(): SerializedNote[] {
    return this.notes.val.map(serializeNote);
  }

  touch(note: NoteModel): void {
    note.dateModified.val = new Date();
    this.notes.val = [...this.notes.val];
  }
}

type NoteEditorViewState = {
  sessionId: string;
  noteDateCreated: string;
  name: string;
  tags: string[];
  content: string;
};

export class NotesPanel extends View {
  readonly viewTypeId = "notes-panel";

  constructor(public plugin: NotesPlugin) {
    super("Notes", {});
  }

  create(): HTMLElement {
    return div(() =>
      div(
        { class: "notes-list" },
        button(
          {
            class: "add-note-btn",
            onclick: () => this.addNote(),
            title: "Create a new note",
          },
          renderIcon(Plus),
          "New Note",
        ),
        ...[...this.plugin.Vault.notes.val]
          .sort((a, b) => b.dateModified.val.getTime() - a.dateModified.val.getTime())
          .map(note => this.renderNotePreview(note)),
      ),
    );
  }

  onMount(): void {}

  onUnmount(): void {
    this.saveNotesToSettings();
  }

  private saveNotesToSettings() {
    this.plugin.settings.ExtraNotes = this.plugin.Vault.serializeNotes();
    void this.plugin.saveSettings();
  }

  private addNote(): void {
    const newNote = this.plugin.Vault.createNote();
    this.plugin.Vault.addNote(newNote);
    this.openEditor(newNote);
  }

  private openEditor(note: NoteModel): void {
    const sessionId = createNoteEditorSession(note);
    this.plugin.app.workspace.layoutController.addFloatingView(NoteEditorFloatingViewID, {
      sessionId,
      noteDateCreated: note.dateCreated.val.toISOString(),
      name: note.name.val,
      tags: [...note.tags.val],
      content: note.content.val,
    });
  }

  private renderNotePreview(note: NoteModel): HTMLElement {
    const showTagInput = van.state(false);
    const tagInputValue = van.state("");

    return div(
      {
        class: "note-preview",
        onclick: () => this.openEditor(note),
      },
      div(
        { class: "note-title" },
        span(note.name.val),
        div({ class: "note-tags" }, ...note.tags.val.map(tag => this.renderTagBadge(note, tag)), () =>
          showTagInput.val
            ? input({
                class: "note-tag-input",
                type: "text",
                placeholder: "Tag",
                value: tagInputValue,
                autofocus: true,
                oninput: e => {
                  tagInputValue.val = (e.target as HTMLInputElement).value;
                },
                onkeydown: e => {
                  if (e.key !== "Enter") return;
                  e.stopPropagation();
                  const nextTag = tagInputValue.val.trim();
                  if (nextTag && !note.tags.val.includes(nextTag)) {
                    note.tags.val = [...note.tags.val, nextTag];
                    this.plugin.Vault.touch(note);
                    this.saveNotesToSettings();
                  }
                  showTagInput.val = false;
                  tagInputValue.val = "";
                },
                onblur: () => {
                  showTagInput.val = false;
                  tagInputValue.val = "";
                },
                onclick: e => e.stopPropagation(),
              })
            : button(
                {
                  class: "add-tag-btn",
                  type: "button",
                  onclick: e => {
                    e.stopPropagation();
                    showTagInput.val = true;
                  },
                },
                "+",
              ),
        ),
      ),
      div(
        { class: "note-content" },
        note.content.val.length > 100 ? `${note.content.val.substring(0, 100)}...` : note.content.val,
      ),
    );
  }

  private renderTagBadge(note: NoteModel, tag: string): HTMLElement {
    return button(
      {
        class: "tag-badge",
        type: "button",
        onclick: e => {
          e.stopPropagation();
          note.tags.val = note.tags.val.filter(t => t !== tag);
          this.plugin.Vault.touch(note);
          this.saveNotesToSettings();
        },
      },
      span(tag),
      renderIcon(X),
    );
  }
}

export class NoteEditorFloatingView extends View<NoteEditorViewState> {
  readonly viewTypeId = NoteEditorFloatingViewID;

  private resolveCurrentNote(): NoteModel | null {
    const sessionId = this.state.sessionId.val;
    if (sessionId) {
      const session = getNoteEditorSession(sessionId);
      if (session?.note) {
        return session.note;
      }
    }

    return (
      this.plugin.Vault.getAllNotes().find(
        (note: NoteModel) => note.dateCreated.val.toISOString() === this.state.noteDateCreated.val,
      ) || null
    );
  }

  private readonly syncStateToNote = (): void => {
    const note = this.resolveCurrentNote();
    if (!note) return;

    note.name.val = this.state.name.val.trim();
    note.tags.val = this.state.tags.val;
    note.content.val = this.state.content.val;
    this.plugin.Vault.touch(note);
    void this.plugin.saveSettings();
  };

  constructor(public plugin: NotesPlugin) {
    super("Note", {
      sessionId: "",
      noteDateCreated: "",
      name: "",
      tags: [],
      content: "",
    });
  }

  serializeState(state: NoteEditorViewState): string {
    return JSON.stringify({
      sessionId: state.sessionId,
      noteDateCreated: state.noteDateCreated,
      name: state.name,
      tags: [...state.tags],
      content: state.content,
    });
  }

  deserializeState(str: string): NoteEditorViewState {
    let raw: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(str);
      if (typeof parsed === "object" && parsed !== null) {
        raw = parsed as Record<string, unknown>;
      }
    } catch {
      raw = {};
    }

    const tags = Array.isArray(raw.tags)
      ? raw.tags.filter((tag): tag is string => typeof tag === "string")
      : [];

    return {
      sessionId: typeof raw.sessionId === "string" ? raw.sessionId : "",
      noteDateCreated: typeof raw.noteDateCreated === "string" ? raw.noteDateCreated : "",
      name: typeof raw.name === "string" ? raw.name : "",
      tags,
      content: typeof raw.content === "string" ? raw.content : "",
    };
  }

  private removeCurrentNote = () => {
    const note = this.resolveCurrentNote();
    if (!note) return;

    this.plugin.Vault.removeNote(note);
    const sessionId = this.state.sessionId.val;
    if (sessionId) closeNoteEditorSession(sessionId);
    this.plugin.app.workspace.layoutController.removeViewInstance(this);
    void this.plugin.saveSettings();
  };

  create(): HTMLElement {
    return div(
      { class: "note-editor" },
      div(
        {
          class: "back-button",
          onclick: () => {
            this.plugin.app.workspace.layoutController.removeViewInstance(this);
          },
        },
        renderIcon(ChevronLeft),
        "Back to Notes",
      ),
      input({
        class: "note-title-input",
        type: "text",
        placeholder: "Note title...",
        value: () => this.state.name.val,
        oninput: e => {
          this.state.name.val = (e.target as HTMLInputElement).value;
          this.syncStateToNote();
        },
      }),
      textarea({
        class: "note-content-textarea",
        placeholder: "Start writing your note...",
        value: () => this.state.content.val,
        oninput: e => {
          this.state.content.val = (e.target as HTMLTextAreaElement).value;
          this.syncStateToNote();
        },
      }),
      div(
        {
          class: "delete-note-button",
          onclick: this.removeCurrentNote,
        },
        "Delete",
      ),
    );
  }

  onMount(): void {}

  onUnmount(): void {
    const sessionId = this.state.sessionId.val;
    if (sessionId) closeNoteEditorSession(sessionId);
  }
}
