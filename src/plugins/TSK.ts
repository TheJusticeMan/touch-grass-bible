import { CommandCategory, CommandPaletteState, stateMapping, van } from "@touchgrass/framework";
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
    this.registerPalette(TSKCrossRefCategoryID, ({ state }) => new CrossRefCategory(state, this));

    this.addVerseAction({
      id: "cross-ref",
      name: "View cross references (TSK+)",
      description:
        "View cross references for this verse from the Treasury of Scripture Knowledge and related resources",
      icon: Waypoints,
      isAvailable: verseInfo => this.crossRefsForVerse(verseInfo.verse).length > 0,
      onTrigger: verseInfo => {
        this.app.verseState.val = verseInfo.verse;
        this.app.commandPalette.open({
          topCategory: TSKCrossRefCategoryID,
        });
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
  allItems = van.state<VerseRef[]>([]);
  criteria: Array<(item: VerseRef) => string> = [verse => verse.toString(), verse => verse.vTXT];

  constructor(
    state: stateMapping<CommandPaletteState>,
    public plugin: TSK,
  ) {
    super(state, "Cross references (TSK+)", "Cross references for the selected verse");
    this.allItems = van.derive(() => {
      const verse = this.plugin.app.verseState.val;

      if (verse) {
        this.title.val = `Cross references for ${verse.toString()}`;
        return this.plugin.crossRefsForVerse(verse);
      }

      this.title.val = "Cross references (TSK+)";
      return [];
    });
  }

  renderItem(verse: VerseRef) {
    const openCrossRef = this.context(() => {
      this.plugin.app.verseState.val = verse;
      return { topCategory: TSKCrossRefCategoryID };
    });

    return {
      title: verse.toString(),
      description: verse.vTXT,
      ...openCrossRef,
      click: openCrossRef.context,
    };
  }

  executeCommand(): void {
    return;
  }
}
