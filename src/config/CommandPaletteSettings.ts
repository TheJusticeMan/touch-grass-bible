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

export const COMMAND_PALETTE_CONFIG_NAME = "command-palette";

export interface CommandPaletteSettings {
  categoryOrder: string[];
  disabledPalettes: string[];
}

export const DEFAULT_COMMAND_PALETTE_SETTINGS: CommandPaletteSettings = {
  categoryOrder: DEFAULT_CATEGORY_ORDER,
  disabledPalettes: [],
};
