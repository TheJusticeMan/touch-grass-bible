import { StackComponent, RowComponent, Button } from "src/external/Components";
import { LayoutNode, View } from "../../external/Workspace";
import type { JournalDay, JournalEntry, JournalStorage } from "./journal-storage";
import "./JournalPanel.css";

type JournalPanelPlugin = {
  settings: {
    appendOnly: boolean;
  };
  storage: JournalStorage;
  saveSettings: () => Promise<void>;
};

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
  private streamEl!: HTMLDivElement;
  private composerInput!: HTMLTextAreaElement;
  private appendOnlyToggle!: HTMLInputElement;
  private statusEl!: HTMLDivElement;

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

  onActivate(): void {
    this.syncAppendOnlyFromSettings();
  }

  async addLiveEntry(entry: JournalEntry, dayKey: string): Promise<void> {
    const existing = this.loadedDays.find(day => day.date === dayKey);
    if (existing) {
      existing.entries.push(entry);
      this.renderStream();
      this.scrollToBottom(true);
      return;
    }

    if (dayKey === this.plugin.storage.todayKey()) {
      const today = await this.plugin.storage.getOrCreateDay(dayKey);
      this.loadedDays.push(today);
      this.loadedDays.sort((a, b) => a.date.localeCompare(b.date));
      this.renderStream();
      this.scrollToBottom(true);
    }
  }

  private renderShell(): void {
    this.containerEl.empty();

    const root = new StackComponent(this.containerEl).addClass("journal-root").setGap(0);

    const header = new RowComponent(root.element).addClass("journal-header").setJustify("between");
    header.createChild("h3", { text: "Journal" });

    const controls = header.createChild("label", { cls: "journal-append-only" });
    this.appendOnlyToggle = controls.createEl("input", {
      attr: {
        type: "checkbox",
      },
    });
    controls.createEl("span", { text: "Append-only" });
    this.appendOnlyToggle.checked = this.plugin.settings.appendOnly;
    this.appendOnlyToggle.addEventListener("change", () => {
      this.plugin.settings.appendOnly = this.appendOnlyToggle.checked;
      void this.plugin.saveSettings();
      this.syncAppendOnlyFromSettings();
    });

    this.statusEl = root.element.createEl("div", { cls: "journal-status" });

    this.streamEl = root.element.createEl("div", { cls: "journal-stream" });
    this.streamEl.addEventListener("scroll", () => {
      if (this.streamEl.scrollTop < 120) {
        void this.loadOlderDay();
      }
    });

    const composer = new StackComponent(root.element).addClass("journal-composer").setGap("0.5rem");
    this.composerInput = composer.createChild("textarea", {
      attr: {
        rows: "3",
        placeholder: "Write your thoughts here...",
      },
    });

    new Button(composer.element).setButtonText("Append").on("click", () => {
      void this.handleAppend();
    });

    this.composerInput.addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void this.handleAppend();
      }
    });

    this.syncAppendOnlyFromSettings();
  }

  private syncAppendOnlyFromSettings(): void {
    if (!this.composerInput || !this.statusEl) return;
    const appendOnly = this.plugin.settings.appendOnly;
    this.appendOnlyToggle.checked = appendOnly;
    this.statusEl.textContent = appendOnly
      ? "Write-forward mode enabled. Previous entries are read-only."
      : "Editing mode enabled. New text is still appended at the bottom.";
    this.streamEl?.classList.toggle("append-only", appendOnly);
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
      const oldestLoaded = this.loadedDays[0]?.date;
      if (!oldestLoaded) return;

      const previousDayKey = await this.plugin.storage.getPreviousDayKey(oldestLoaded);
      if (!previousDayKey) return;

      const previous = await this.plugin.storage.readDay(previousDayKey);
      if (!previous) return;

      if (this.loadedDays.some(day => day.date === previous.date)) {
        return;
      }

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
    this.streamEl.empty();

    this.loadedDays.forEach(day => {
      const dayGroup = this.streamEl.createEl("section", { cls: "journal-day" });
      dayGroup.createEl("div", { cls: "journal-day-header", text: formatDayHeader(day.date) });

      day.entries.forEach(entry => {
        this.renderEntry(dayGroup, entry);
      });
    });
  }

  private renderEntry(parent: HTMLElement, entry: JournalEntry): void {
    const row = parent.createEl("article", {
      cls: `journal-entry ${entry.type === "verse-ref" ? "is-verse-ref" : "is-text"}`,
    });
    row.createEl("div", { cls: "journal-entry-time", text: formatEntryTime(entry.timestamp) });
    if (entry.type === "verse-ref") {
      const details = row.createEl("details", { cls: "journal-verse-collapse" });
      details.createEl("summary", { text: `Reading: ${entry.content}` });
      details.createEl("div", {
        cls: "journal-entry-content",
        text: "Verse reference captured from your reading history.",
      });
      return;
    }
    row.createEl("div", { cls: "journal-entry-content", text: entry.content });
  }

  private async handleAppend(): Promise<void> {
    const value = this.composerInput.value.trim();
    if (!value) {
      return;
    }

    const saved = await this.plugin.storage.appendEntry({
      type: "entry",
      content: value,
    });

    this.composerInput.value = "";
    await this.addLiveEntry(saved, this.plugin.storage.todayKey());
  }

  private scrollToBottom(smooth: boolean): void {
    this.streamEl.scrollTo({
      top: this.streamEl.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }
}
