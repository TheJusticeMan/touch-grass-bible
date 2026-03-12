import { pickBrowserFileText, saveBrowserFile } from "./browserFileIO";
import type { PlatformBridge } from "./types";

const virtualFilePrefix = "tg-file:";

function normalizePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/^\/+/, "");
}

function getVirtualFileKey(path: string): string {
  return `${virtualFilePrefix}${normalizePath(path)}`;
}

async function fetchAssetText(path: string): Promise<string> {
  const response = await fetch(normalizePath(path));
  if (!response.ok) {
    throw new Error(`Failed to load asset ${path}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

export function createPlatformBridge(): PlatformBridge {
  return {
    target: "web",
    storage: {
      async getItem(key: string): Promise<string | null> {
        return localStorage.getItem(key);
      },
      async setItem(key: string, value: string): Promise<void> {
        localStorage.setItem(key, value);
      },
    },
    files: {
      async readTextFile(path: string): Promise<string> {
        const content = localStorage.getItem(getVirtualFileKey(path));
        if (content === null) {
          throw new Error(`File not found: ${normalizePath(path)}`);
        }
        return content;
      },
      async writeTextFile(path: string, content: string): Promise<void> {
        localStorage.setItem(getVirtualFileKey(path), content);
      },
      async readJsonFile<T>(path: string): Promise<T> {
        return JSON.parse(await this.readTextFile(path)) as T;
      },
      async writeJsonFile(path: string, data: unknown): Promise<void> {
        await this.writeTextFile(path, JSON.stringify(data, null, 2));
      },
      async loadAssetText(path: string): Promise<string> {
        return fetchAssetText(path);
      },
      async loadAssetJson<T>(path: string): Promise<T> {
        return JSON.parse(await fetchAssetText(path)) as T;
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
