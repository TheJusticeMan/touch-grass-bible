import { App, van } from "@touchgrass/framework";
import { bibleData, translation, VerseRef } from "../models/VerseRef";

type TranslationMetadata = {
  name?: string;
  shortname?: string;
  module?: string;
  [key: string]: unknown;
};

export class TranslationManager {
  readonly availableTranslations: translation[] = ["KJV"];
  readonly loadingTranslations = van.state<translation[]>([]);
  readonly loadedTranslations = van.state<translation[]>([]);
  private readonly pendingLoads = new Map<translation, Promise<void>>();
  private readonly metadataByCode = new Map<translation, TranslationMetadata>();
  private readonly loadingSet = new Set<translation>();
  private metadataLoaded = false;

  constructor(private readonly app: App) {}

  normalizeVersion(version: translation): translation {
    return version.trim().toUpperCase();
  }

  getLoadedTranslation(version: translation): bibleData | undefined {
    const normalizedVersion = this.normalizeVersion(version);
    return VerseRef.bibleTranslations[normalizedVersion] ?? VerseRef.bibleTranslations[VerseRef.defaultTranslation];
  }

  async ensureLoaded(version: translation): Promise<bibleData | undefined> {
    const normalizedVersion = this.normalizeVersion(version);

    if (this.isLoaded(normalizedVersion)) {
      return this.getLoadedTranslation(normalizedVersion);
    }

    await this.loadTranslation(normalizedVersion);
    return this.getLoadedTranslation(normalizedVersion);
  }

  async loadAvailableTranslations(): Promise<void> {
    if (this.metadataLoaded) {
      return;
    }

    try {
      const metadata = await this.app.files.loadJSON<Record<string, TranslationMetadata>>(
        "assets/translations/metadata.json",
      );
      const available = new Set<translation>();

      for (const [code, entry] of Object.entries(metadata ?? {})) {
        const normalizedCode = String(entry?.shortname ?? code ?? "")
          .trim()
          .toUpperCase();
        if (!normalizedCode) continue;
        this.metadataByCode.set(normalizedCode, entry ?? {});
        available.add(normalizedCode);
      }

      if (available.size > 0) {
        this.availableTranslations.splice(0, this.availableTranslations.length, ...Array.from(available.values()));
      } else {
        this.availableTranslations.splice(0, this.availableTranslations.length, "KJV");
      }
    } catch (error) {
      this.app.console.warn?.("Failed to load translations metadata; defaulting to KJV only.", error);
      this.availableTranslations.splice(0, this.availableTranslations.length, "KJV");
    } finally {
      this.metadataLoaded = true;
    }
  }

  getTranslationMetadata(version: translation): TranslationMetadata | undefined {
    return this.metadataByCode.get(version);
  }

  getTranslationDisplayName(version: translation): string {
    const metadata = this.getTranslationMetadata(version);
    const displayName = typeof metadata?.name === "string" ? metadata.name.trim() : "";
    return displayName || version;
  }

  getTranslationShortName(version: translation): string {
    const metadata = this.getTranslationMetadata(version);
    const shortName = typeof metadata?.shortname === "string" ? metadata.shortname.trim() : "";
    return shortName || version;
  }

  async loadTranslation(version: translation): Promise<void> {
    if (!this.metadataLoaded) {
      await this.loadAvailableTranslations();
    }

    const normalizedVersion = this.normalizeVersion(version);

    if (VerseRef.bibleTranslations[normalizedVersion]) {
      this.loadedTranslations.val = [...new Set([...this.loadedTranslations.val, normalizedVersion])];
      return;
    }

    const existingLoad = this.pendingLoads.get(normalizedVersion);
    if (existingLoad) {
      await existingLoad;
      return;
    }

    this.loadingSet.add(normalizedVersion);
    this.loadingTranslations.val = Array.from(this.loadingSet);

    const loadTask = (async () => {
      this.app.console.log(`Loading translation ${normalizedVersion}`);
      const data = await this.app.files.loadJSON<bibleData>(`assets/translations/${normalizedVersion}.json`);
      VerseRef.bibleTranslations[normalizedVersion] = data;
      this.loadedTranslations.val = [...new Set([...this.loadedTranslations.val, normalizedVersion])];
      this.app.console.log(`Loaded translation ${normalizedVersion}`);
    })();

    this.pendingLoads.set(normalizedVersion, loadTask);

    try {
      await loadTask;
    } catch (error) {
      this.app.console.error(`Failed to load translation ${normalizedVersion}`, error);
      throw error;
    } finally {
      this.loadingSet.delete(normalizedVersion);
      this.loadingTranslations.val = Array.from(this.loadingSet);
      this.pendingLoads.delete(normalizedVersion);
    }
  }

  isLoaded(version: translation): boolean {
    const normalizedVersion = this.normalizeVersion(version);
    return !!VerseRef.bibleTranslations[normalizedVersion] || this.loadedTranslations.val.includes(normalizedVersion);
  }

  isLoading(version: translation): boolean {
    return this.loadingSet.has(this.normalizeVersion(version));
  }
}
