import { CommandCategory, CommandPaletteState, stateMapping, van } from "@touchgrass/framework";
import Plugin from "../core/Plugin";
import { translation } from "../models/VerseRef";
import { TranslationsCategoryID } from "./categoryIDs";

const translationMetadata: {
  [key: string]: { name: string; shortName: string };
} = {
  KJV: { name: "King James Version", shortName: "KJV" },
  YLT: { name: "Young's Literal Translation", shortName: "YLT" },
  ASV: { name: "American Standard Version", shortName: "ASV" },
};

export default class TranslationsPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerPalette(TranslationsCategoryID, ({ state }) => new translationCategory(state, this));
  }

  async switchTranslation(newTranslation: translation): Promise<void> {
    await this.app.translationManager.loadTranslation(newTranslation);
    this.app.translationState.val = newTranslation;
    this.app.settingsStore.saveAfterDelay();
    this.app.emit("translation-changed", newTranslation);
  }
}

class translationCategory extends CommandCategory<string> {
  allItems = van.state<string[]>([]);
  criteria: Array<(item: string) => string> = [
    str => translationMetadata[str]?.name || str,
    str => translationMetadata[str]?.shortName || str,
  ];

  constructor(
    state: stateMapping<CommandPaletteState>,
    public plugin: TranslationsPlugin,
  ) {
    super(state, "Translations", "List of available Bible translations");
    this.allItems = van.derive(() => this.plugin.app.translationManager.availableTranslations);
  }

  renderItem(command: string) {
    return {
      title: translationMetadata[command]?.name || command,
      description: translationMetadata[command]?.shortName || command,
      click: () => (void this.plugin.switchTranslation(command as translation), true),
    };
  }

  executeCommand(): void {
    return;
  }
}
