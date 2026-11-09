import { CommandCategory, CommandItem, CommandPaletteState, stateMapping, van } from "@touchgrass/framework";
import Plugin from "../core/Plugin";
import { translation } from "../models/VerseRef";
import { TranslationsCategoryID } from "./categoryIDs";

export default class TranslationsPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerPalette(TranslationsCategoryID, ({ state }) => new translationCategory(state, this));
  }

  async switchTranslation(newTranslation: translation): Promise<void> {
    await this.app.translationManager.loadTranslation(newTranslation);
    this.app.translationState.val = newTranslation;
    this.app.settingsStore.saveAfterDelay();
  }
}

class translationCategory extends CommandCategory<string> {
  allItems = van.state<string[]>([]);
  criteria: Array<(item: string) => string> = [
    str => this.plugin.app.translationManager.getTranslationDisplayName(str),
    str => this.plugin.app.translationManager.getTranslationShortName(str),
  ];

  constructor(
    state: stateMapping<CommandPaletteState>,
    public plugin: TranslationsPlugin,
  ) {
    super(state, "Translations", "List of available Bible translations");
    this.allItems = van.derive(() => this.plugin.app.translationManager.availableTranslations);
  }

  renderItem(command: string): CommandItem {
    return {
      title: this.plugin.app.translationManager.getTranslationDisplayName(command),
      description: this.plugin.app.translationManager.getTranslationShortName(command),
      click: () => (void this.plugin.switchTranslation(command as translation), true),
    };
  }
}
