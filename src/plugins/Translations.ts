import { CommandCategory, CommandItem, CommandPaletteState, UnifiedCommandPalette } from "../main";
import Plugin from "../Plugin";
import { VerseRef, translation, translationMetadata } from "../VerseRef";
import { TranslationsCategoryID } from "./categoryIDs";

export default class TranslationsPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerPalette(
      () => new translationCategory(this.app.commandPalette, this),
      TranslationsCategoryID,
    );
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
      this.plugin.app.defaultTranslation.set(command as translation);
      return state.update({ topCategory: "" });
    };
  }

  executeCommand(command: string): void {
    VerseRef.defaultTranslation = command as translation;
    this.commandPalette.close();
  }
}
