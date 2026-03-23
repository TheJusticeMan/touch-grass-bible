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

    test("logs an error when writeTextFile rejects", async () => {
      vi.mocked(app.files.readTextFile).mockResolvedValue("[]");
      vi.mocked(app.files.writeTextFile).mockRejectedValue(new Error("disk full"));

      await ext.installPlugin("// code", "broken.js");

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

      await ext.loadAll();

      expect(ext.plugins.has("good-plugin")).toBe(true);
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
  });
});
