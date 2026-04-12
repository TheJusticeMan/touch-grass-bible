import { beforeEach, describe, expect, test, vi } from "vitest";

const browserFileIOMocks = vi.hoisted(() => ({
  pickBrowserFileText: vi.fn(),
  saveBrowserFile: vi.fn(),
}));

vi.mock("./browserFileIO", () => browserFileIOMocks);

import { createPlatformBridge } from "./electron";

describe("electron platform bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", {
      touchGrassElectronPlatform: {
        storageGetItem: vi.fn(async (key: string) => `stored:${key}`),
        storageSetItem: vi.fn(async () => undefined),
        readTextFile: vi.fn(async (path: string) => `text:${path}`),
        writeTextFile: vi.fn(async () => undefined),
        readAssetText: vi.fn(async (path: string) => `{"path":"${path}"}`),
      },
    });
  });

  test("throws if the renderer bridge is missing", async () => {
    vi.stubGlobal("window", {});

    expect(() => createPlatformBridge()).toThrow(
      "Electron platform bridge is not available in the renderer process.",
    );
  });

  test("delegates storage and file operations to the preload bridge", async () => {
    const bridge = createPlatformBridge();
    const electronBridge = window.touchGrassElectronPlatform!;
    const payload = new Uint8Array([1, 2, 3]);

    await expect(bridge.storage.getItem("settings")).resolves.toBe("stored:settings");
    await bridge.storage.setItem("settings", "value");
    await expect(bridge.files.readTextFile("notes/file.txt")).resolves.toBe("text:notes/file.txt");
    await bridge.files.writeTextFile("notes/file.txt", "hello");
    await bridge.files.writeBinaryFile("notes/file.bin", payload);

    expect(electronBridge.storageGetItem).toHaveBeenCalledWith("settings");
    expect(electronBridge.storageSetItem).toHaveBeenCalledWith("settings", "value");
    expect(electronBridge.readTextFile).toHaveBeenCalledWith("notes/file.txt");
    expect(electronBridge.writeTextFile).toHaveBeenCalledWith("notes/file.txt", "hello");
    expect(electronBridge.writeTextFile).toHaveBeenCalledWith("notes/file.bin", "AQID");
  });

  test("reads and writes JSON through the preload bridge", async () => {
    window.touchGrassElectronPlatform!.readTextFile = vi.fn(async () => '{"theme":"dark"}');
    const bridge = createPlatformBridge();

    await expect(bridge.files.readJsonFile<{ theme: string }>("config.json")).resolves.toEqual({
      theme: "dark",
    });
    await bridge.files.writeJsonFile("config.json", { theme: "light" });

    expect(window.touchGrassElectronPlatform!.writeTextFile).toHaveBeenCalledWith(
      "config.json",
      '{\n  "theme": "light"\n}',
    );
  });

  test("loads asset JSON and delegates browser file helpers", async () => {
    browserFileIOMocks.pickBrowserFileText.mockResolvedValue('{"ok":true}');
    const bridge = createPlatformBridge();

    await expect(bridge.files.loadAssetJson<{ path: string }>("data/translations/KJV.json")).resolves.toEqual(
      {
        path: "data/translations/KJV.json",
      },
    );
    await expect(bridge.files.pickFileText(".json")).resolves.toBe('{"ok":true}');
    await bridge.files.saveFile("export.json", "{}", "application/json");

    expect(window.touchGrassElectronPlatform!.readAssetText).toHaveBeenCalledWith(
      "data/translations/KJV.json",
    );
    expect(browserFileIOMocks.pickBrowserFileText).toHaveBeenCalledWith(".json");
    expect(browserFileIOMocks.saveBrowserFile).toHaveBeenCalledWith("export.json", "{}", "application/json");
  });

  test("reads binary files through the preload bridge", async () => {
    window.touchGrassElectronPlatform!.readTextFile = vi.fn(async () => "AQID");
    const bridge = createPlatformBridge();

    await expect(bridge.files.readBinaryFile("notes/file.bin")).resolves.toEqual(new Uint8Array([1, 2, 3]));

    expect(window.touchGrassElectronPlatform!.readTextFile).toHaveBeenCalledWith("notes/file.bin");
  });
});
