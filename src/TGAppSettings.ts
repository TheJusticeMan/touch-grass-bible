import { VerseRef } from "./VerseRef";

export interface TGAppSettings {
  enableLogging: boolean;
  debug: boolean;
  reset: boolean;
  includeAI: boolean;
  flipPages: boolean;
  style: {
    Foreground: string;
    Background: string;
    EnhanceSpacing: boolean;
    Font: string;
    fontSize: number;
  };
  Bookmarks: { [key: string]: string[] };
  History: { [key: number]: string[] };
}

export const DEFAULT_SETTINGS: TGAppSettings = {
  enableLogging: true,
  debug: false,
  reset: false,
  includeAI: false,
  flipPages: false,
  style: {
    Foreground: "hsl(0, 100%, 100%)",
    Background: "hsl(0, 100%, 0%)",
    EnhanceSpacing: true,
    Font: "Fontserif",
    fontSize: 16,
  },
  Bookmarks: {
    "Start Up Verses": [
      new VerseRef("GENESIS", 1, 1).toOSIS(),
      new VerseRef("JOHN", 3, 16).toOSIS(),
      new VerseRef("PSALMS", 23, 2).toOSIS(),
      new VerseRef("1 CORINTHIANS", 13, 4).toOSIS(),
      new VerseRef("PHILIPPIANS", 4, 13).toOSIS(),
      new VerseRef("ROMANS", 8, 28).toOSIS(),
    ],
  },
  History: {},
};
