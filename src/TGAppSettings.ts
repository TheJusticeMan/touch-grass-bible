import { BibleTopicsType } from "./BibleTopics";
import { VerseRef } from "./VerseRef";

export interface TGAppSettings {
  enableLogging: boolean;
  showHelp: boolean;
  style: {
    Foreground: string;
    Background: string;
    EnhanceSpacing: boolean;
    Font: string;
    fontSize: number;
  };
  Bookmarks: BibleTopicsType;
}

export const DEFAULT_SETTINGS: TGAppSettings = {
  enableLogging: true,
  showHelp: true,
  style: {
    Foreground: "hsl(0, 100%, 100%)",
    Background: "hsl(0, 100%, 0%)",
    EnhanceSpacing: true,
    Font: "Fontserif",
    fontSize: 16,
  },
  Bookmarks: {
    "Start Up Verses": [
      [new VerseRef("GENESIS", 1, 1).toOSIS(), 0],
      [new VerseRef("JOHN", 3, 16).toOSIS(), 0],
      [new VerseRef("PSALMS", 23, 2).toOSIS(), 0],
      [new VerseRef("1 CORINTHIANS", 13, 4).toOSIS(), 0],
      [new VerseRef("PHILIPPIANS", 4, 13).toOSIS(), 0],
      [new VerseRef("ROMANS", 8, 28).toOSIS(), 0],
    ],
  },
};
