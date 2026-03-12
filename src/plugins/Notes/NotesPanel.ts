import { ChevronLeft, Plus, X } from "lucide";
import { Panel, View } from "../../external/Workspace";
import { Button, ETarget, IconButton, Openable, TextArea, TextInput, UIComponent } from "../../main";
import { myNotesCategoryID } from "../categoryIDs";
import NotesPlugin from "./Notes";
import "./NotesPanel.css";

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
    panel: Panel,
    public plugin: NotesPlugin,
  ) {
    super(panel);
    this.containerEl.classList.add("workspace-sidepanel", "right");
    this.content = this.containerEl.createEl("div", {
      cls: "sidepanel-content",
    });
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
    this.plugin.app.console.log("Saving notes to settings:", this.plugin.settings.ExtraNotes);
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
      .on("click", () => this.plugin.app.commandPalette.update({ topCategory: myNotesCategoryID }).open());
    this.plugin.Vault.getAllNotes()
      .sort((a, b) => b.dateModified.getTime() - a.dateModified.getTime())
      .forEach(note =>
        this.NotePreviews.push(
          new notePreview(this.content, note).on("click", () =>
            new noteEditor(this.plugin, this.content, note).open().on("close", () => this.update()),
          ),
        ),
      );
    // Create the bottom corner plus button
    this.content.createEl("div", { cls: "corner-button" }, el =>
      new Button(el)
        .setIcon(Plus)
        .setTooltip("Add Note")
        .on("click", () => {
          this.plugin.app.console.log("Add Note clicked");
          const newNote = new Note("New Note", "", new Date(), new Date());
          this.plugin.Vault.addNote(newNote);
          new noteEditor(this.plugin, this.content, newNote).open().on("close", () => this.update());
        }),
    );
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
    // class for styling
    this.element.classList.add("note-preview");
    this.element.addEventListener("click", () => this.emit("click"));
    this.update(note);
    note.on("change", this.update);
  }
  update = (note: Note) => {
    this.note = note;
    this.element.empty();
    // Title
    const titleEl = this.element.createEl("div", { cls: "note-title" });
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
    const contentEl = this.element.createEl("div", { cls: "note-content" });
    contentEl.textContent = truncatedText;
  };
  destroy() {
    this.note.off("change", this.update);
    super.destroy();
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
    this.element.classList.add("tag-badge");
    this.render();
  }
  render() {
    this.element.empty();
    const tagText = this.element.createEl("span", { cls: "tag-text" });
    tagText.textContent = this.tag;
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
 * This class extends {@link Openable} and manages the lifecycle of a note editor UI,
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
 * @extends Openable<TouchGrassBibleApp, { open: void; close: void }>
 *
 * @param app - The main application instance.
 * @param parent - The parent HTMLElement to which the editor overlay will be appended.
 * @param note - The note to be edited.
 */
class noteEditor extends Openable<{ open: void; close: void }> {
  content!: HTMLElement;
  constructor(
    private plugin: NotesPlugin,
    public parent: HTMLElement,
    public note: Note,
  ) {
    super(plugin.app);
  }
  onopen(): void {
    this.content = this.parent.createEl("div", { cls: "editor-overlay" });

    this.content.createEl("div", { cls: "editor-content" }, contentEd => {
      contentEd.createEl("header", { cls: "editor-header" }, headerEl => {
        new Button(headerEl)
          .setIcon(ChevronLeft)
          .addClass("editor-btn")
          .on("click", () => this.close());
        new TextInput(headerEl)
          .addClass("editor-title-input")
          .setValue(this.note.name + " # " + this.note.tags.join(", "))
          .on("input", (value: string) => {
            const [namePart, tags] = value.split("#");
            this.note.tags = tags ? tags.split(",").map(t => t.trim()) : [];
            this.note.name = namePart.trim();
            this.plugin.saveSettings();
          });
      });

      new TextArea(contentEd)
        .addClass("note-editor-textarea")
        .setValue(this.note.content)
        .on("input", (value: string) => {
          this.note.content = value;
          this.plugin.saveSettings();
        });
    });
  }
  onclose(): void {
    this.content.remove();
  }
}
