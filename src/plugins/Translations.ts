import { CommandCategory, CommandPaletteState, CommandItem, UnifiedCommandPalette } from "../main";
import Plugin from "../Plugin";
import { TGPaletteState } from "../TGPaletteCategories";
import { VerseRef, translationMetadata, translation } from "../VerseRef";

export default class TranslationsPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerPalette(() => new translationCategory(this.app.commandPalette, this), "translations");
  }
}

export class translationCategory extends CommandCategory<string> {
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

  renderCommand(command: string, Item: CommandItem<string>): Partial<TGPaletteState> {
    Item.setTitle(translationMetadata[command]?.name || command).addctx();
    return { topCategory: "", defaultTranslation: command as translation };
  }

  executeCommand(command: string): void {
    VerseRef.defaultTranslation = command as translation;
    this.commandPalette.close();
  }
}
