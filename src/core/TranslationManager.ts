import { App } from "@touchgrass/framework";
import { bibleData, translation, VerseRef } from "../models/VerseRef";

export class TranslationManager {
  readonly availableTranslations: translation[] = ["KJV", "ASV", "YLT"];
  private readonly pendingLoads = new Map<translation, Promise<void>>();

  constructor(private readonly app: App) {}

  async loadTranslation(version: translation): Promise<void> {
    if (VerseRef.bibleTranslations[version]) {
      return;
    }

    const existingLoad = this.pendingLoads.get(version);
    if (existingLoad) {
      await existingLoad;
      return;
    }

    const loadTask = (async () => {
      this.app.console.log(`Loading translation ${version}`);
      const data = await this.app.files.loadJSON<bibleData>(`translations/${version}.json`);
      VerseRef.bibleTranslations[version] = data;
      this.app.emit("translation-loaded", version);
      this.app.console.log(`Loaded translation ${version}`);
    })();

    this.pendingLoads.set(version, loadTask);

    try {
      await loadTask;
    } catch (error) {
      this.app.console.error(`Failed to load translation ${version}`, error);
      this.app.emit("translation-error", { version, error });
      throw error;
    } finally {
      this.pendingLoads.delete(version);
    }
  }

  isLoaded(version: translation): boolean {
    return !!VerseRef.bibleTranslations[version];
  }
}
