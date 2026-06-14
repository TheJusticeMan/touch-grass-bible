import van, { State } from "vanjs-core";
import { App } from "./App";
import {
  CommandPaletteSettings,
  COMMAND_PALETTE_CONFIG_NAME,
  DEFAULT_COMMAND_PALETTE_SETTINGS,
} from "./CommandPaletteSettings";
import { SettingsStore } from "./SettingsStore";

type IdCarrier = { id: string };
type WritableState<T> = { val: T };

export class PaletteSettingsController<TPalette extends IdCarrier> {
  private readonly settingsStore: SettingsStore<CommandPaletteSettings>;
  private readonly disabledPaletteIds = van.state<string[]>([]);
  private categoryOrder: string[] = [];
  private settingsInitialized = false;
  private applyingSettings = false;

  constructor(
    app: App,
    private readonly registeredPalettes: State<TPalette[]>,
    private readonly topCategory: WritableState<string>,
  ) {
    this.settingsStore = new SettingsStore<CommandPaletteSettings>({
      defaultValue: DEFAULT_COMMAND_PALETTE_SETTINGS,
      defaultSaveDelayMs: 500,
      fileManager: app.files,
      fileName: COMMAND_PALETTE_CONFIG_NAME,
    });
  }

  async initializeSettings(): Promise<void> {
    const settings = await this.settingsStore.load(DEFAULT_COMMAND_PALETTE_SETTINGS);
    this.applySettings(settings);
    this.settingsInitialized = true;
  }

  isCategoryDisabled(id: string): boolean {
    return this.disabledPaletteIds.val.includes(id);
  }

  setDisabledPalettes(ids: string[]): void {
    const normalized = [...new Set(ids)];
    this.disabledPaletteIds.val = normalized;

    if (normalized.includes(this.topCategory.val)) {
      this.topCategory.val = "";
    }

    this.onSettingsChanged();
  }

  disableCategory(id: string): void {
    if (this.isCategoryDisabled(id)) return;
    if (!this.registeredPalettes.val.some(p => p.id === id)) return;
    this.setDisabledPalettes([...this.disabledPaletteIds.val, id]);
  }

  enableCategory(id: string): void {
    if (!this.isCategoryDisabled(id)) return;
    this.setDisabledPalettes(this.disabledPaletteIds.val.filter(disabledId => disabledId !== id));
  }

  getDisabledPalettes(): string[] {
    return [...this.disabledPaletteIds.val];
  }

  setCategoryOrder(order: string[]): void {
    this.categoryOrder = [...order];
    this.applyCategoryOrder();
    this.onSettingsChanged();
  }

  getCategoryOrder(): string[] {
    return [...this.categoryOrder];
  }

  applyCategoryOrder(): void {
    if (!this.categoryOrder.length) return;

    const order = this.categoryOrder;
    this.registeredPalettes.val = [...this.registeredPalettes.val].sort((a, b) => {
      const ai = order.indexOf(a.id);
      const bi = order.indexOf(b.id);
      const aIndex = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
      const bIndex = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
      return aIndex - bIndex;
    });
  }

  private applySettings(settings: CommandPaletteSettings): void {
    this.applyingSettings = true;
    this.setCategoryOrder(settings.categoryOrder);
    this.setDisabledPalettes(settings.disabledPalettes);
    this.applyingSettings = false;
  }

  private onSettingsChanged(): void {
    if (!this.settingsInitialized || this.applyingSettings) return;
    this.settingsStore.saveAfterDelay({
      categoryOrder: this.getCategoryOrder(),
      disabledPalettes: this.getDisabledPalettes(),
    });
  }
}
