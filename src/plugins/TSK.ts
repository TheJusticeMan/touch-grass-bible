import { Waypoints } from "lucide";
import {
  CommandCategory,
  CommandItem,
  CommandPaletteState,
  UnifiedCommandPalette,
  VerseInfoComponent,
  VerseRef,
} from "../main";
import Plugin from "../Plugin";

export const TSKCrossRefCategoryID = "tsk-cross-ref";

type OSIS = string; // OSIS reference format, e.g., "Gen.1.1"

export default class TSK extends Plugin {
  crossRefs: { [OSIS: string]: [OSIS, number][] } = {};
  async onload(): Promise<void> {
    try {
      this.crossRefs = await this.app.loadJSON<{ [OSIS: string]: [OSIS, number][] }>("crossrefs.json");
    } catch (e) {
      this.console.error("Failed to load crossrefs.json. Cross references will be unavailable.", e);
    }
    this.registerPalette(() => new CrossRefCategory(this.app.commandPalette, this), TSKCrossRefCategoryID);

    this.addVerseAction({
      id: "cross-ref",
      name: "View cross references (TSK+)",
      icon: Waypoints,
      onTrigger: (verseInfo: VerseInfoComponent) => {
        this.app.verseState.set(verseInfo.verse);
        this.app.openCommandPalette({
          topCategory: TSKCrossRefCategoryID,
        } as CommandPaletteState);
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

class CrossRefCategory extends CommandCategory<VerseRef> {
  readonly name = "Cross references (TSK+)";
  readonly description = "Cross references for the selected verse";
  verses: VerseRef[] = [];

  constructor(
    public commandPalette: UnifiedCommandPalette,
    public plugin: TSK,
  ) {
    super(commandPalette);
  }

  onTrigger(): void {
    const verse = this.plugin.app.verseState.get();
    if (verse)
      void ((this.verses = this.plugin.crossRefsForVerse(verse)),
      (this.title = `Cross references for ${verse.toString()}`));
    else this.verses = [];
  }
  getCommands(query: string): VerseRef[] {
    return this.getcompatible(
      query,
      this.verses,
      verse => verse.toString(),
      verse => verse.vTXT,
    );
  }

  renderCommand(
    verse: VerseRef,
    Item: CommandItem<VerseRef>,
  ): (state: CommandPaletteState) => CommandPaletteState {
    Item.setTitle(verse.toString()).setDescription(verse.vTXT).addctx();

    return state => {
      this.plugin.app.verseState.set(verse);
      return state.update({ topCategory: TSKCrossRefCategoryID });
    };
  }

  executeCommand(): void {
    this.commandPalette.close();
  }
}
