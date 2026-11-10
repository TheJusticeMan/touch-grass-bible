// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { ExternalPlugins } from "./ExternalPlugins";
import { HOST_MODULE_ID } from "./ExternalHostApi";
import Plugin from "./Plugin";

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
    files: {
      readTextFile: vi.fn(),
      writeTextFile: vi.fn(),
    },
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
      vi.mocked(app.files.readTextFile).mockResolvedValue("[]");
      vi.mocked(app.files.writeTextFile).mockResolvedValue(undefined);

      await ext.installPlugin('console.log("hello")', "my-plugin.js");

      expect(app.files.writeTextFile).toHaveBeenCalledWith("plugins/my-plugin.js", 'console.log("hello")');
    });

    test("rolls back the source file when saving the index fails", async () => {
      vi.mocked(app.files.readTextFile).mockResolvedValue("[]");
      vi.mocked(app.files.writeTextFile)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("index write failed"))
        .mockResolvedValueOnce(undefined);

      await expect(ext.installPlugin("// code", "new.js")).rejects.toThrow("index write failed");

      expect(app.files.writeTextFile).toHaveBeenNthCalledWith(1, "plugins/new.js", "// code");
      expect(app.files.writeTextFile).toHaveBeenNthCalledWith(2, "plugins/index.json", '["new.js"]');
      expect(app.files.writeTextFile).toHaveBeenNthCalledWith(3, "plugins/new.js", "");
    });

    test("adds filename to index when it is new", async () => {
      vi.mocked(app.files.readTextFile).mockResolvedValue("[]");
      vi.mocked(app.files.writeTextFile).mockResolvedValue(undefined);

      await ext.installPlugin("// code", "new-plugin.js");

      const indexCalls = vi
        .mocked(app.files.writeTextFile)
        .mock.calls.filter(([path]) => path === "plugins/index.json");

      expect(indexCalls).toHaveLength(1);
      expect(JSON.parse(indexCalls[0][1])).toContain("new-plugin.js");
    });

    test("does not duplicate filename in index", async () => {
      vi.mocked(app.files.readTextFile).mockResolvedValue('["existing.js"]');
      vi.mocked(app.files.writeTextFile).mockResolvedValue(undefined);

      await ext.installPlugin("// code", "existing.js");

      const indexCalls = vi
        .mocked(app.files.writeTextFile)
        .mock.calls.filter(([path]) => path === "plugins/index.json");

      expect(indexCalls).toHaveLength(0);
    });

    test("logs an error and rejects when writeTextFile rejects", async () => {
      vi.mocked(app.files.readTextFile).mockResolvedValue("[]");
      vi.mocked(app.files.writeTextFile).mockRejectedValue(new Error("disk full"));

      await expect(ext.installPlugin("// code", "broken.js")).rejects.toThrow("disk full");

      expect(app.console.error).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // loadAll
  // -------------------------------------------------------------------------

  describe("loadAll", () => {
    test("does nothing and logs no error when index is empty", async () => {
      vi.mocked(app.files.readTextFile).mockResolvedValue("[]");

      await ext.loadAll();

      expect(app.console.error).not.toHaveBeenCalled();
    });

    test("does nothing when index read fails (treated as empty)", async () => {
      vi.mocked(app.files.readTextFile).mockRejectedValue(new Error("not found"));

      await ext.loadAll();

      // readIndex silently returns [] on failure, so no error is logged by loadAll
      expect(app.console.error).not.toHaveBeenCalled();
    });

    test("logs error for each plugin file that fails to load", async () => {
      vi.mocked(app.files.readTextFile)
        .mockResolvedValueOnce('["bad.js"]') // index read
        .mockRejectedValueOnce(new Error("read error")); // plugin file read

      await ext.loadAll();

      expect(app.console.error).toHaveBeenCalledOnce();
    });

    test("registers plugin from module exports", async () => {
      vi.mocked(app.files.readTextFile)
        .mockResolvedValueOnce('["good.js"]')
        .mockResolvedValueOnce("// plugin js source");

      class GoodPlugin extends Plugin {}

      vi.spyOn(
        ext as unknown as { evaluatePluginCode: (jsCode: string, filename: string) => Promise<unknown> },
        "evaluatePluginCode",
      ).mockResolvedValue({
        manifest: {
          id: "good-plugin",
          name: "Good Plugin",
          description: "Works",
          version: "1.0.0",
        },
        default: GoodPlugin,
      });

      const report = await ext.loadAll();

      expect(ext.plugins.has("good-plugin")).toBe(true);
      expect(report).toEqual({ loaded: ["good.js"], failed: [] });
      expect(app.console.error).not.toHaveBeenCalled();
    });

    test("logs error when plugin module is missing manifest export", async () => {
      vi.mocked(app.files.readTextFile)
        .mockResolvedValueOnce('["missing-manifest.js"]')
        .mockResolvedValueOnce("// plugin js source");

      vi.spyOn(
        ext as unknown as { evaluatePluginCode: (jsCode: string, filename: string) => Promise<unknown> },
        "evaluatePluginCode",
      ).mockResolvedValue({
        default: class MissingManifestPlugin {},
      });

      await ext.loadAll();

      expect(app.console.error).toHaveBeenCalled();
      expect(ext.plugins.size).toBe(0);
    });
  });

  describe("plugin lifecycle", () => {
    test("waits for a plugin to finish loading before loadAll resolves", async () => {
      vi.mocked(app.files.readTextFile)
        .mockResolvedValueOnce('["slow.js"]')
        .mockResolvedValueOnce("// plugin js source");

      let releaseLoad!: () => void;
      const loadGate = new Promise<void>(resolve => {
        releaseLoad = resolve;
      });
      let loadStarted = false;
      let loadFinished = false;
      class SlowPlugin extends Plugin {
        async onload() {
          loadStarted = true;
          await loadGate;
          loadFinished = true;
        }
      }

      vi.spyOn(
        ext as unknown as { evaluatePluginCode: (jsCode: string, filename: string) => Promise<unknown> },
        "evaluatePluginCode",
      ).mockResolvedValue({
        manifest: {
          id: "slow-plugin",
          name: "Slow Plugin",
          description: "Loads asynchronously",
          version: "1.0.0",
        },
        default: SlowPlugin,
      });

      let loadAllResolved = false;
      const loadAllPromise = ext.loadAll().then(() => {
        loadAllResolved = true;
      });

      await vi.waitFor(() => expect(loadStarted).toBe(true));
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(loadAllResolved).toBe(false);

      releaseLoad();
      await loadAllPromise;
      expect(loadFinished).toBe(true);
    });

    test("uninstall unloads and unregisters an active plugin", async () => {
      vi.mocked(app.files.readTextFile)
        .mockResolvedValueOnce('["active.js"]')
        .mockResolvedValueOnce("// plugin js source")
        .mockResolvedValueOnce('["active.js"]');
      vi.mocked(app.files.writeTextFile).mockResolvedValue(undefined);

      const onLoad = vi.fn();
      const onUnload = vi.fn();
      class ActivePlugin extends Plugin {
        async onload() {
          onLoad();
        }

        async onunload() {
          onUnload();
        }
      }
      vi.spyOn(
        ext as unknown as { evaluatePluginCode: (jsCode: string, filename: string) => Promise<unknown> },
        "evaluatePluginCode",
      ).mockResolvedValue({
        manifest: {
          id: "active-plugin",
          name: "Active Plugin",
          description: "Can be removed",
          version: "1.0.0",
        },
        default: ActivePlugin,
      });

      await ext.loadAll();
      const plugin = ext.plugins.get("active-plugin");
      expect(onLoad).toHaveBeenCalledOnce();

      await ext.uninstallPlugin("active.js");

      expect(onUnload).toHaveBeenCalledOnce();
      expect(ext.plugins.has("active-plugin")).toBe(false);
      expect(plugin && ext.hasChild(plugin)).toBe(false);
      expect(app.files.writeTextFile).toHaveBeenCalledWith("plugins/index.json", "[]");
    });

    test("removes a plugin even when its shutdown hook throws", async () => {
      vi.mocked(app.files.readTextFile)
        .mockResolvedValueOnce('["throws-on-unload.js"]')
        .mockResolvedValueOnce("// plugin js source")
        .mockResolvedValueOnce('["throws-on-unload.js"]');
      vi.mocked(app.files.writeTextFile).mockResolvedValue(undefined);

      class ThrowsOnUnloadPlugin extends Plugin {
        async onunload() {
          throw new Error("cleanup failed");
        }
      }
      vi.spyOn(
        ext as unknown as { evaluatePluginCode: (jsCode: string, filename: string) => Promise<unknown> },
        "evaluatePluginCode",
      ).mockResolvedValue({
        manifest: {
          id: "throws-on-unload",
          name: "Throws On Unload",
          description: "Cleanup failure should not block removal",
          version: "1.0.0",
        },
        default: ThrowsOnUnloadPlugin,
      });

      await ext.loadAll();
      await expect(ext.uninstallPlugin("throws-on-unload.js")).resolves.toBeUndefined();

      expect(ext.plugins.has("throws-on-unload")).toBe(false);
      expect(app.files.writeTextFile).toHaveBeenCalledWith("plugins/index.json", "[]");
      expect(app.files.writeTextFile).toHaveBeenCalledWith("plugins/throws-on-unload.js", "");
      expect(app.console.error).toHaveBeenCalledWith(
        expect.stringContaining("failed during shutdown after removal"),
        expect.any(Error),
      );
    });

    test("reinstalling a filename replaces the active plugin on the next load", async () => {
      vi.mocked(app.files.readTextFile)
        .mockResolvedValueOnce('["update.js"]')
        .mockResolvedValueOnce("version one")
        .mockResolvedValueOnce('["update.js"]')
        .mockResolvedValueOnce('["update.js"]')
        .mockResolvedValueOnce("version two");
      vi.mocked(app.files.writeTextFile).mockResolvedValue(undefined);

      const firstLoad = vi.fn();
      const firstUnload = vi.fn();
      class FirstPlugin extends Plugin {
        async onload() {
          firstLoad();
        }

        async onunload() {
          firstUnload();
        }
      }
      const secondLoad = vi.fn();
      class SecondPlugin extends Plugin {
        async onload() {
          secondLoad();
        }
      }
      vi.spyOn(
        ext as unknown as { evaluatePluginCode: (jsCode: string, filename: string) => Promise<unknown> },
        "evaluatePluginCode",
      ).mockImplementation(async source => ({
        manifest: {
          id: "update-plugin",
          name: "Update Plugin",
          description: "Can be updated",
          version: source,
        },
        default: source === "version one" ? FirstPlugin : SecondPlugin,
      }));

      await ext.loadAll();
      const firstInstance = ext.plugins.get("update-plugin");
      expect(firstLoad).toHaveBeenCalledOnce();

      await ext.installPlugin("version two", "update.js");
      const report = await ext.loadAll();
      const secondInstance = ext.plugins.get("update-plugin");

      expect(firstUnload).toHaveBeenCalledOnce();
      expect(secondInstance).not.toBe(firstInstance);
      expect(secondLoad).toHaveBeenCalledOnce();
      expect(report).toEqual({ loaded: ["update.js"], failed: [] });
    });

    test("rejects filenames that could escape the plugin directory", async () => {
      await expect(ext.installPlugin("// plugin", "../outside.js")).rejects.toThrow(/filename/i);
      expect(app.files.writeTextFile).not.toHaveBeenCalled();
    });

    test("does not retain a plugin whose startup fails", async () => {
      vi.mocked(app.files.readTextFile)
        .mockResolvedValueOnce('["broken.js"]')
        .mockResolvedValueOnce("// plugin js source");

      const startupCleanup = vi.fn();
      const onunload = vi.fn();
      class BrokenPlugin extends Plugin {
        async onload() {
          this.registerUnload(startupCleanup);
          throw new Error("startup failed");
        }

        async onunload() {
          onunload();
        }
      }
      vi.spyOn(
        ext as unknown as { evaluatePluginCode: (jsCode: string, filename: string) => Promise<unknown> },
        "evaluatePluginCode",
      ).mockResolvedValue({
        manifest: {
          id: "broken-plugin",
          name: "Broken Plugin",
          description: "Fails to start",
          version: "1.0.0",
        },
        default: BrokenPlugin,
      });

      const report = await ext.loadAll();

      expect(ext.plugins.has("broken-plugin")).toBe(false);
      expect(startupCleanup).toHaveBeenCalledOnce();
      expect(onunload).toHaveBeenCalledOnce();
      expect(report.failed.map(failure => failure.filename)).toContain("broken.js");
      expect(app.console.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load plugin "broken.js"'),
        expect.any(Error),
      );
    });
  });

  describe("rewriteExternalImportSpecifiers", () => {
    test("rewrites host API module import", () => {
      const jsCode = [
        `import { Plugin } from "${HOST_MODULE_ID}";`,
        "export default class X extends Plugin {}",
      ].join("\n");

      const rewritten = (
        ext as unknown as {
          rewriteExternalImportSpecifiers: (source: string) => { code: string; generatedUrls: string[] };
        }
      ).rewriteExternalImportSpecifiers(jsCode);

      expect(rewritten.generatedUrls.length).toBe(1);
      expect(rewritten.generatedUrls[0].startsWith("blob:")).toBe(true);
      expect(rewritten.code).toContain(rewritten.generatedUrls[0]);
      expect(rewritten.code).not.toContain(`"${HOST_MODULE_ID}"`);

      rewritten.generatedUrls.forEach(url => URL.revokeObjectURL(url));
    });

    test("rewrites multiline static imports from the host API", () => {
      const jsCode = [
        "import {",
        "  Plugin,",
        `} from "${HOST_MODULE_ID}";`,
        `const moduleName = "${HOST_MODULE_ID}";`,
        `// import { Plugin } from "${HOST_MODULE_ID}";`,
        `const pattern = /export \\{ Plugin \\} from "${HOST_MODULE_ID}"/;`,
        "export default class X extends Plugin {}",
      ].join("\n");

      const rewritten = (
        ext as unknown as {
          rewriteExternalImportSpecifiers: (source: string) => { code: string; generatedUrls: string[] };
        }
      ).rewriteExternalImportSpecifiers(jsCode);

      expect(rewritten.generatedUrls).toHaveLength(1);
      expect(rewritten.code).toContain(rewritten.generatedUrls[0]);
      expect(rewritten.code).toContain(`} from "${rewritten.generatedUrls[0]}";`);
      expect(rewritten.code).toContain(`const moduleName = "${HOST_MODULE_ID}";`);
      expect(rewritten.code).toContain(`// import { Plugin } from "${HOST_MODULE_ID}";`);
      expect(rewritten.code).toContain(`const pattern = /export \\{ Plugin \\} from "${HOST_MODULE_ID}"/;`);
      rewritten.generatedUrls.forEach(url => URL.revokeObjectURL(url));
    });
  });
});
