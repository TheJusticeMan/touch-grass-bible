import { Waypoints } from "lucide";
import { CommandCategory, CommandItem, UnifiedCommandPalette, VerseInfoComponent, VerseRef } from "../main";
import Plugin from "../Plugin";
import { TGPaletteState } from "../TGPaletteCategories";

export const TSKCrossRefCategoryID = "tsk-cross-ref";

type OSIS = string; // OSIS reference format, e.g., "Gen.1.1"

export default class TSK extends Plugin {
  crossRefs: { [OSIS: string]: [OSIS, number][] } = {};
  async onload(): Promise<void> {
    this.crossRefs = await this.app.loadJSON<{ [OSIS: string]: [OSIS, number][] }>("crossrefs.json");
    this.registerPalette(() => new CrossRefCategory(this.app.commandPalette, this), TSKCrossRefCategoryID);

    this.addVerseAction({
      id: "cross-ref",
      name: "View cross references (TSK+)",
      icon: Waypoints,
      onTrigger: (verseInfo: VerseInfoComponent) => {
        this.app.openCommandPalette({
          topCategory: TSKCrossRefCategoryID,
          verse: verseInfo.verse,
        } as TGPaletteState);
      },
    });
  }

  crossRefsForVerse(verse: VerseRef): VerseRef[] {
    const osis = verse.toOSIS();
    const refs = this.crossRefs[osis] || [];
    return refs
      .sort(([, avotes], [, bvotes]) => bvotes - avotes)
      .map(([ref]) => VerseRef.fromOSIS(ref))
      .filter(ref => ref !== null);
  }
}

export class CrossRefCategory extends CommandCategory<VerseRef> {
  readonly name = "Cross references (TSK+)";
  readonly description = "Cross references for the selected verse";
  verses: VerseRef[] = [];

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: TSK,
  ) {
    super(commandPalette);
  }

  onTrigger(state: TGPaletteState): void {
    const { verse } = state;
    if (verse)
      void ((this.verses = this.plugin.crossRefsForVerse(verse)),
      (this.title = `Cross references for ${verse.toString()}`));
    else this.verses = [];
    /* new CMD(this.defaultCMD).setName("Clear cross reference filter").on("_click", () => {
      this.commandPalette.update({ verse: state.verse } as TGPaletteState).display();
    }); */
  }
  getCommands(query: string): VerseRef[] {
    return this.getcompatible(
      query,
      this.verses,
      verse => verse.toString(),
      verse => verse.vTXT,
    ); //.reverse();
  }

  renderCommand(verse: VerseRef, Item: CommandItem<VerseRef>): Partial<TGPaletteState> {
    Item.setTitle(verse.toString()).setDescription(verse.vTXT).addctx();

    return { topCategory: TSKCrossRefCategoryID, verse, specificity: 0 };
  }

  executeCommand(): void {
    this.commandPalette.close();
  }
}
