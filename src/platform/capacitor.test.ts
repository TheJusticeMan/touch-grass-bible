import { beforeEach, describe, expect, test, vi } from "vitest";

const browserFileIOMocks = vi.hoisted(() => ({
  pickBrowserFileText: vi.fn(),
}));

const capacitorMocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("./browserFileIO", () => browserFileIOMocks);
vi.mock("@capacitor/filesystem", () => ({
  Directory: {
    Data: "DATA",
    Documents: "DOCUMENTS",
  },
  Encoding: {
    UTF8: "utf8",
  },
  Filesystem: capacitorMocks,
}));

import { createPlatformBridge } from "./capacitor";

describe("capacitor platform bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capacitorMocks.mkdir.mockResolvedValue(undefined);
    capacitorMocks.readFile.mockResolvedValue({ data: "contents" });
    capacitorMocks.writeFile.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn());
  });

  test("stores key-value data under the capacitor storage namespace", async () => {
    const bridge = createPlatformBridge();

    await bridge.storage.setItem("settings", "value");
    await bridge.storage.getItem("settings");

    expect(capacitorMocks.writeFile).toHaveBeenCalledWith({
      path: ".tg-storage/settings.txt",
      data: "value",
      directory: "DATA",
      encoding: "utf8",
    });
    expect(capacitorMocks.readFile).toHaveBeenCalledWith({
      path: ".tg-storage/settings.txt",
      directory: "DATA",
      encoding: "utf8",
    });
  });

  test("returns null when capacitor storage lookup fails", async () => {
    capacitorMocks.readFile.mockRejectedValue(new Error("missing"));
    const bridge = createPlatformBridge();

    await expect(bridge.storage.getItem("missing")).resolves.toBeNull();
  });

  test("writes files under the correct capacitor directories", async () => {
    const bridge = createPlatformBridge();

    await bridge.files.writeTextFile("notes/daily.txt", "hello");
    await bridge.files.saveFile("export/settings.json", "{}", "application/json");

    expect(capacitorMocks.mkdir).toHaveBeenCalledWith({
      path: "notes",
      directory: "DATA",
      recursive: true,
    });
    expect(capacitorMocks.writeFile).toHaveBeenCalledWith({
      path: "notes/daily.txt",
      data: "hello",
      directory: "DATA",
      encoding: "utf8",
    });
    expect(capacitorMocks.writeFile).toHaveBeenCalledWith({
      path: "export/settings.json",
      data: "{}",
      directory: "DOCUMENTS",
      encoding: "utf8",
    });
  });

  test("loads asset JSON and delegates browser file picking", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      text: async () => '{"translation":"YLT"}',
    } as Response);
    browserFileIOMocks.pickBrowserFileText.mockResolvedValue('{"ok":true}');
    const bridge = createPlatformBridge();

    await expect(
      bridge.files.loadAssetJson<{ translation: string }>("./data/translations/YLT.json"),
    ).resolves.toEqual({
      translation: "YLT",
    });
    await expect(bridge.files.pickFileText(".json")).resolves.toBe('{"ok":true}');

    expect(fetch).toHaveBeenCalledWith("data/translations/YLT.json");
    expect(browserFileIOMocks.pickBrowserFileText).toHaveBeenCalledWith(".json");
  });
});
