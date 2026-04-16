import { LayoutNode, Menu, View } from "@touchgrass/framework";
import { Plus, Trash } from "lucide";
import van, { State } from "node_modules/vanjs-core/src/van";
import Plugin from "src/core/Plugin";
import { VerseRef } from "src/models/VerseRef";
import "./Journal.css";
const { div, button, img } = van.tags;

export const JournalViewID = "journal-panel";

type JournalEntry = {
  type: "text";
  time: string;
  content: string;
};

type JournalVerseEntry = {
  type: "verse";
  time: string;
  reference: string;
};

type JournalImageEntry = {
  type: "image";
  time: string;
  filePath: string;
  filename: string;
  mimeType: string;
};

type JournalAnyEntry = JournalEntry | JournalVerseEntry | JournalImageEntry;

type JournalSettings = {
  appendOnly: boolean;
  data: YearGroup[];
};

type DayGroup = {
  day: string;
  entries: JournalAnyEntry[];
};

type MonthGroup = {
  month: string;
  days: DayGroup[];
};

type YearGroup = {
  year: string;
  months: MonthGroup[];
};

const defaultJournalSettings: JournalSettings = {
  appendOnly: false,
  data: [],
};

export default class JournalPlugin extends Plugin {
  settings: JournalSettings = defaultJournalSettings;
  get journalGroups(): YearGroup[] {
    return this.settings.data;
  }

  async onload(): Promise<void> {
    this.settings = await this.loadSettings(defaultJournalSettings);

    this.registerView(JournalViewID, panel => new JournalPanel(panel, this));

    this.addVerseAction({
      id: "add-journal-verse-entry",
      name: "Add Journal Verse Entry",
      description: "Add a verse reference as a journal entry.",
      icon: Plus,
      isAvailable: () => true,
      onTrigger: info => (
        info.render(),
        this.app.workspace.getActiveViewOfType<JournalPanel>(JournalViewID)?.addVerseEntry(info.verse)
      ),
    });
  }

  async saveSettings(): Promise<void> {
    await super.saveSettings(this.settings);
  }

  buildImageFilePath(filename: string): string {
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = safeName.includes(".") ? safeName.slice(safeName.lastIndexOf(".")) : ".img";
    const now = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    return `journal/images/${now}-${rand}${ext}`;
  }
}

class JournalPanel extends View {
  lastContent: HTMLElement | null = null;
  verse: State<VerseRef>;
  imageStateByPath: Map<string, State<string>> = new Map();
  imageObjectUrlByPath: Map<string, string> = new Map();
  loadingImagePaths: Set<string> = new Set();
  constructor(
    panel: LayoutNode,
    public plugin: JournalPlugin,
  ) {
    super(panel);
    this.title = "Journal";
    this.verse = van.state(this.plugin.app.verseState.get());
    this.plugin.registerStateChange(
      this.plugin.app.verseState,
      value => (this.verse.val = value) /* , void this.onAttach() */,
    );
  }

  onActivate(): void {
    this.lastContent?.focus();
  }

  onAttach(): void {
    this.containerEl.empty();
    this.containerEl.addClass("journal-panel");

    const groupedEntries = this.plugin.journalGroups;
    const content = div(
      ...groupedEntries.map(({ year, months }) =>
        months.map(({ month, days }) =>
          days.map(({ day, entries }) =>
            div(
              { class: "day-group" },
              div({ class: "header" }, new Date(Number(year), Number(month) - 1, Number(day)).toDateString()),
              ...entries
                .map(
                  entry =>
                    (entry.type === "text" && this.entry(entry)) ||
                    (entry.type === "verse" && this.verseEntry(entry)) ||
                    (entry.type === "image" && this.imageEntry(entry)) ||
                    null,
                )
                .filter(Boolean),
            ),
          ),
        ),
      ),
      button({ class: "add-button", onclick: () => this.addEntry() }, "Add Entry"),
      button({ class: "add-button", onclick: () => void this.addImageEntry() }, "Add Image"),
      button(
        { class: "add-button", onclick: () => this.addVerseEntry(this.verse.val) },
        () => `Add ${this.verse.val.toString()}`,
      ),
    );
    this.containerEl.appendChild(content);
    this.lastContent = Array.from(content.querySelectorAll(".editor")).at(-1) as HTMLElement;
    this.lastContent?.focus();
  }

  private addEntry(): void {
    const entry: JournalEntry = { type: "text", time: this.getCurrentTime(), content: "" };
    this.appendEntry(entry);
  }

  addVerseEntry(reference: VerseRef): void {
    const entry: JournalVerseEntry = {
      type: "verse",
      time: this.getCurrentTime(),
      reference: reference.OSIS,
    };
    // check if the same verse entry already exists for today to prevent duplicates when using the verse action multiple times in a day
    const todayGroup = this.plugin.journalGroups[0]?.months[0]?.days[0];
    if (todayGroup) {
      const existing = todayGroup.entries.find(e => e.type === "verse" && e.reference === entry.reference);
      if (existing) this.pruneEntry(existing);
    }
    this.appendEntry(entry);
  }

  async addImageEntry(): Promise<void> {
    try {
      const selected = await this.pickImageBytes();
      if (!selected) return;

      const filePath = this.plugin.buildImageFilePath(selected.filename);
      await this.plugin.app.files.writeBinaryFile(filePath, selected.bytes);

      const entry: JournalImageEntry = {
        type: "image",
        time: this.getCurrentTime(),
        filePath,
        filename: selected.filename,
        mimeType: selected.mimeType,
      };
      this.appendEntry(entry);
    } catch (error) {
      this.plugin.app.console.error("Failed to add image journal entry", error);
    }
  }

  private getCurrentTime(): string {
    return new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  private getOrCreateTodayGroup(): DayGroup {
    const now = new Date();
    const year = String(now.getFullYear());
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    const data = this.plugin.settings.data;

    let yearGroup = data.find(g => g.year === year);
    if (!yearGroup) {
      yearGroup = { year, months: [] };
      data.push(yearGroup);
    }

    let monthGroup = yearGroup.months.find(m => m.month === month);
    if (!monthGroup) {
      monthGroup = { month, days: [] };
      yearGroup.months.push(monthGroup);
    }

    let dayGroup = monthGroup.days.find(d => d.day === day);
    if (!dayGroup) {
      dayGroup = { day, entries: [] };
      monthGroup.days.push(dayGroup);
    }

    return dayGroup;
  }

  private appendEntry(entry: JournalAnyEntry): void {
    const dayGroup = this.getOrCreateTodayGroup();
    dayGroup.entries.push(entry);
    void this.plugin.saveSettings();
    this.onAttach();
  }

  entry(journalEntry: JournalEntry): HTMLDivElement {
    return div(
      { class: "entry is-text", oncontextmenu: e => this.contextMenuHandler(e, journalEntry) },
      div(
        {
          contentEditable: true,
          class: "content editor",
          oninput: (e: Event) => {
            journalEntry.content = (e.target as HTMLElement).textContent ?? "";
          },
          onblur: (e: Event) => {
            const text = (e.target as HTMLElement).textContent ?? "";
            journalEntry.content = text;
            if (text.trim() === "") {
              this.pruneEntry(journalEntry);
              return;
            }
            void this.plugin.saveSettings();
          },
        },
        journalEntry.content,
      ),
      div({ class: "time" }, journalEntry.time),
    );
  }

  verseEntry(journalEntry: JournalVerseEntry): HTMLDivElement {
    const verse = VerseRef.fromOSIS(journalEntry.reference);
    return div(
      { class: "entry is-verse", oncontextmenu: e => this.contextMenuHandler(e, journalEntry) },
      div({ class: "ref" }, verse.toString()),
      div({ class: "text" }, verse.text(this.plugin.app.translationState.get())),
      div({ class: "time" }, journalEntry.time),
    );
  }

  imageEntry(journalEntry: JournalImageEntry): HTMLDivElement {
    const imageState = this.getImageState(journalEntry);
    this.ensureImageLoaded(journalEntry, imageState);

    return div(
      { class: "entry is-image", oncontextmenu: e => this.contextMenuHandler(e, journalEntry) },
      img({
        class: "image",
        src: () => imageState.val,
        alt: journalEntry.filename,
        loading: "lazy",
      }),
      div({ class: "filename" }, journalEntry.filename),
      div({ class: "time" }, journalEntry.time),
    );
  }

  contextMenuHandler(e: MouseEvent, entry: JournalAnyEntry): Menu {
    e.preventDefault();
    return new Menu()
      .addItem(item => {
        item
          .setTitle("Remove Entry")
          .setIcon(Trash)
          .onClick(() => this.pruneEntry(entry));
      })
      .showAtMouseEvent(e);
  }

  private pruneEntry(entry: JournalAnyEntry): void {
    const data = this.plugin.settings.data;

    if (entry.type === "image") {
      const objectUrl = this.imageObjectUrlByPath.get(entry.filePath);
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        this.imageObjectUrlByPath.delete(entry.filePath);
      }
      this.imageStateByPath.delete(entry.filePath);
    }

    for (const yearGroup of data) {
      for (const monthGroup of yearGroup.months) {
        for (const dayGroup of monthGroup.days) {
          const idx = dayGroup.entries.indexOf(entry);
          if (idx === -1) continue;

          dayGroup.entries.splice(idx, 1);

          if (dayGroup.entries.length === 0) {
            monthGroup.days.splice(monthGroup.days.indexOf(dayGroup), 1);
          }
          if (monthGroup.days.length === 0) {
            yearGroup.months.splice(yearGroup.months.indexOf(monthGroup), 1);
          }
          if (yearGroup.months.length === 0) {
            data.splice(data.indexOf(yearGroup), 1);
          }

          void this.plugin.saveSettings();
          this.onAttach();
          return;
        }
      }
    }
  }

  private pickImageBytes(): Promise<{ bytes: Uint8Array; filename: string; mimeType: string } | null> {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";

      input.onchange = async event => {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }

        try {
          const buffer = await file.arrayBuffer();
          resolve({
            bytes: new Uint8Array(buffer),
            filename: file.name,
            mimeType: file.type || this.inferMimeTypeFromFilename(file.name),
          });
        } catch (error) {
          reject(error);
        }
      };

      input.click();
    });
  }

  private inferMimeTypeFromFilename(filename: string): string {
    const extension = filename.toLowerCase().split(".").pop();
    switch (extension) {
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "png":
        return "image/png";
      case "webp":
        return "image/webp";
      case "gif":
        return "image/gif";
      case "bmp":
        return "image/bmp";
      default:
        return "application/octet-stream";
    }
  }

  private getImageState(entry: JournalImageEntry): State<string> {
    const cached = this.imageStateByPath.get(entry.filePath);
    if (cached) {
      return cached;
    }

    const state = van.state("");
    this.imageStateByPath.set(entry.filePath, state);
    return state;
  }

  private ensureImageLoaded(entry: JournalImageEntry, state: State<string>): void {
    if (state.val !== "") return;
    if (this.loadingImagePaths.has(entry.filePath)) return;

    this.loadingImagePaths.add(entry.filePath);
    void this.plugin.app.files
      .readBinaryFile(entry.filePath)
      .then(content => {
        const buffer = content.buffer.slice(
          content.byteOffset,
          content.byteOffset + content.byteLength,
        ) as ArrayBuffer;
        const objectUrl = URL.createObjectURL(
          new Blob([buffer], {
            type: entry.mimeType || this.inferMimeTypeFromFilename(entry.filename),
          }),
        );
        const previousUrl = this.imageObjectUrlByPath.get(entry.filePath);
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl);
        }
        this.imageObjectUrlByPath.set(entry.filePath, objectUrl);
        state.val = objectUrl;
      })
      .catch(error => {
        this.plugin.app.console.error(`Failed to load journal image file ${entry.filePath}`, error);
      })
      .finally(() => {
        this.loadingImagePaths.delete(entry.filePath);
      });
  }
}
