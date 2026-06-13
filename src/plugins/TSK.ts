import {
  CommandCategory,
  CommandItem,
  CommandPaletteDialog,
  CommandPaletteViewState
} from "@touchgrass/framework";
import { Waypoints } from "lucide";
import { VerseRef } from "src/models/VerseRef";
import Plugin from "../core/Plugin";
import { TSKCrossRefCategoryID } from "./categoryIDs";

type OSIS = string; // OSIS reference format, e.g., "Gen.1.1"

export default class TSK extends Plugin {
  crossRefs: { [OSIS: string]: [OSIS, number][] } = {};
  async onload(): Promise<void> {
    try {
      this.crossRefs = await this.app.files.loadJSON<{
        [OSIS: string]: [OSIS, number][];
      }>("crossrefs.json");
    } catch (e) {
      this.console.error("Failed to load crossrefs.json. Cross references will be unavailable.", e);
    }
    this.registerPalette((dialog) => new CrossRefCategory(dialog, this), TSKCrossRefCategoryID);

    this.addVerseAction({
      id: "cross-ref",
      name: "View cross references (TSK+)",
      description:
        "View cross references for this verse from the Treasury of Scripture Knowledge and related resources",
      icon: Waypoints,
      isAvailable: verseInfo => this.crossRefsForVerse(verseInfo.verse).length > 0,
      onTrigger: verseInfo => {
        this.app.verseState.val = verseInfo.verse;
        this.app.openCommandPalette({
          topCategory: TSKCrossRefCategoryID,
        } as CommandPaletteViewState);
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
    public dialog: CommandPaletteDialog,
    public plugin: TSK,
  ) {
    super(dialog);
  }

  onTrigger(): void {
    const verse = this.plugin.app.verseState.val;
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
  ): Partial<CommandPaletteViewState> | (() => Partial<CommandPaletteViewState>) {
    Item.setTitle(verse.toString()).setDescription(verse.vTXT).addctx();

    return () => {
      this.plugin.app.verseState.val = verse;
      return { topCategory: TSKCrossRefCategoryID };
    };
  }

  executeCommand(): void {
    this.dialog.palette.close();
  }
}
