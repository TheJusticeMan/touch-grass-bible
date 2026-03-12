import { beforeEach, describe, expect, test, vi } from "vitest";

const browserFileIOMocks = vi.hoisted(() => ({
  pickBrowserFileText: vi.fn(),
  saveBrowserFile: vi.fn(),
}));

vi.mock("./browserFileIO", () => browserFileIOMocks);

import { createPlatformBridge } from "./web";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe("web platform bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("localStorage", new MemoryStorage());
    vi.stubGlobal("fetch", vi.fn());
  });

  test("stores app values in localStorage", async () => {
    const bridge = createPlatformBridge();

    await bridge.storage.setItem("settings", "value");

    expect(await bridge.storage.getItem("settings")).toBe("value");
  });

  test("reads and writes normalized virtual files", async () => {
    const bridge = createPlatformBridge();

    await bridge.files.writeTextFile(".\\notes\\daily.json", "hello");

    expect(localStorage.getItem("tg-file:notes/daily.json")).toBe("hello");
    await expect(bridge.files.readTextFile("./notes/daily.json")).resolves.toBe("hello");
  });

  test("roundtrips JSON files through the virtual filesystem", async () => {
    const bridge = createPlatformBridge();

    await bridge.files.writeJsonFile("config.json", { theme: "light" });

    await expect(bridge.files.readJsonFile<{ theme: string }>("config.json")).resolves.toEqual({
      theme: "light",
    });
  });

  test("loads normalized asset JSON via fetch", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => '{"translation":"KJV"}',
    } as Response);
    const bridge = createPlatformBridge();

    await expect(bridge.files.loadAssetJson<{ translation: string }>("./translations.json")).resolves.toEqual(
      {
        translation: "KJV",
      },
    );
    expect(fetch).toHaveBeenCalledWith("translations.json");
  });

  test("delegates file picking and saving to browser helpers", async () => {
    browserFileIOMocks.pickBrowserFileText.mockResolvedValue('{"ok":true}');
    const bridge = createPlatformBridge();

    await expect(bridge.files.pickFileText(".json")).resolves.toBe('{"ok":true}');
    await bridge.files.saveFile("settings.json", "{}", "application/json");

    expect(browserFileIOMocks.pickBrowserFileText).toHaveBeenCalledWith(".json");
    expect(browserFileIOMocks.saveBrowserFile).toHaveBeenCalledWith(
      "settings.json",
      "{}",
      "application/json",
    );
  });
});
