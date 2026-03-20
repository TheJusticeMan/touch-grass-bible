import {
  CommandCategory,
  UnifiedCommandPalette,
  CommandPaletteState,
  CommandItem,
} from "src/external/CommandPalette";
import Plugin from "../core/Plugin";
import { VerseRef, translation } from "../models/VerseRef";
import { TranslationsCategoryID } from "./categoryIDs";

export const translationMetadata: {
  [key: string]: { name: string; shortName: string };
} = {
  KJV: { name: "King James Version", shortName: "KJV" },
  YLT: { name: "Young's Literal Translation", shortName: "YLT" },
  ASV: { name: "American Standard Version", shortName: "ASV" },
};

export default class TranslationsPlugin extends Plugin {
  defaultTranslation = this.palette.useState("KJV" as translation);
  async onload(): Promise<void> {
    this.registerPalette(() => new translationCategory(this.palette.instance, this), TranslationsCategoryID);
    this.registerStateChange(this.defaultTranslation, newTranslation => {
      VerseRef.defaultTranslation = newTranslation;
    });
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
    this.translations = Object.keys(VerseRef.bibleTranslations);
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
      this.plugin.defaultTranslation.set(command as translation);
      return state.update({ topCategory: "" });
    };
  }

  executeCommand(): void {
    this.commandPalette.close();
  }
}
