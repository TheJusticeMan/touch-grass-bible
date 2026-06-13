import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
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

async function readFilesystemBinary(path: string, directory: Directory): Promise<Uint8Array> {
  const result = await Filesystem.readFile({
    path: normalizePath(path),
    directory,
  });

  if (typeof result.data === "string") {
    return base64ToUint8(result.data);
  }

  const buffer = await result.data.arrayBuffer();
  return new Uint8Array(buffer);
}

async function writeFilesystemBinary(path: string, content: Uint8Array, directory: Directory): Promise<void> {
  const normalizedPath = normalizePath(path);
  await ensureParentDirectory(normalizedPath, directory);
  await Filesystem.writeFile({
    path: normalizedPath,
    data: uint8ToBase64(content),
    directory,
  });
}

function getStoragePath(key: string, extension: "json" | "txt" = "json"): string {
  return `.tg-storage/${encodeURIComponent(key)}.${extension}`;
}

async function readStorageItem(key: string): Promise<string | null> {
  try {
    return await readFilesystemText(getStoragePath(key, "json"), Directory.Data);
  } catch {
    try {
      return await readFilesystemText(getStoragePath(key, "txt"), Directory.Data);
    } catch {
      return null;
    }
  }
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
        return readStorageItem(key);
      },
      async setItem(key: string, value: string): Promise<void> {
        await writeFilesystemText(getStoragePath(key, "json"), value, Directory.Data);
      },
    },
    files: {
      async readTextFile(path: string): Promise<string> {
        return readFilesystemText(path, Directory.Data);
      },
      async writeTextFile(path: string, content: string): Promise<void> {
        await writeFilesystemText(path, content, Directory.Data);
      },
      async readBinaryFile(path: string): Promise<Uint8Array> {
        return readFilesystemBinary(path, Directory.Data);
      },
      async writeBinaryFile(path: string, content: Uint8Array): Promise<void> {
        await writeFilesystemBinary(path, content, Directory.Data);
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
        throw new Error(`pickFileText is not supported in capacitor builds (accept: ${accept})`);
      },
      async saveFile(filename: string, content: string): Promise<void> {
        await writeFilesystemText(filename, content, Directory.Documents);
      },
    },
  };
}
