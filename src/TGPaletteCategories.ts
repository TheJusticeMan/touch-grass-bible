import { CommandPaletteState, UnifiedCommandPalette } from "./external/App";
import { translation, VerseRef } from "./VerseRef";

export class TGPaletteState extends CommandPaletteState {
  verse: VerseRef = new VerseRef("GENESIS", 1, 1);
  specificity: number = 0; // 0: Book, 1: Chapter, 2: Verse, 3: Full Verse
  topic: string = "";
  tag: string = "Start Up Verses";
  defaultTranslation: translation = "KJV"; // Default translation for Bible references
  constructor(
    palette: UnifiedCommandPalette,
    public query: string,
  ) {
    super(palette, query);
  }
  update(partial: Partial<TGPaletteState> = {}): this {
    return Object.assign(Object.create(this), this, partial).makeValid();
  }
  makeValid(): TGPaletteState {
    if (!this.verse) this.verse = new VerseRef("GENESIS", 1, 1);
    if (!this.query) this.query = "";
    if (!this.tag) this.tag = "Start Up Verses";
    if (!this.topic) this.topic = "";
    return this;
  }
}
