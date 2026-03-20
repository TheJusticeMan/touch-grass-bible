// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { ExternalPlugins } from "./ExternalPlugins";

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

function makeApp(overrides: Record<string, unknown> = {}) {
  return {
    console: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    readTextFile: vi.fn<[string], Promise<string>>(),
    writeTextFile: vi.fn<[string, string], Promise<void>>(),
    ...overrides,
  } as unknown as import("../main").default;
}

// ---------------------------------------------------------------------------
// ExternalPlugins
// ---------------------------------------------------------------------------

describe("ExternalPlugins", () => {
  let app: ReturnType<typeof makeApp>;
  let ext: ExternalPlugins;

  beforeEach(async () => {
    app = makeApp();
    ext = new ExternalPlugins(app);
    await ext.load();
  });

  afterEach(async () => {
    await ext.unload();
  });

  // -------------------------------------------------------------------------
  // installPlugin
  // -------------------------------------------------------------------------

  describe("installPlugin", () => {
    test("writes plugin source to plugins/<filename>", async () => {
      vi.mocked(app.readTextFile).mockResolvedValue("[]");
      vi.mocked(app.writeTextFile).mockResolvedValue(undefined);

      await ext.installPlugin('console.log("hello")', "my-plugin.js");

      expect(app.writeTextFile).toHaveBeenCalledWith(
        "plugins/my-plugin.js",
        'console.log("hello")',
      );
    });

    test("adds filename to index when it is new", async () => {
      vi.mocked(app.readTextFile).mockResolvedValue("[]");
      vi.mocked(app.writeTextFile).mockResolvedValue(undefined);

      await ext.installPlugin("// code", "new-plugin.js");

      const indexCalls = vi
        .mocked(app.writeTextFile)
        .mock.calls.filter(([path]) => path === "plugins/index.json");

      expect(indexCalls).toHaveLength(1);
      expect(JSON.parse(indexCalls[0][1])).toContain("new-plugin.js");
    });

    test("does not duplicate filename in index", async () => {
      vi.mocked(app.readTextFile).mockResolvedValue('["existing.js"]');
      vi.mocked(app.writeTextFile).mockResolvedValue(undefined);

      await ext.installPlugin("// code", "existing.js");

      const indexCalls = vi
        .mocked(app.writeTextFile)
        .mock.calls.filter(([path]) => path === "plugins/index.json");

      expect(indexCalls).toHaveLength(0);
    });

    test("logs an error when writeTextFile rejects", async () => {
      vi.mocked(app.readTextFile).mockResolvedValue("[]");
      vi.mocked(app.writeTextFile).mockRejectedValue(new Error("disk full"));

      await ext.installPlugin("// code", "broken.js");

      expect(app.console.error).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // loadAll
  // -------------------------------------------------------------------------

  describe("loadAll", () => {
    test("does nothing and logs no error when index is empty", async () => {
      vi.mocked(app.readTextFile).mockResolvedValue("[]");

      await ext.loadAll();

      expect(app.console.error).not.toHaveBeenCalled();
    });

    test("does nothing when index read fails (treated as empty)", async () => {
      vi.mocked(app.readTextFile).mockRejectedValue(new Error("not found"));

      await ext.loadAll();

      // readIndex silently returns [] on failure, so no error is logged by loadAll
      expect(app.console.error).not.toHaveBeenCalled();
    });

    test("logs error for each plugin file that fails to load", async () => {
      vi.mocked(app.readTextFile)
        .mockResolvedValueOnce('["bad.js"]') // index read
        .mockRejectedValueOnce(new Error("read error")); // plugin file read

      await ext.loadAll();

      expect(app.console.error).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // tg-plugin-loaded event handling
  // -------------------------------------------------------------------------

  describe("handleRegistration (tg-plugin-loaded)", () => {
    test("ignores event when plugin id is already registered", () => {
      const manifest = { id: "dup", name: "Dup", description: "", version: "1" };
      const PluginClass = vi.fn();

      // Pre-populate the map so the first registration is already "done"
      (ext.plugins as Map<string, unknown>).set(manifest.id, {});

      window.dispatchEvent(
        new CustomEvent("tg-plugin-loaded", { detail: { manifest, pluginClass: PluginClass } }),
      );

      // warn logged once; constructor never called since id was pre-registered
      expect(app.console.warn).toHaveBeenCalledOnce();
      expect(PluginClass).not.toHaveBeenCalled();
    });

    test("logs error when pluginClass constructor throws", () => {
      const manifest = { id: "err-plugin", name: "Err", description: "", version: "1" };
      const BadPlugin = vi.fn(() => {
        throw new Error("constructor failed");
      });

      window.dispatchEvent(
        new CustomEvent("tg-plugin-loaded", {
          detail: { manifest, pluginClass: BadPlugin },
        }),
      );

      expect(app.console.error).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  describe("lifecycle", () => {
    test("unload removes the tg-plugin-loaded event listener", async () => {
      await ext.unload();

      const manifest = { id: "after-unload", name: "X", description: "", version: "1" };
      const PluginClass = vi.fn();
      window.dispatchEvent(
        new CustomEvent("tg-plugin-loaded", {
          detail: { manifest, pluginClass: PluginClass },
        }),
      );

      // Plugin should NOT be registered (listener was removed on unload)
      expect(ext.plugins.has("after-unload")).toBe(false);
    });
  });
});
