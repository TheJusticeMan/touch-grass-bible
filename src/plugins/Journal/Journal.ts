import { LayoutNode, Menu, View } from "@touchgrass/framework";
import { Plus, Trash } from "lucide";
import van, { State } from "node_modules/vanjs-core/src/van";
import Plugin from "src/core/Plugin";
import { VerseRef } from "src/models/VerseRef";
import "./Journal.css";
const { div, button } = van.tags;

export const JournalCategoryID = "journal";
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

type JournalAnyEntry = JournalEntry | JournalVerseEntry;

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
}

class JournalPanel extends View {
  lastContent: HTMLElement | null = null;
  verse: State<VerseRef>;
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
                    null,
                )
                .filter(Boolean),
            ),
          ),
        ),
      ),
      button({ class: "add-button", onclick: () => this.addEntry() }, "Add Entry"),
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
      data.unshift(yearGroup);
    }

    let monthGroup = yearGroup.months.find(m => m.month === month);
    if (!monthGroup) {
      monthGroup = { month, days: [] };
      yearGroup.months.unshift(monthGroup);
    }

    let dayGroup = monthGroup.days.find(d => d.day === day);
    if (!dayGroup) {
      dayGroup = { day, entries: [] };
      monthGroup.days.unshift(dayGroup);
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

  private pruneEntry(entry: JournalEntry | JournalVerseEntry): void {
    const data = this.plugin.settings.data;

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
}
