import { Component } from "src/external/Plugin";
import TouchGrassBibleApp from "../main";
import { HOST_MODULE_ID, createExternalHostApi } from "./ExternalHostApi";
import Plugin, { type PluginMetadata } from "./Plugin";

const BASE_PLUGIN_GLOBAL_KEY = "__tg_external_base_plugin__";
const EXTERNAL_MODULES_GLOBAL_KEY = "__tg_external_modules__";

type ExternalPluginClass = new (app: TouchGrassBibleApp, manifest: PluginMetadata) => Plugin;

type ExternalPluginModule = {
  manifest?: unknown;
  default?: unknown;
};

type ExternalModuleRegistry = Record<string, unknown>;

/** Path prefix for the external plugins directory. */
const PLUGINS_DIR = "plugins";

/** JSON index file that tracks installed plugin filenames. */
const PLUGIN_INDEX = `${PLUGINS_DIR}/index.json`;

/**
 * External plugin registry and lifecycle coordinator.
 *
 * `ExternalPlugins` manages user-installed third-party plugins stored as
 * plain JavaScript files on the device. It handles installation, persistence,
 * loading from disk, and safe dynamic evaluation via Blob object URLs.
 *
 * @remarks
 * This class is only instantiated when `__ENABLE_EXTERNAL_PLUGINS__` is
 * `true` at build time. Plugins are loaded using an ES module
 * contract: `export const manifest` and `export default` plugin class.
 *
 * @example
 * ```ts
 * const ext = new ExternalPlugins(app);
 * await ext.load();
 * await ext.loadAll();
 * ```
 */
export class ExternalPlugins extends Component {
  /** Registered external plugins keyed by manifest id. */
  readonly plugins: Map<string, Plugin> = new Map();

  constructor(private readonly host: TouchGrassBibleApp) {
    super();
  }

  async onload(): Promise<void> {
    const pluginCompatModule = {
      default: Plugin,
      Plugin,
      Component,
    };

    this.ensureExternalModuleRegistry();
    this.registerExternalModule("src/core/Plugin", pluginCompatModule);
    const hostApi = createExternalHostApi(this.host);
    this.registerExternalModule(HOST_MODULE_ID, hostApi);
  }

  private registerPlugin(manifest: PluginMetadata, pluginClass: ExternalPluginClass): void {
    if (this.plugins.has(manifest.id)) {
      this.host.console.warn(`[ExternalPlugins] Plugin "${manifest.id}" is already registered. Skipping.`);
      return;
    }

    try {
      const instance = new pluginClass(this.host, manifest);
      this.plugins.set(manifest.id, instance);
      this.addChild(instance).catch(e =>
        this.host.console.error(
          `[ExternalPlugins] Failed to start lifecycle for plugin "${manifest.id}":`,
          e,
        ),
      );
      this.host.console.log(`[ExternalPlugins] Registered plugin: ${manifest.id}`);
    } catch (e) {
      this.host.console.error(`[ExternalPlugins] Failed to instantiate plugin "${manifest.id}":`, e);
    }
  }

  /**
   * Saves a plugin's JavaScript source to the local `plugins/` directory and
   * updates the index so it is loaded on subsequent app starts.
   *
   * @param jsCode - Raw JavaScript source of the plugin module.
   * @param filename - Destination filename (e.g. `"my-plugin.js"`).
   */
  async installPlugin(jsCode: string, filename: string): Promise<void> {
    try {
      const path = `${PLUGINS_DIR}/${filename}`;
      await this.host.files.writeTextFile(path, jsCode);

      const index = await this.readIndex();
      if (!index.includes(filename)) {
        index.push(filename);
        await this.host.files.writeTextFile(PLUGIN_INDEX, JSON.stringify(index));
      }

      this.host.console.log(`[ExternalPlugins] Installed plugin: ${filename}`);
    } catch (e) {
      this.host.console.error(`[ExternalPlugins] Failed to install plugin "${filename}":`, e);
    }
  }

  /**
   * Uninstalls a plugin by removing its file and updating the index.
   *
   * @param filename - Plugin filename to uninstall (e.g. `"my-plugin.js"`).
   */
  async uninstallPlugin(filename: string): Promise<void> {
    try {
      const path = `${PLUGINS_DIR}/${filename}`;

      // Try to remove the file (may not exist in all platforms)
      try {
        await this.host.files.writeTextFile(path, "");
      } catch {
        // Ignore errors if platforms don't support deletion
      }

      // Remove from index
      const index = await this.readIndex();
      const filtered = index.filter(f => f !== filename);
      if (filtered.length < index.length) {
        await this.host.files.writeTextFile(PLUGIN_INDEX, JSON.stringify(filtered));
      }

      this.host.console.log(`[ExternalPlugins] Uninstalled plugin: ${filename}`);
    } catch (e) {
      this.host.console.error(`[ExternalPlugins] Failed to uninstall plugin "${filename}":`, e);
    }
  }

  /**
   * Returns a list of installed plugin filenames.
   *
   * @returns Array of installed plugin filenames.
   */
  async getInstalledPlugins(): Promise<string[]> {
    return this.readIndex();
  }

  /**
   * Loads and evaluates all JS files listed in the plugin index.
   *
   * Each file is converted to a Blob, exposed as an object URL, and
   * dynamically imported. The module must export `manifest` metadata and a
   * `default` plugin class.
   */
  async loadAll(): Promise<void> {
    let filenames: string[];
    try {
      filenames = await this.readIndex();
    } catch {
      this.host.console.log("[ExternalPlugins] No plugin index found; skipping external plugins.");
      return;
    }

    for (const filename of filenames) {
      try {
        const path = `${PLUGINS_DIR}/${filename}`;
        const jsCode = await this.host.files.readTextFile(path);
        const moduleExports = await this.evaluatePluginCode(jsCode, filename);
        this.registerModuleExports(filename, moduleExports);
      } catch (e) {
        this.host.console.error(`[ExternalPlugins] Failed to load plugin "${filename}":`, e);
      }
    }
  }

  private registerModuleExports(filename: string, moduleExports: ExternalPluginModule): void {
    if (!this.isPluginMetadata(moduleExports.manifest)) {
      this.host.console.error(`[ExternalPlugins] Plugin "${filename}" is missing a valid exported manifest.`);
      return;
    }

    if (!this.isPluginClass(moduleExports.default)) {
      this.host.console.error(
        `[ExternalPlugins] Plugin "${filename}" is missing a valid default plugin class export.`,
      );
      return;
    }

    this.registerPlugin(moduleExports.manifest, moduleExports.default);
  }

  private isPluginMetadata(value: unknown): value is PluginMetadata {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as Partial<PluginMetadata>;
    return (
      typeof candidate.id === "string" &&
      typeof candidate.name === "string" &&
      typeof candidate.description === "string" &&
      typeof candidate.version === "string"
    );
  }

  private isPluginClass(value: unknown): value is ExternalPluginClass {
    return typeof value === "function";
  }

  private ensureExternalModuleRegistry(): ExternalModuleRegistry {
    const globalScope = globalThis as Record<string, unknown>;
    const existing = globalScope[EXTERNAL_MODULES_GLOBAL_KEY];
    if (existing && typeof existing === "object") {
      return existing as ExternalModuleRegistry;
    }

    const registry: ExternalModuleRegistry = {};
    globalScope[EXTERNAL_MODULES_GLOBAL_KEY] = registry;
    return registry;
  }

  private registerExternalModule(moduleId: string, moduleExports: unknown): void {
    const registry = this.ensureExternalModuleRegistry();
    registry[moduleId] = moduleExports;
  }

  private createExternalModuleSource(moduleId: string, moduleExports: unknown): string {
    const safeModuleId = JSON.stringify(moduleId);
    const globalKey = JSON.stringify(EXTERNAL_MODULES_GLOBAL_KEY);
    const namedExports =
      moduleExports && typeof moduleExports === "object"
        ? Object.keys(moduleExports).filter(key => key !== "default" && /^[$A-Z_a-z][$\w]*$/.test(key))
        : [];

    const namedExportLines = namedExports.map(
      key => `export const ${key} = moduleValue[${JSON.stringify(key)}];`,
    );

    return [
      `const registry = globalThis[${globalKey}];`,
      `if (!registry || typeof registry !== "object") throw new Error("External module registry is missing");`,
      `const moduleValue = registry[${safeModuleId}];`,
      `if (moduleValue === undefined) throw new Error("Missing external module: ${moduleId}");`,
      'const normalizedDefault = moduleValue && typeof moduleValue === "object" && "default" in moduleValue ? moduleValue.default : moduleValue;',
      "export default normalizedDefault;",
      ...namedExportLines,
    ].join("\n");
  }

  private createExternalModuleUrl(moduleId: string, moduleExports: unknown): string {
    const source = this.createExternalModuleSource(moduleId, moduleExports);
    const blob = new Blob([source], { type: "application/javascript" });
    return URL.createObjectURL(blob);
  }

  private extractImportSpecifiers(jsCode: string): Set<string> {
    const importSpecifiers = new Set<string>();
    const lines = jsCode.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("import") && !trimmed.startsWith("export")) {
        continue;
      }

      const fromIndex = trimmed.indexOf(" from ");
      const sideEffectImport = trimmed.startsWith("import ") && fromIndex === -1;

      let quoteStart = -1;
      if (fromIndex >= 0) {
        const fromSegment = trimmed.slice(fromIndex + " from ".length);
        const single = fromSegment.indexOf("'");
        const dbl = fromSegment.indexOf('"');
        const first = single === -1 ? dbl : dbl === -1 ? single : Math.min(single, dbl);
        if (first >= 0) {
          quoteStart = fromIndex + " from ".length + first;
        }
      } else if (sideEffectImport) {
        const single = trimmed.indexOf("'");
        const dbl = trimmed.indexOf('"');
        quoteStart = single === -1 ? dbl : dbl === -1 ? single : Math.min(single, dbl);
      }

      if (quoteStart < 0) {
        continue;
      }

      const quoteChar = trimmed[quoteStart];
      const quoteEnd = trimmed.indexOf(quoteChar, quoteStart + 1);
      if (quoteEnd <= quoteStart + 1) {
        continue;
      }

      importSpecifiers.add(trimmed.slice(quoteStart + 1, quoteEnd));
    }

    return importSpecifiers;
  }

  private rewriteExternalImportSpecifiers(jsCode: string): {
    code: string;
    generatedUrls: string[];
  } {
    const registry = this.ensureExternalModuleRegistry();
    const generatedUrls: string[] = [];

    const importSpecifiers = this.extractImportSpecifiers(jsCode);

    let rewrittenCode = jsCode;

    for (const specifier of importSpecifiers) {
      if (!(specifier in registry)) {
        continue;
      }

      const moduleUrl = this.createExternalModuleUrl(specifier, registry[specifier]);
      generatedUrls.push(moduleUrl);

      rewrittenCode = rewrittenCode.split(`"${specifier}"`).join(`"${moduleUrl}"`);
      rewrittenCode = rewrittenCode.split(`'${specifier}'`).join(`"${moduleUrl}"`);
    }

    return { code: rewrittenCode, generatedUrls };
  }

  /**
   * Reads the plugin index from disk.
   *
   * @returns Array of plugin filenames, or an empty array when missing.
   */
  private async readIndex(): Promise<string[]> {
    try {
      const content = await this.host.files.readTextFile(PLUGIN_INDEX);
      return JSON.parse(content) as string[];
    } catch {
      return [];
    }
  }

  /**
   * Evaluates plugin source safely via a Blob object URL dynamic import.
   *
   * @param jsCode - Raw JavaScript plugin source.
   * @param filename - Filename used for diagnostic logging only.
   */
  private async evaluatePluginCode(jsCode: string, filename: string): Promise<ExternalPluginModule> {
    const { code, generatedUrls } = this.rewriteExternalImportSpecifiers(jsCode);
    const prelude = `const Plugin = globalThis.${BASE_PLUGIN_GLOBAL_KEY};\n`;
    const blob = new Blob([prelude, code], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);

    const globalScope = globalThis as Record<string, unknown>;
    const previousBasePlugin = globalScope[BASE_PLUGIN_GLOBAL_KEY];
    globalScope[BASE_PLUGIN_GLOBAL_KEY] = Plugin;

    try {
      const moduleExports = (await import(/* @vite-ignore */ url)) as ExternalPluginModule;
      this.host.console.log(`[ExternalPlugins] Evaluated plugin: ${filename}`);
      return moduleExports;
    } finally {
      if (previousBasePlugin === undefined) {
        delete globalScope[BASE_PLUGIN_GLOBAL_KEY];
      } else {
        globalScope[BASE_PLUGIN_GLOBAL_KEY] = previousBasePlugin;
      }
      generatedUrls.forEach(generatedUrl => URL.revokeObjectURL(generatedUrl));
      URL.revokeObjectURL(url);
    }
  }
}
