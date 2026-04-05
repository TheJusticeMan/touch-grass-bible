import {
  CommandCategory,
  CommandItem,
  CommandPaletteState,
  UnifiedCommandPalette,
} from "@touchgrass/framework";
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
    this.registerPalette(
      () => new translationCategory(this.app.commandPalette, this),
      TranslationsCategoryID,
    );
  }

  async switchTranslation(newTranslation: translation): Promise<void> {
    await this.app.translationManager.loadTranslation(newTranslation);
    this.app.translationState.set(newTranslation);
    this.app.settingsStore.saveAfterDelay();
    this.app.emit("translation-changed", newTranslation);
  }
}

class translationCategory extends CommandCategory<string> {
  readonly name = "Translations";
  readonly description = "List of available Bible translations";
  translations!: string[];

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: TranslationsPlugin,
  ) {
    super(commandPalette);
  }

  onTrigger(_state: CommandPaletteState): void {
    void _state;
    this.translations = this.plugin.app.translationManager.availableTranslations;
  }

  getCommands(query: string): string[] {
    return this.getcompatible(query, this.translations, str => translationMetadata[str]?.name || str);
  }

  renderCommand(
    command: string,
    Item: CommandItem<string>,
  ): (state: CommandPaletteState) => CommandPaletteState {
    Item.setTitle(translationMetadata[command]?.name || command).addctx();
    return state => {
      void this.plugin.switchTranslation(command as translation);
      return state.update({ topCategory: "" });
    };
  }

  executeCommand(): void {
    this.commandPalette.close();
  }
}
