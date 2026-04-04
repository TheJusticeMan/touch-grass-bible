import { UIComponent } from "@touchgrass/framework";
import { VerseRef } from "src/models/VerseRef";
import { LayoutNode, View } from "@touchgrass/framework";
import type { JournalDay, JournalEntry, JournalStorage } from "./journal-storage";
import "./JournalPanel.css";

const LOAD_OLDER_THRESHOLD_PX = 120;

type EditableJournalEntryOptions = {
  onDelete?: (entry: JournalEntry) => void;
  onDraftFocus?: (entry: JournalEntry) => Promise<JournalEntry | null>;
};

type JournalPanelPlugin = {
  settings: {
    appendOnly: boolean;
  };
  storage: JournalStorage;
  saveSettings: () => Promise<void>;
};

/**
 * An editable journal entry component that extends UIComponent.
 * Renders a single journal entry with inline editing capabilities.
 * Supports save on blur and revert on Escape.
 */
class EditableJournalEntry extends UIComponent<"article"> {
  private contentEl!: UIComponent<"div">;
  private timeEl!: UIComponent<"div">;
  private lastSavedValue: string;
  private isHandlingDraftFocus = false;

  constructor(
    parent: HTMLElement,
    private dayKey: string,
    private entry: JournalEntry,
    private storage: JournalStorage,
    private options: EditableJournalEntryOptions = {},
  ) {
    super(parent, "article");
    this.lastSavedValue = entry.content;
    this.setupElement();
  }

  private setupElement(): void {
    this.addClass("journal-entry", "is-text");

    this.contentEl = new UIComponent(this.element, "div")
      .addClass("journal-entry-content", "journal-entry-editor")
      .setAttr("contenteditable", "true")
      .setAttr("role", "textbox")
      .setAria({
        multiline: true,
        label: "Journal entry",
      })
      .setText(this.entry.content);

    this.contentEl.listen("focus", () => void this.handleFocus());

    this.contentEl.listen("blur", () => void this.saveEdit());

    this.contentEl.listen("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        this.contentEl.element.blur();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        this.contentEl.element.textContent = this.lastSavedValue;
        this.contentEl.element.blur();
      }
    });

    this.timeEl = new UIComponent(this.element, "div").addClass("journal-entry-time");
    this.renderTimestamp();
  }

  applySavedEntry(saved: JournalEntry): void {
    this.entry.id = saved.id;
    this.entry.timestamp = saved.timestamp;
    this.entry.content = saved.content;
    this.lastSavedValue = saved.content;
    this.renderTimestamp();
  }

  private async handleFocus(): Promise<void> {
    if (this.entry.id || !this.options.onDraftFocus || this.isHandlingDraftFocus) {
      return;
    }

    this.isHandlingDraftFocus = true;
    try {
      const saved = await this.options.onDraftFocus(this.entry);
      if (saved) {
        this.applySavedEntry(saved);
      }
    } finally {
      this.isHandlingDraftFocus = false;
    }
  }

  private renderTimestamp(): void {
    const hasTimestamp = this.entry.timestamp > 0;
    this.timeEl.setHidden(!hasTimestamp);
    this.timeEl.setText(hasTimestamp ? formatEntryTime(this.entry.timestamp) : "");
  }

  private async saveEdit(): Promise<void> {
    const nextValue = (this.contentEl.element.textContent ?? "").trim();
    const lastSavedTrimmed = this.lastSavedValue.trim();

    if (await this.deleteEmptyPersistedEntry(nextValue)) {
      return;
    }

    if (nextValue === lastSavedTrimmed) {
      return;
    }

    if (nextValue === "") {
      this.restoreLastSavedValue();
      return;
    }

    const saved = this.entry.id
      ? await this.updatePersistedEntry(nextValue)
      : await this.createDraftEntry(nextValue);

    if (!saved) {
      this.restoreLastSavedValue();
      return;
    }

    this.applySavedEntry(saved);
    this.contentEl.element.textContent = saved.content;
  }

  private async deleteEmptyPersistedEntry(nextValue: string): Promise<boolean> {
    if (nextValue !== "" || !this.entry.id) {
      return false;
    }

    const deleted = await this.storage.deleteEntry(this.dayKey, this.entry.id);
    if (!deleted) {
      this.restoreLastSavedValue();
      return true;
    }

    this.options.onDelete?.(this.entry);
    this.element.remove();
    return true;
  }

  private async createDraftEntry(nextValue: string): Promise<JournalEntry | null> {
    return this.storage.appendEntry(
      {
        type: "entry",
        content: nextValue,
        timestamp: this.entry.timestamp > 0 ? this.entry.timestamp : undefined,
      },
      this.dayKey,
    );
  }

  private async updatePersistedEntry(nextValue: string): Promise<JournalEntry | null> {
    return this.storage.updateEntry(this.dayKey, this.entry.id, nextValue);
  }

  private restoreLastSavedValue(): void {
    this.contentEl.element.textContent = this.lastSavedValue;
  }
}

/**
 * A read-only journal entry component for verse references.
 * Displays the verse reference and its text content.
 */
class VerseRefEntry extends UIComponent<"article"> {
  constructor(
    parent: HTMLElement,
    private entry: JournalEntry,
  ) {
    super(parent, "article");
    this.setupElement();
  }

  private setupElement(): void {
    this.addClass("journal-entry", "is-verse-ref");

    let verseRef: VerseRef;
    try {
      // Parse the verse reference from OSIS format stored content
      verseRef = VerseRef.fromOSIS(this.entry.content);
    } catch {
      // If parsing fails, show error and return
      new UIComponent(this.element, "div")
        .addClass("journal-verse-ref", "error")
        .setText(`Invalid verse reference: ${this.entry.content}`);
      new UIComponent(this.element, "div")
        .addClass("journal-entry-time")
        .setText(formatEntryTime(this.entry.timestamp));
      return;
    }

    // Display the verse reference in human-readable format
    new UIComponent(this.element, "div").addClass("journal-verse-ref").setText(verseRef.toString());

    // Display the verse text
    const verseText = verseRef.vTXT;
    if (verseText) {
      new UIComponent(this.element, "div").addClass("journal-verse-text").setText(verseText);
    }

    new UIComponent(this.element, "div")
      .addClass("journal-entry-time")
      .setText(formatEntryTime(this.entry.timestamp));
  }
}

function formatDayHeader(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatEntryTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export class JournalPanel extends View {
  private loadedDays: JournalDay[] = [];
  private isLoadingOlder = false;
  private isCreatingDraft = false;
  private streamEl!: HTMLDivElement;
  private todayDraftEntry: JournalEntry | null = null;
  private todayDraftComponent: EditableJournalEntry | null = null;
  private readonly onStreamScroll = (): void => {
    if (this.streamEl.scrollTop < LOAD_OLDER_THRESHOLD_PX) {
      void this.loadOlderDay();
    }
  };

  constructor(
    panel: LayoutNode,
    private plugin: JournalPanelPlugin,
  ) {
    super(panel);
  }

  async onAttach(): Promise<void> {
    this.renderShell();
    await this.loadInitial();
    this.scrollToBottom(false);
  }

  onDetach(): void {
    this.streamEl?.removeEventListener("scroll", this.onStreamScroll);
    this.todayDraftEntry = null;
    this.todayDraftComponent = null;
  }

  onActivate(): void {
    // Panel activation logic
  }

  async addLiveEntry(entry: JournalEntry, dayKey: string): Promise<void> {
    const existing = this.findLoadedDay(dayKey);
    if (existing) {
      existing.entries.push(entry);
      this.insertRenderedEntry(dayKey, entry);
      this.scrollToBottom(true);
      return;
    }

    if (!this.isToday(dayKey)) {
      return;
    }

    const today = await this.plugin.storage.getOrCreateDay(dayKey);
    this.loadedDays.push(today);
    this.loadedDays.sort((a, b) => a.date.localeCompare(b.date));
    this.renderStream();
    this.scrollToBottom(true);
  }

  private renderShell(): void {
    this.containerEl.empty();

    this.streamEl = this.containerEl;
    this.streamEl.addClass("journal-stream");
    this.streamEl.addEventListener("scroll", this.onStreamScroll);
  }

  private async loadInitial(): Promise<void> {
    const todayKey = this.plugin.storage.todayKey();
    const today = await this.plugin.storage.getOrCreateDay(todayKey);
    this.loadedDays = [today];
    this.renderStream();
  }

  private async loadOlderDay(): Promise<void> {
    if (this.isLoadingOlder || this.loadedDays.length === 0) {
      return;
    }

    this.isLoadingOlder = true;

    try {
      const previous = await this.readPreviousDay();
      if (!previous) return;

      const previousHeight = this.streamEl.scrollHeight;
      this.loadedDays.unshift(previous);
      this.renderStream();
      const nextHeight = this.streamEl.scrollHeight;
      this.streamEl.scrollTop += nextHeight - previousHeight;
    } finally {
      this.isLoadingOlder = false;
    }
  }

  private renderStream(): void {
    this.resetRenderedState();

    this.loadedDays.forEach(day => this.renderDay(day));
  }

  private resetRenderedState(): void {
    this.streamEl.empty();
    this.todayDraftEntry = null;
    this.todayDraftComponent = null;
  }

  private renderDay(day: JournalDay): void {
    const dayGroup = this.streamEl.createEl("section", { cls: "journal-day" });
    dayGroup.dataset.dayKey = day.date;
    dayGroup.createEl("div", { cls: "journal-day-header", text: formatDayHeader(day.date) });

    day.entries.forEach(entry => this.renderEntry(dayGroup, day.date, entry));

    if (this.isToday(day.date)) {
      this.renderDraftEntry(dayGroup, day.date);
    }
  }

  private renderEntry(
    dayGroup: HTMLElement,
    dayKey: string,
    entry: JournalEntry,
    beforeEl: HTMLElement | null = null,
  ): void {
    if (entry.type === "verse-ref") {
      const component = new VerseRefEntry(dayGroup, entry);
      if (beforeEl) {
        dayGroup.insertBefore(component.element, beforeEl);
      }
      return;
    }

    const component = new EditableJournalEntry(dayGroup, dayKey, entry, this.plugin.storage, {
      onDelete: deletedEntry => this.removeEntryFromLoadedDay(dayKey, deletedEntry),
    });

    if (beforeEl) {
      dayGroup.insertBefore(component.element, beforeEl);
    }
  }

  private renderDraftEntry(dayGroup: HTMLElement, dayKey: string): void {
    const draftEntry = this.createDraftEntry();
    this.todayDraftEntry = draftEntry;
    this.todayDraftComponent = new EditableJournalEntry(dayGroup, dayKey, draftEntry, this.plugin.storage, {
      onDelete: deletedEntry => this.removeEntryFromLoadedDay(dayKey, deletedEntry),
      onDraftFocus: async () => this.materializeTodayDraft(dayKey, dayGroup),
    });
  }

  private createDraftEntry(): JournalEntry {
    return {
      id: "",
      timestamp: 0,
      type: "entry",
      content: "",
    };
  }

  private async materializeTodayDraft(dayKey: string, dayGroup: HTMLElement): Promise<JournalEntry | null> {
    const draftEntry = this.todayDraftEntry;
    if (!draftEntry || draftEntry.id || this.isCreatingDraft) {
      return null;
    }

    this.isCreatingDraft = true;
    try {
      const created = await this.plugin.storage.appendEntry(
        {
          type: "entry",
          content: "",
          timestamp: Date.now(),
        },
        dayKey,
      );

      if (!created) {
        return null;
      }

      draftEntry.id = created.id;
      draftEntry.timestamp = created.timestamp;
      draftEntry.content = created.content;
      this.findLoadedDay(dayKey)?.entries.push(draftEntry);

      if (this.todayDraftEntry === draftEntry) {
        this.todayDraftEntry = null;
        this.todayDraftComponent = null;
        this.renderDraftEntry(dayGroup, dayKey);
      }

      return draftEntry;
    } finally {
      this.isCreatingDraft = false;
    }
  }

  private findLoadedDay(dayKey: string): JournalDay | undefined {
    return this.loadedDays.find(day => day.date === dayKey);
  }

  private isToday(dayKey: string): boolean {
    return dayKey === this.plugin.storage.todayKey();
  }

  private async readPreviousDay(): Promise<JournalDay | null> {
    const oldestLoaded = this.loadedDays[0]?.date;
    if (!oldestLoaded) {
      return null;
    }

    const previousDayKey = await this.plugin.storage.getPreviousDayKey(oldestLoaded);
    if (!previousDayKey) {
      return null;
    }

    const previous = await this.plugin.storage.readDay(previousDayKey);
    if (!previous || this.loadedDays.some(day => day.date === previous.date)) {
      return null;
    }

    return previous;
  }

  private insertRenderedEntry(dayKey: string, entry: JournalEntry): void {
    const dayGroup = this.streamEl.querySelector<HTMLElement>(`[data-day-key="${dayKey}"]`);
    if (!dayGroup) {
      this.renderStream();
      return;
    }

    const beforeEl = this.isToday(dayKey) ? (this.todayDraftComponent?.element ?? null) : null;
    this.renderEntry(dayGroup, dayKey, entry, beforeEl);
  }

  private removeEntryFromLoadedDay(dayKey: string, entry: JournalEntry): void {
    const day = this.findLoadedDay(dayKey);
    if (!day) {
      return;
    }

    day.entries = day.entries.filter(candidate => candidate !== entry);
  }

  private scrollToBottom(smooth: boolean): void {
    this.streamEl.scrollTo({
      top: this.streamEl.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }
}

export { EditableJournalEntry };
