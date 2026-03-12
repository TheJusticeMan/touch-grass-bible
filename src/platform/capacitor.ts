import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { pickBrowserFileText } from "./browserFileIO";
import type { PlatformBridge } from "./types";

function normalizePath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/^\/+/, "");
}

function getParentPath(path: string): string {
  const normalizedPath = normalizePath(path);
  const segments = normalizedPath.split("/");
  segments.pop();
  return segments.join("/");
}

async function ensureParentDirectory(path: string, directory: Directory): Promise<void> {
  const parentPath = getParentPath(path);
  if (!parentPath) {
    return;
  }

  await Filesystem.mkdir({
    path: parentPath,
    directory,
    recursive: true,
  }).catch(() => undefined);
}

async function readFilesystemText(path: string, directory: Directory): Promise<string> {
  const result = await Filesystem.readFile({
    path: normalizePath(path),
    directory,
    encoding: Encoding.UTF8,
  });

  if (typeof result.data !== "string") {
    throw new Error(`Expected UTF-8 text for ${path}`);
  }

  return result.data;
}

async function writeFilesystemText(path: string, content: string, directory: Directory): Promise<void> {
  const normalizedPath = normalizePath(path);
  await ensureParentDirectory(normalizedPath, directory);
  await Filesystem.writeFile({
    path: normalizedPath,
    data: content,
    directory,
    encoding: Encoding.UTF8,
  });
}

function getStoragePath(key: string): string {
  return `.tg-storage/${encodeURIComponent(key)}.txt`;
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
    target: "capacitor",
    storage: {
      async getItem(key: string): Promise<string | null> {
        try {
          return await readFilesystemText(getStoragePath(key), Directory.Data);
        } catch {
          return null;
        }
      },
      async setItem(key: string, value: string): Promise<void> {
        await writeFilesystemText(getStoragePath(key), value, Directory.Data);
      },
    },
    files: {
      async readTextFile(path: string): Promise<string> {
        return readFilesystemText(path, Directory.Data);
      },
      async writeTextFile(path: string, content: string): Promise<void> {
        await writeFilesystemText(path, content, Directory.Data);
      },
      async readJsonFile<T>(path: string): Promise<T> {
        return JSON.parse(await readFilesystemText(path, Directory.Data)) as T;
      },
      async writeJsonFile(path: string, data: unknown): Promise<void> {
        await writeFilesystemText(path, JSON.stringify(data, null, 2), Directory.Data);
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
      async saveFile(filename: string, content: string): Promise<void> {
        await writeFilesystemText(filename, content, Directory.Documents);
      },
    },
  };
}
