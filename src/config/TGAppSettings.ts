import { BibleTopicsType } from "../models/BibleTopics";

export const DEFAULT_CATEGORY_ORDER: string[] = [
  "verse-list",
  "tsk-cross-ref",
  "bookmarks",
  "go-to-verse",
  "topics",
  "bible-search",
  "ai-embedding-search",
  "translations",
  "my-notes",
  "journal",
  "settings",
  "ai",
];
export interface TGAppSettings {
  schemaVersion: number;
  enableLogging: boolean;
  showHelp: boolean;
  style: {
    Foreground: string;
    Background: string;
    EnhanceSpacing: boolean;
    Font: string;
    fontSize: number;
  };
  myNotes?: [string, string][]; // @deprecated, use Notes.ExtraNotes instead
  Bookmarks?: BibleTopicsType; // @deprecated, use Bookmarks.Bookmarks instead
  ExtraNotes?: {
    // @deprecated, use Notes.ExtraNotes instead
    name: string;
    content: string;
    dateCreated: string;
    dateModified: string;
  }[];
  categoryOrder: string[];
}

export const DEFAULT_SETTINGS: TGAppSettings = {
  schemaVersion: 1,
  enableLogging: true,
  showHelp: true,
  style: {
    Foreground: "hsl(0, 100%, 100%)",
    Background: "hsl(0, 100%, 0%)",
    EnhanceSpacing: true,
    Font: "Fontserif",
    fontSize: 16,
  },
  categoryOrder: DEFAULT_CATEGORY_ORDER,
};
