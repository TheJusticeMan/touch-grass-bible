import { VerseRef } from "src/VerseRef";
import TouchGrassBibleApp from "../../main";

export type JournalEntry = {
  id: string;
  timestamp: number;
  type: "entry" | "verse-ref";
  content: string;
};

export type JournalDay = {
  date: string;
  entries: JournalEntry[];
};

type JournalIndex = {
  dates: string[];
};

const JOURNAL_INDEX_PATH = "journal/index.json";

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export class JournalStorage {
  constructor(private app: TouchGrassBibleApp) {}

  todayKey(): string {
    return toDateKey(new Date());
  }

  getDayPath(dateKey: string): string {
    return `journal/${dateKey}.json`;
  }

  async readIndex(): Promise<JournalIndex> {
    try {
      const parsed = await this.app.platformBridge.files.readJsonFile<JournalIndex>(JOURNAL_INDEX_PATH);
      if (!Array.isArray(parsed?.dates)) {
        return { dates: [] };
      }
      return { dates: parsed.dates.filter(Boolean).sort() };
    } catch (_error) {
      return { dates: [] };
    }
  }

  async writeIndex(index: JournalIndex): Promise<void> {
    const normalized = Array.from(new Set(index.dates.filter(Boolean))).sort();
    await this.app.platformBridge.files.writeJsonFile(JOURNAL_INDEX_PATH, { dates: normalized });
  }

  async ensureDayInIndex(dateKey: string): Promise<void> {
    const index = await this.readIndex();
    if (!index.dates.includes(dateKey)) {
      index.dates.push(dateKey);
      await this.writeIndex(index);
    }
  }

  async readDay(dateKey: string): Promise<JournalDay | null> {
    try {
      const day = await this.app.platformBridge.files.readJsonFile<JournalDay>(this.getDayPath(dateKey));
      return {
        date: dateKey,
        entries: Array.isArray(day?.entries) ? day.entries : [],
      };
    } catch (_error) {
      return null;
    }
  }

  async writeDay(day: JournalDay): Promise<void> {
    await this.app.platformBridge.files.writeJsonFile(this.getDayPath(day.date), day);
    await this.ensureDayInIndex(day.date);
  }

  async getOrCreateDay(dateKey: string): Promise<JournalDay> {
    const existing = await this.readDay(dateKey);
    if (existing) {
      return existing;
    }
    const created: JournalDay = {
      date: dateKey,
      entries: [],
    };
    await this.writeDay(created);
    return created;
  }

  async appendEntry(
    entry: Omit<JournalEntry, "id" | "timestamp"> & { timestamp?: number },
    dateKey?: string,
  ): Promise<JournalEntry> {
    const key = dateKey ?? this.todayKey();
    const day = await this.getOrCreateDay(key);
    const timestamp = entry.timestamp ?? Date.now();
    const savedEntry: JournalEntry = {
      id: `${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp,
      type: entry.type,
      content: entry.content,
    };
    day.entries.push(savedEntry);
    await this.writeDay(day);
    return savedEntry;
  }

  async appendVerseRef(verse: VerseRef, timestamp: number = Date.now()): Promise<JournalEntry> {
    return this.appendEntry(
      {
        type: "verse-ref",
        content: verse.toString(),
        timestamp,
      },
      this.todayKey(),
    );
  }

  async getPreviousDayKey(beforeDate: string): Promise<string | null> {
    const index = await this.readIndex();
    const sorted = index.dates.sort();
    const currentIdx = sorted.indexOf(beforeDate);
    if (currentIdx <= 0) {
      return null;
    }
    return sorted[currentIdx - 1] ?? null;
  }
}
