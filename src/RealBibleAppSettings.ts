import { VerseRef } from "./VerseRef";

export interface RealBibleAppSettings {
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
  workspaces: { currentVerses: VerseRef[] };
}

export const DEFAULT_SETTINGS: RealBibleAppSettings = {
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
  workspaces: {
    currentVerses: [
      new VerseRef("GENESIS", 1, 1),
      new VerseRef("JOHN", 3, 16),
      new VerseRef("PSALMS", 23, 2),
      new VerseRef("1 CORINTHIANS", 13, 4),
      new VerseRef("PHILIPPIANS", 4, 13),
      new VerseRef("ROMANS", 8, 28),
    ],
  },
};
