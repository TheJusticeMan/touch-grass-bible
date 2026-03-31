import { deepMerge } from "./deepMerge";

type SettingsStoreOptions<T extends object> = {
  defaultValue: T;
  fileManager: {
    loadConfigObject: <U>(name: string) => Promise<U>;
    saveConfigObject: <U>(name: string, content: U) => Promise<void>;
  };
  fileName: string;
  defaultSaveDelayMs?: number;
};

export class SettingsStore<T extends object> {
  private currentValue: T;
  private saveTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: SettingsStoreOptions<T>) {
    this.currentValue = options.defaultValue;
  }

  get value(): T {
    return this.currentValue;
  }

  async load(base: Partial<T> = {}): Promise<T> {
    const loaded = ((await this.options.fileManager.loadConfigObject<Partial<T>>(this.options.fileName)) ||
      {}) as Partial<T> | undefined;
    const loadedSettings = loaded || {};
    this.currentValue = deepMerge(this.options.defaultValue, deepMerge(base, loadedSettings));
    return this.currentValue;
  }

  async save(value: T = this.currentValue): Promise<void> {
    this.currentValue = value;
    await this.options.fileManager.saveConfigObject(this.options.fileName, value);
    return;
  }

  saveAfterDelay(value: T = this.currentValue, delay: number = this.options.defaultSaveDelayMs || 500): void {
    this.currentValue = value;
    if (this.saveTimeoutId !== null) {
      clearTimeout(this.saveTimeoutId);
      this.saveTimeoutId = null;
    }
    this.saveTimeoutId = setTimeout(() => {
      void this.save();
      this.saveTimeoutId = null;
    }, delay);
  }

  dispose(): void {
    if (this.saveTimeoutId !== null) {
      clearTimeout(this.saveTimeoutId);
      this.saveTimeoutId = null;
    }
  }
}
