import { App } from "./App";
import { Component, ePlugin } from "./Plugin";

const DEFAULT_BASE_PLUGIN_GLOBAL_KEY = "__tg_external_base_plugin__";
const DEFAULT_EXTERNAL_MODULES_GLOBAL_KEY = "__tg_external_modules__";

type ExternalModuleRegistry = Record<string, unknown>;

type ExternalPluginModule = {
  manifest?: unknown;
  default?: unknown;
};

type HostModuleValue<AppType extends App> = unknown | ((host: AppType) => unknown);

type RegisteredModule<AppType extends App> = {
  id: string;
  exports: HostModuleValue<AppType>;
};

export type ExternalPluginClass<
  AppType extends App,
  ManifestType extends { id: string },
  PluginType extends ePlugin<AppType>,
> = new (app: AppType, manifest: ManifestType) => PluginType;

export type ExternalPluginRuntimeOptions<
  AppType extends App,
  ManifestType extends { id: string },
  PluginType extends ePlugin<AppType>,
> = {
  host: AppType;
  pluginBaseClass: ExternalPluginClass<AppType, ManifestType, PluginType>;
  isManifest: (value: unknown) => value is ManifestType;
  pluginCompatModuleId?: string;
  pluginCompatModuleExports?: unknown;
  additionalModules?: RegisteredModule<AppType>[];
  pluginsDir?: string;
  basePluginGlobalKey?: string;
  externalModulesGlobalKey?: string;
};

/**
 * Generic runtime for loading and managing externally installed plugins.
 *
 * Host applications provide the app instance, plugin base class, and module
 * registrations needed by third-party plugin code.
 */
export class eExternalPlugins<
  AppType extends App,
  ManifestType extends { id: string },
  PluginType extends ePlugin<AppType>,
> extends Component {
  readonly plugins: Map<string, PluginType> = new Map();

  private readonly host: AppType;
  private readonly pluginBaseClass: ExternalPluginClass<AppType, ManifestType, PluginType>;
  private readonly isManifest: (value: unknown) => value is ManifestType;
  private readonly pluginCompatModuleId: string;
  private readonly pluginCompatModuleExports: unknown;
  private readonly additionalModules: RegisteredModule<AppType>[];
  private readonly pluginsDir: string;
  private readonly pluginIndexPath: string;
  private readonly basePluginGlobalKey: string;
  private readonly externalModulesGlobalKey: string;

  constructor(options: ExternalPluginRuntimeOptions<AppType, ManifestType, PluginType>) {
    super();
    this.host = options.host;
    this.pluginBaseClass = options.pluginBaseClass;
    this.isManifest = options.isManifest;
    this.pluginCompatModuleId = options.pluginCompatModuleId ?? "src/core/Plugin";
    this.pluginCompatModuleExports =
      options.pluginCompatModuleExports ??
      ({
        default: this.pluginBaseClass,
        Plugin: this.pluginBaseClass,
        Component,
      } as const);
    this.additionalModules = options.additionalModules ?? [];
    this.pluginsDir = options.pluginsDir ?? "plugins";
    this.pluginIndexPath = `${this.pluginsDir}/index.json`;
    this.basePluginGlobalKey = options.basePluginGlobalKey ?? DEFAULT_BASE_PLUGIN_GLOBAL_KEY;
    this.externalModulesGlobalKey = options.externalModulesGlobalKey ?? DEFAULT_EXTERNAL_MODULES_GLOBAL_KEY;
  }

  async onload(): Promise<void> {
    this.ensureExternalModuleRegistry();
    this.registerExternalModule(this.pluginCompatModuleId, this.pluginCompatModuleExports);

    for (const moduleInfo of this.additionalModules) {
      const exportsValue =
        typeof moduleInfo.exports === "function"
          ? (moduleInfo.exports as (host: AppType) => unknown)(this.host)
          : moduleInfo.exports;
      this.registerExternalModule(moduleInfo.id, exportsValue);
    }
  }

  async installPlugin(jsCode: string, filename: string): Promise<void> {
    try {
      const path = `${this.pluginsDir}/${filename}`;
      await this.host.files.writeTextFile(path, jsCode);

      const index = await this.readIndex();
      if (!index.includes(filename)) {
        index.push(filename);
        await this.host.files.writeTextFile(this.pluginIndexPath, JSON.stringify(index));
      }

      this.host.console.log(`[ExternalPlugins] Installed plugin: ${filename}`);
    } catch (e) {
      this.host.console.error(`[ExternalPlugins] Failed to install plugin "${filename}":`, e);
    }
  }

  async uninstallPlugin(filename: string): Promise<void> {
    try {
      const path = `${this.pluginsDir}/${filename}`;

      try {
        await this.host.files.writeTextFile(path, "");
      } catch {
        // Ignore errors if the platform does not support deletion.
      }

      const index = await this.readIndex();
      const filtered = index.filter(f => f !== filename);
      if (filtered.length < index.length) {
        await this.host.files.writeTextFile(this.pluginIndexPath, JSON.stringify(filtered));
      }

      this.host.console.log(`[ExternalPlugins] Uninstalled plugin: ${filename}`);
    } catch (e) {
      this.host.console.error(`[ExternalPlugins] Failed to uninstall plugin "${filename}":`, e);
    }
  }

  async getInstalledPlugins(): Promise<string[]> {
    return this.readIndex();
  }

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
        const path = `${this.pluginsDir}/${filename}`;
        const jsCode = await this.host.files.readTextFile(path);
        const moduleExports = await this.evaluatePluginCode(jsCode, filename);
        this.registerModuleExports(filename, moduleExports);
      } catch (e) {
        this.host.console.error(`[ExternalPlugins] Failed to load plugin "${filename}":`, e);
      }
    }
  }

  private registerPlugin(
    manifest: ManifestType,
    pluginClass: ExternalPluginClass<AppType, ManifestType, PluginType>,
  ): void {
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

  private registerModuleExports(filename: string, moduleExports: ExternalPluginModule): void {
    if (!this.isManifest(moduleExports.manifest)) {
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

  private isPluginClass(value: unknown): value is ExternalPluginClass<AppType, ManifestType, PluginType> {
    return typeof value === "function";
  }

  private ensureExternalModuleRegistry(): ExternalModuleRegistry {
    const globalScope = globalThis as Record<string, unknown>;
    const existing = globalScope[this.externalModulesGlobalKey];
    if (existing && typeof existing === "object") {
      return existing as ExternalModuleRegistry;
    }

    const registry: ExternalModuleRegistry = {};
    globalScope[this.externalModulesGlobalKey] = registry;
    return registry;
  }

  private registerExternalModule(moduleId: string, moduleExports: unknown): void {
    const registry = this.ensureExternalModuleRegistry();
    registry[moduleId] = moduleExports;
  }

  private createExternalModuleSource(moduleId: string, moduleExports: unknown): string {
    const safeModuleId = JSON.stringify(moduleId);
    const globalKey = JSON.stringify(this.externalModulesGlobalKey);
    const namedExports =
      moduleExports && typeof moduleExports === "object"
        ? Object.keys(moduleExports).filter(key => key !== "default" && /^[$A-Z_a-z][$\w]*$/.test(key))
        : [];

    const namedExportLines = namedExports.map(
      key => `export const ${key} = moduleValue[${JSON.stringify(key)}];`,
    );

    return [
      `const registry = globalThis[${globalKey}];`,
      'if (!registry || typeof registry !== "object") throw new Error("External module registry is missing");',
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

  private async readIndex(): Promise<string[]> {
    try {
      const content = await this.host.files.readTextFile(this.pluginIndexPath);
      return JSON.parse(content) as string[];
    } catch {
      return [];
    }
  }

  private async evaluatePluginCode(jsCode: string, filename: string): Promise<ExternalPluginModule> {
    const { code, generatedUrls } = this.rewriteExternalImportSpecifiers(jsCode);
    const prelude = `const Plugin = globalThis.${this.basePluginGlobalKey};\n`;
    const blob = new Blob([prelude, code], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);

    const globalScope = globalThis as Record<string, unknown>;
    const previousBasePlugin = globalScope[this.basePluginGlobalKey];
    globalScope[this.basePluginGlobalKey] = this.pluginBaseClass;

    try {
      const moduleExports = (await import(/* @vite-ignore */ url)) as ExternalPluginModule;
      this.host.console.log(`[ExternalPlugins] Evaluated plugin: ${filename}`);
      return moduleExports;
    } finally {
      if (previousBasePlugin === undefined) {
        delete globalScope[this.basePluginGlobalKey];
      } else {
        globalScope[this.basePluginGlobalKey] = previousBasePlugin;
      }
      generatedUrls.forEach(generatedUrl => URL.revokeObjectURL(generatedUrl));
      URL.revokeObjectURL(url);
    }
  }
}

export class ExternalPlugins<
  AppType extends App,
  ManifestType extends { id: string },
  PluginType extends ePlugin<AppType>,
> extends eExternalPlugins<AppType, ManifestType, PluginType> {}
