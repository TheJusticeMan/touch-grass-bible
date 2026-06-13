import {
  CommandCategory,
  CommandItem,
  CommandPaletteDialog,
  CommandPaletteViewState,
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
    this.registerPalette(dialog => new translationCategory(dialog, this), TranslationsCategoryID);
  }

  async switchTranslation(newTranslation: translation): Promise<void> {
    await this.app.translationManager.loadTranslation(newTranslation);
    this.app.translationState.val = newTranslation;
    this.app.settingsStore.saveAfterDelay();
    this.app.emit("translation-changed", newTranslation);
  }
}

class translationCategory extends CommandCategory<string> {
  readonly name = "Translations";
  readonly description = "List of available Bible translations";
  translations: string[] = [];

  constructor(
    public dialog: CommandPaletteDialog,
    public plugin: TranslationsPlugin,
  ) {
    super(dialog);
  }

  onTrigger(_state: CommandPaletteViewState): void {
    void _state;
    this.translations = this.plugin.app.translationManager.availableTranslations;
  }

  getCommands(query: string): string[] {
    return this.getcompatible(query, this.translations, str => translationMetadata[str]?.name || str);
  }

  renderCommand(
    command: string,
    Item: CommandItem<string>,
  ): Partial<CommandPaletteViewState> | (() => Partial<CommandPaletteViewState>) {
    Item.setTitle(translationMetadata[command]?.name || command).addctx();
    return () => {
      void this.plugin.switchTranslation(command as translation);
      return { topCategory: "" };
    };
  }

  executeCommand(): void {
    this.dialog.palette.close();
  }
}
