import { ChevronLeft, Plus, X } from "lucide";
import { LayoutNode, View, WorkspaceDialog } from "../../external/Workspace";
import { myNotesCategoryID } from "../categoryIDs";
import NotesPlugin from "./Notes";
import "./NotesPanel.css";
import {
  TextInput,
  Button,
  UIComponent,
  IconButton,
  RowComponent,
  TextArea,
} from "src/external/UIComponents";
import { ETarget } from "src/external/Event";

export class Note extends ETarget<{ change: Note }> {
  private _name: string;
  public get name(): string {
    return this._name;
  }
  public set name(value: string) {
    this._name = value;
    this.emit("change", this);
  }
  private _content: string;
  public get content(): string {
    return this._content;
  }
  public set content(value: string) {
    this._content = value;
    this.emit("change", this);
  }
  private _dateCreated: Date;
  public get dateCreated(): Date {
    return this._dateCreated;
  }
  public set dateCreated(value: Date) {
    this._dateCreated = value;
    this.emit("change", this);
  }
  private _dateModified: Date;
  public get dateModified(): Date {
    return this._dateModified;
  }
  public set dateModified(value: Date) {
    this._dateModified = value;
    this.emit("change", this);
  }

  private _tags: string[];
  public get tags(): string[] {
    return this._tags;
  }
  public set tags(value: string[]) {
    this._tags = value;
    this.emit("change", this);
  }

  constructor(name: string, content: string, dateCreated: Date, dateModified: Date, tags: string[] = []) {
    super();
    this._name = name;
    this._content = content;
    this._dateCreated = dateCreated;
    this._dateModified = dateModified;
    this._tags = tags;
    this.on("change", () => {
      this._dateModified = new Date();
    });
  }

  get json() {
    return {
      name: this._name,
      content: this._content,
      dateCreated: this._dateCreated.toISOString(),
      dateModified: this._dateModified.toISOString(),
      tags: this._tags,
    };
  }

  static fromJSON(json: {
    name: string;
    content: string;
    dateCreated: string;
    dateModified: string;
    tags?: string[];
  }): Note {
    return new Note(
      json.name,
      json.content,
      new Date(json.dateCreated),
      new Date(json.dateModified),
      json.tags ?? [],
    );
  }
}

export class NoteVault {
  Notes: Note[] = [];
  constructor() {}

  loadNotes(notes: Note[]) {
    this.Notes = notes;
  }
  addNote(note: Note) {
    this.Notes.push(note);
  }

  removeNote(note: Note) {
    this.Notes = this.Notes.filter(n => n !== note);
  }

  getAllNotes(): Note[] {
    return this.Notes;
  }
}

/**
 * Notes view for managing and viewing notes.
 */
export class NotesPanel extends View {
  NotePreviews: notePreview[] = [];
  content: HTMLDivElement;
  constructor(
    panel: LayoutNode,
    public plugin: NotesPlugin,
  ) {
    super(panel);
    this.content = this.containerEl;
    // class for styling
    this.content.classList.add("notes-panel");
  }

  onActivate(): void {
    this.update();
  }

  onDeactivate(): void {
    this.saveNotesToSettings();
  }

  private saveNotesToSettings() {
    this.plugin.settings.ExtraNotes = this.plugin.Vault.getAllNotes().map(n => n.json);
    //this.plugin.app.console.log("Saving notes to settings:", this.plugin.settings.ExtraNotes);
    this.plugin.saveSettings();
  }

  update() {
    if (this.plugin.settings.ExtraNotes) this.saveNotesToSettings();
    this.NotePreviews.forEach(np => np.destroy());
    this.NotePreviews = [];
    this.content.empty();
    new TextInput(this.content)
      .setPlaceholder("Search Notes...")
      .addClass("search-notes-input")
      .setType("search")
      .on("click", () => this.plugin.app.openCommandPalette({ topCategory: myNotesCategoryID }));
    this.plugin.Vault.getAllNotes()
      .sort((a, b) => b.dateModified.getTime() - a.dateModified.getTime())
      .forEach(note =>
        this.NotePreviews.push(
          new notePreview(this.content, note).on("click", () =>
            new noteEditor(this.plugin, note).open().on("close", () => this.update()),
          ),
        ),
      );
    /* // Create the bottom corner plus button
    this.content.createEl("div", { cls: "corner-button" }, el =>
      new Button(el)
        .setIcon(Plus)
        .setTooltip("Add Note")
        .on("click", () => {
          this.plugin.app.console.log("Add Note clicked");
          const newNote = new Note("New Note", "", new Date(), new Date());
          this.plugin.Vault.addNote(newNote);
          new noteEditor(this.plugin, newNote).open().on("close", () => this.update());
        }),
    ); */
  }
}

//plan: like google keep
//- list of notes
//- each note can be edited
//- notes with verse refs
//- notes can be added/deleted
//- notes can be tagged with topics
//- notes searchable
//- add note button
//- notes saved in settings JSON

/**
 * Preview square for notes
 * @method constructor - Initializes the note preview with truncated text and title.
 * @param {HTMLElement} parent - The parent element to attach the preview to.
 * @param {Note} note - The note to preview.
 * @extends UIComponent<"div">
 */
class notePreview extends UIComponent<"div"> {
  constructor(
    parent: HTMLElement,
    public note: Note,
  ) {
    super(parent, "div");
    this.addClass("note-preview");
    this.listen("click", () => this.emit("click"));
    this.update(note);
    note.on("change", this.update);
  }
  update = (note: Note) => {
    this.note = note;
    this.clearChildren();
    // Title
    const titleEl = this.createChild("div", { cls: "note-title" });
    titleEl.textContent = note.name;
    note.tags.forEach(tag => {
      new tagBadge(titleEl, tag, (removedTag: string) => {
        note.tags = note.tags.filter(t => t !== removedTag);
        this.update(note);
      });
    });
    new IconButton(titleEl)
      .setIcon(Plus)
      .addClass("add-tag-btn")
      .setTooltip("Add Tag")
      .on("click", e => {
        e.stopPropagation();
        new TextInput(titleEl)
          .setPlaceholder("New Tag")
          .addClass("new-tag-input")
          .setType("text")
          .on("input", (value: string) => {
            if (value.includes(","))
              if (value.trim() && !note.tags.includes(value.trim())) {
                note.tags = [...note.tags, value.trim().replace(",", "")];
                this.update(note);
              }
          });
      });
    // Content (truncated)
    const truncatedText = note.content.length > 100 ? note.content.substring(0, 100) + "..." : note.content;
    this.createChild("div", { cls: "note-content", text: truncatedText });
  };
  destroy() {
    this.note.off("change", this.update);
    return super.destroy();
  }
}

/**
 * Represents a badge UI component for displaying a tag with a remove button.
 *
 * @remarks
 * The `tagBadge` class extends the `Component<"div">` base class and is used to render a tag label
 * along with a button to remove the tag. When the remove button is clicked, the provided `onRemove`
 * callback is invoked with the tag string, and the badge is destroyed.
 *
 * @example
 * ```typescript
 * new tagBadge(parentElement, "example-tag", tag => {
 *   // Handle tag removal
 * });
 * ```
 *
 * @param parent - The parent HTML element to which the badge will be appended.
 * @param tag - The tag string to display in the badge.
 * @param onRemove - Callback function invoked when the remove button is clicked.
 */
class tagBadge extends UIComponent<"div"> {
  constructor(
    parent: HTMLElement,
    public tag: string,
    public onRemove: (tag: string) => void,
  ) {
    super(parent, "div");
    this.addClass("tag-badge");
    this.render();
  }
  render() {
    this.clearChildren();
    this.createChild("span", { cls: "tag-text", text: this.tag });
    new IconButton(this.element)
      .setIcon(X)
      .addClass("tag-remove-btn")
      .on("click", e => {
        e.stopPropagation();
        this.onRemove(this.tag);
        this.destroy();
      });
  }
}

/**
 * Represents an editor overlay for editing a note within the TouchGrassBibleApp.
 *
 * This class manages the lifecycle of a workspace dialog-backed note editor UI,
 * including opening and closing the editor, and handling user input for note title and content.
 *
 * @remarks
 * - The editor UI is rendered as a child of the provided parent HTMLElement.
 * - Changes to the note's title and content are immediately reflected in the {@link Note} instance.
 *
 * @example
 * ```typescript
 * const editor = new noteEditor(app, parentElement, note);
 * editor.open();
 * ```
 *
 * @param app - The main application instance.
 * @param note - The note to be edited.
 */
class noteEditor extends ETarget<{ open: void; close: void }> {
  private dialog: WorkspaceDialog | null = null;

  constructor(
    private plugin: NotesPlugin,
    public note: Note,
  ) {
    super();
  }

  open(): this {
    if (this.dialog?.isOpen) {
      return this;
    }

    this.dialog = this.plugin.workspace.openDialog({
      id: `note-editor-${Date.now()}`,
      title: "",
      modal: false,
      closeOnEscape: true,
      closeOnBackdrop: false,
      showCloseButton: false,
      className: "note-editor-dialog",
      ariaLabel: "Note editor",
      width: "100vw",
      height: "100dvh",
      render: (contentEl: HTMLDivElement) => this.render(contentEl),
      onClose: () => {
        this.dialog = null;
        this.emit("close", undefined);
      },
    });

    this.emit("open", undefined);
    return this;
  }

  close(): this {
    this.dialog?.close();
    return this;
  }

  private render(contentEl: HTMLDivElement): void {
    contentEl.empty();
    const overlay = contentEl.createEl("div", { cls: "editor-overlay" });
    const content = overlay.createEl("div", { cls: "editor-content" });
    const header = new RowComponent(content).addClass("editor-header");
    new Button(header.element)
      .setIcon(ChevronLeft)
      .addClass("editor-btn")
      .on("click", () => this.close());
    new TextInput(header.element)
      .addClass("editor-title-input")
      .setValue(this.note.name + " # " + this.note.tags.join(", "))
      .on("input", (value: string) => {
        const [namePart, tags] = value.split("#");
        this.note.tags = tags ? tags.split(",").map(t => t.trim()) : [];
        this.note.name = namePart.trim();
        this.plugin.saveSettings();
      });
    new TextArea(content)
      .addClass("note-editor-textarea")
      .setValue(this.note.content)
      .on("input", (value: string) => {
        this.note.content = value;
        this.plugin.saveSettings();
      });
  }
}
