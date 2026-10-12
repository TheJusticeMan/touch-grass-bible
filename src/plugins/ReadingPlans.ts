import { CommandCategory, CommandItem, CommandPaletteState, stateMapping, van } from "@touchgrass/framework";
import Plugin from "../core/Plugin";
import { VerseRef } from "../models/VerseRef";
import { ReadingPlansCategoryID } from "./categoryIDs";

function resolveReadingBook(book: string): string {
  const normalized = book.trim().toLowerCase();
  return (
    VerseRef.booksOfTheBible.find(candidate => candidate.toLowerCase() === normalized) ?? book.toUpperCase()
  );
}

type ReadingPlan = {
  id: string;
  name: string;
  /** Each entry is [bookName, chapter] for one day's reading */
  readings: [string, number][];
};

const DEFAULT_PLANS: ReadingPlan[] = [
  {
    id: "nt-in-30",
    name: "New Testament in 30 Days",
    readings: [
      ["Matthew", 1],
      ["Matthew", 5],
      ["Matthew", 10],
      ["Matthew", 15],
      ["Matthew", 20],
      ["Matthew", 25],
      ["Mark", 1],
      ["Mark", 5],
      ["Mark", 10],
      ["Mark", 15],
      ["Luke", 1],
      ["Luke", 5],
      ["Luke", 10],
      ["Luke", 15],
      ["Luke", 20],
      ["John", 1],
      ["John", 5],
      ["John", 10],
      ["John", 15],
      ["John", 20],
      ["Acts", 1],
      ["Acts", 10],
      ["Acts", 20],
      ["Romans", 1],
      ["Romans", 8],
      ["1 Corinthians", 13],
      ["Galatians", 1],
      ["Ephesians", 1],
      ["Philippians", 4],
      ["Revelation", 1],
    ],
  },
];

type ReadingPlansSettings = {
  activePlanId: string;
  dayIndex: number;
  startDate: string;
};

const defaultSettings: ReadingPlansSettings = {
  activePlanId: "nt-in-30",
  dayIndex: 0,
  startDate: new Date().toISOString().slice(0, 10),
};

export default class ReadingPlansPlugin extends Plugin {
  settings: ReadingPlansSettings = { ...defaultSettings };

  async onload(): Promise<void> {
    this.settings = await this.loadSettings(defaultSettings);
    this.registerPalette(ReadingPlansCategoryID, ({ state }) => new ReadingPlanCategory(state, this));
  }

  get activePlan(): ReadingPlan | undefined {
    return DEFAULT_PLANS.find(p => p.id === this.settings.activePlanId);
  }

  get todayReading(): [string, number] | undefined {
    return this.activePlan?.readings[this.settings.dayIndex];
  }

  async advance(): Promise<void> {
    const plan = this.activePlan;
    if (!plan) return;
    this.settings.dayIndex = Math.min(this.settings.dayIndex + 1, plan.readings.length - 1);
    await this.saveSettings(this.settings);
  }
}

class ReadingPlanCategory extends CommandCategory<[string, number]> {
  allItems = van.state<[string, number][]>([]);
  criteria: Array<(item: [string, number]) => string> = [([book, ch]) => `${book} ${ch}`, ([book]) => book];

  constructor(
    state: stateMapping<CommandPaletteState>,
    public plugin: ReadingPlansPlugin,
  ) {
    super(state, "Reading Plans", "Your daily Bible reading plan");
    van.derive(() => {
      const plan = plugin.activePlan;
      this.allItems.val = plan ? plan.readings : [];
    });
  }

  renderItem([book, chapter]: [string, number]): CommandItem {
    const { dayIndex } = this.plugin.settings;
    const index = (this.plugin.activePlan?.readings ?? []).findIndex(([b, c]) => b === book && c === chapter);
    const label = index === dayIndex ? `-> ${book} ${chapter}` : `${book} ${chapter}`;
    return {
      title: label,
      description: index < dayIndex ? "Completed" : index === dayIndex ? "Today's reading" : "Upcoming",
      click: () => {
        this.plugin.app.verseState.val = new VerseRef(resolveReadingBook(book), chapter, 1);
        if (index === dayIndex) void this.plugin.advance();
        return true;
      },
    };
  }
}
