import { pickBrowserFileText, saveBrowserFile } from "./browserFileIO";
import type { PlatformBridge } from "./types";

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const normalized = base64.replace(/\s/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

type ElectronPlatformBridge = {
  storageGetItem(key: string): Promise<string | null>;
  storageSetItem(key: string, value: string): Promise<void>;
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, content: string): Promise<void>;
  readAssetText(path: string): Promise<string>;
  windowMinimize(): Promise<void>;
  windowMaximize(): Promise<void>;
  windowClose(): Promise<void>;
  windowIsMaximized?: () => Promise<boolean>;
  onWindowMaximizedChange?: (callback: (isMaximized: boolean) => void) => () => void;
};

declare global {
  interface Window {
    touchGrassElectronPlatform?: ElectronPlatformBridge;
  }
}

function getElectronBridge(): ElectronPlatformBridge {
  const bridge = window.touchGrassElectronPlatform;
  if (!bridge) {
    throw new Error("Electron platform bridge is not available in the renderer process.");
  }
  return bridge;
}

export function createPlatformBridge(): PlatformBridge {
  const bridge = getElectronBridge();
  return {
    target: "electron",
    storage: {
      async getItem(key: string): Promise<string | null> {
        return bridge.storageGetItem(key);
      },
      async setItem(key: string, value: string): Promise<void> {
        await bridge.storageSetItem(key, value);
      },
    },
    files: {
      async readTextFile(path: string): Promise<string> {
        return bridge.readTextFile(path);
      },
      async writeTextFile(path: string, content: string): Promise<void> {
        await bridge.writeTextFile(path, content);
      },
      async readBinaryFile(path: string): Promise<Uint8Array> {
        return base64ToUint8(await bridge.readTextFile(path));
      },
      async writeBinaryFile(path: string, content: Uint8Array): Promise<void> {
        await bridge.writeTextFile(path, uint8ToBase64(content));
      },
      async readJsonFile<T>(path: string): Promise<T> {
        return JSON.parse(await bridge.readTextFile(path)) as T;
      },
      async writeJsonFile(path: string, data: unknown): Promise<void> {
        await bridge.writeTextFile(path, JSON.stringify(data, null, 2));
      },
      async loadAssetText(path: string): Promise<string> {
        return bridge.readAssetText(path);
      },
      async loadAssetJson<T>(path: string): Promise<T> {
        return JSON.parse(await bridge.readAssetText(path)) as T;
      },
      async pickFileText(accept: string): Promise<string | null> {
        return pickBrowserFileText(accept);
      },
      async saveFile(filename: string, content: string, mimeType?: string): Promise<void> {
        await saveBrowserFile(filename, content, mimeType);
      },
    },
  };
}
