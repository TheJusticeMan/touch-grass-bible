export type PlatformTarget = "web" | "electron" | "capacitor";

export interface PlatformStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface PlatformFileAdapter {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  readBinaryFile(path: string): Promise<Uint8Array>;
  writeBinaryFile(path: string, content: Uint8Array): Promise<void>;
  readJsonFile<T>(path: string): Promise<T>;
  writeJsonFile(path: string, data: unknown): Promise<void>;
  loadAssetText(path: string): Promise<string>;
  loadAssetJson<T>(path: string): Promise<T>;
  pickFileText(accept: string): Promise<string | null>;
  saveFile(filename: string, content: string, mimeType?: string): Promise<void>;
}

export interface PlatformBridge {
  target: PlatformTarget;
  storage: PlatformStorageAdapter;
  files: PlatformFileAdapter;
}
