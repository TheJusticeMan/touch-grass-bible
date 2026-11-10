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

type ModuleSpecifierReference = {
  start: number;
  end: number;
  quote: string;
  specifier: string;
};

function isIdentifierStart(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z_$]/.test(character);
}

function isIdentifierPart(character: string | undefined): boolean {
  return character !== undefined && /[A-Za-z0-9_$]/.test(character);
}

function isWhitespace(source: string, index: number): boolean {
  return source[index].trim() === "";
}

function isLineLeading(source: string, index: number): boolean {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (source[cursor] === "\\n" || source[cursor] === "\\r") return true;
    if (!isWhitespace(source, cursor)) return false;
  }
  return true;
}

function readIdentifier(source: string, start: number): { value: string; end: number } | null {
  if (!isIdentifierStart(source[start])) return null;
  let end = start + 1;
  while (isIdentifierPart(source[end])) end += 1;
  return { value: source.slice(start, end), end };
}

function readStringLiteral(source: string, start: number): ModuleSpecifierReference | null {
  const quote = source[start];
  if (quote !== "'" && quote !== '"' && quote !== "`") return null;

  let end = start + 1;
  while (end < source.length) {
    if (source.charCodeAt(end) === 92) {
      end += 2;
    } else if (source[end] === quote) {
      return {
        start,
        end: end + 1,
        quote,
        specifier: source.slice(start + 1, end),
      };
    } else {
      end += 1;
    }
  }
  return null;
}

function skipLine(source: string, start: number): number {
  let end = start;
  while (end < source.length && source.charCodeAt(end) !== 10 && source.charCodeAt(end) !== 13) end += 1;
  return end;
}

function skipTrivia(source: string, start: number): number {
  let index = start;
  while (index < source.length) {
    if (isWhitespace(source, index)) {
      index += 1;
    } else if (source[index] === "/" && source[index + 1] === "/") {
      index = skipLine(source, index + 2);
    } else if (source[index] === "/" && source[index + 1] === "*") {
      const commentEnd = source.indexOf("*/", index + 2);
      index = commentEnd === -1 ? source.length : commentEnd + 2;
    } else {
      break;
    }
  }
  return index;
}

function readModuleSpecifierAfter(
  source: string,
  start: number,
  isExport: boolean,
): ModuleSpecifierReference | null {
  let index = skipTrivia(source, start);
  if (isExport) {
    if (source[index] !== "{" && source[index] !== "*") return null;
  } else {
    if (source[index] === "." || source[index] === "(") return null;
    const sideEffectSpecifier = readStringLiteral(source, index);
    if (sideEffectSpecifier) return sideEffectSpecifier;
  }

  let braceDepth = 0;
  while (index < source.length) {
    index = skipTrivia(source, index);
    const character = source[index];
    if (character === undefined || character === ";") return null;

    if (character === "'" || character === '"' || character === "`") {
      const literal = readStringLiteral(source, index);
      if (!literal) return null;
      index = literal.end;
      continue;
    }
    if (character === "{") {
      braceDepth += 1;
      index += 1;
      continue;
    }
    if (character === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      index += 1;
      if (isExport && braceDepth === 0) {
        const next = readIdentifier(source, skipTrivia(source, index));
        if (next?.value !== "from") return null;
      }
      continue;
    }

    const identifier = readIdentifier(source, index);
    if (identifier) {
      if (identifier.value === "from" && braceDepth === 0) {
        return readStringLiteral(source, skipTrivia(source, identifier.end));
      }
      index = identifier.end;
    } else {
      index += 1;
    }
  }

  return null;
}

// Tokenize enough JavaScript syntax to rewrite static module specifiers without
// changing matching text inside comments, string literals, or template literals.
function findStaticModuleSpecifiers(source: string): ModuleSpecifierReference[] {
  const references: ModuleSpecifierReference[] = [];
  let index = 0;
  while (index < source.length) {
    index = skipTrivia(source, index);
    const character = source[index];
    if (character === undefined) break;

    if (character === "'" || character === '"' || character === "`") {
      const literal = readStringLiteral(source, index);
      index = literal?.end ?? source.length;
      continue;
    }

    const identifier = readIdentifier(source, index);
    if (!identifier) {
      index += 1;
      continue;
    }

    const isStatementStart = isLineLeading(source, index);
    const isImport = identifier.value === "import" && source[index - 1] !== "." && isStatementStart;
    const isExport = identifier.value === "export" && isStatementStart;
    if (isImport || isExport) {
      const specifier = readModuleSpecifierAfter(source, identifier.end, isExport);
      if (specifier) {
        references.push(specifier);
        index = specifier.end;
        continue;
      }
    }
    index = identifier.end;
  }
  return references;
}

export type ExternalPluginLoadFailure = {
  filename: string;
  error: unknown;
};

export type ExternalPluginLoadReport = {
  loaded: string[];
  failed: ExternalPluginLoadFailure[];
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
  private readonly pluginIdsByFilename = new Map<string, string>();
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
    this.validatePluginFilename(filename);

    try {
      const index = await this.readIndex();
      const path = `${this.pluginsDir}/${filename}`;
      await this.host.files.writeTextFile(path, jsCode);

      if (!index.includes(filename)) {
        try {
          index.push(filename);
          await this.host.files.writeTextFile(this.pluginIndexPath, JSON.stringify(index));
        } catch (error) {
          try {
            await this.host.files.writeTextFile(path, "");
          } catch (cleanupError) {
            this.host.console.warn(
              `[ExternalPlugins] Could not roll back plugin file "${filename}":`,
              cleanupError,
            );
          }
          throw error;
        }
      }

      try {
        await this.unloadRegisteredPlugin(filename);
      } catch (error) {
        this.host.console.warn(
          `[ExternalPlugins] Replaced plugin "${filename}" did not shut down cleanly:`,
          error,
        );
      }
      this.host.console.log(`[ExternalPlugins] Installed plugin: ${filename}`);
    } catch (error) {
      this.host.console.error(`[ExternalPlugins] Failed to install plugin "${filename}":`, error);
      throw error;
    }
  }

  async uninstallPlugin(filename: string): Promise<void> {
    this.validatePluginFilename(filename);

    try {
      const index = await this.readIndex();
      const filtered = index.filter(entry => entry !== filename);
      if (filtered.length < index.length) {
        await this.host.files.writeTextFile(this.pluginIndexPath, JSON.stringify(filtered));
      }

      try {
        await this.unloadRegisteredPlugin(filename);
      } catch (error) {
        this.host.console.error(
          `[ExternalPlugins] Plugin "${filename}" failed during shutdown after removal:`,
          error,
        );
      }

      try {
        await this.host.files.writeTextFile(`${this.pluginsDir}/${filename}`, "");
      } catch (error) {
        this.host.console.warn(
          `[ExternalPlugins] Could not clear uninstalled plugin file "${filename}":`,
          error,
        );
      }

      this.host.console.log(`[ExternalPlugins] Uninstalled plugin: ${filename}`);
    } catch (error) {
      this.host.console.error(`[ExternalPlugins] Failed to uninstall plugin "${filename}":`, error);
      throw error;
    }
  }

  async getInstalledPlugins(): Promise<string[]> {
    return this.readIndex();
  }

  async loadAll(): Promise<ExternalPluginLoadReport> {
    const report: ExternalPluginLoadReport = { loaded: [], failed: [] };
    let filenames: string[];
    try {
      filenames = await this.readIndex();
    } catch (error) {
      this.host.console.error(
        "[ExternalPlugins] Failed to read plugin index; skipping external plugins.",
        error,
      );
      report.failed.push({ filename: this.pluginIndexPath, error });
      return report;
    }

    for (const filename of filenames) {
      try {
        this.validatePluginFilename(filename);
        const path = `${this.pluginsDir}/${filename}`;
        const jsCode = await this.host.files.readTextFile(path);
        const moduleExports = await this.evaluatePluginCode(jsCode, filename);
        await this.registerModuleExports(filename, moduleExports);
        report.loaded.push(filename);
      } catch (error) {
        this.host.console.error(`[ExternalPlugins] Failed to load plugin "${filename}":`, error);
        report.failed.push({ filename, error });
      }
    }

    return report;
  }

  private async registerPlugin(
    filename: string,
    manifest: ManifestType,
    pluginClass: ExternalPluginClass<AppType, ManifestType, PluginType>,
  ): Promise<void> {
    if (this.plugins.has(manifest.id)) {
      if (this.pluginIdsByFilename.get(filename) === manifest.id) return;
      throw new Error(`Plugin id "${manifest.id}" is already registered by another file.`);
    }

    const instance = new pluginClass(this.host, manifest);
    this.plugins.set(manifest.id, instance);
    this.pluginIdsByFilename.set(filename, manifest.id);

    try {
      await this.addChild(instance);
      this.host.console.log(`[ExternalPlugins] Registered plugin: ${manifest.id}`);
    } catch (error) {
      this.plugins.delete(manifest.id);
      this.pluginIdsByFilename.delete(filename);
      try {
        await this.removeChild(instance);
      } catch (cleanupError) {
        this.host.console.error(
          `[ExternalPlugins] Failed to clean up plugin "${manifest.id}" after startup failure:`,
          cleanupError,
        );
      }
      throw error;
    }
  }

  private async registerModuleExports(filename: string, moduleExports: ExternalPluginModule): Promise<void> {
    if (!this.isManifest(moduleExports.manifest)) {
      throw new Error(`Plugin "${filename}" is missing a valid manifest export.`);
    }

    if (!this.isPluginClass(moduleExports.default)) {
      throw new Error(`Plugin "${filename}" is missing a valid default plugin class export.`);
    }

    await this.registerPlugin(filename, moduleExports.manifest, moduleExports.default);
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

  private rewriteExternalImportSpecifiers(jsCode: string): {
    code: string;
    generatedUrls: string[];
  } {
    const registry = this.ensureExternalModuleRegistry();
    const generatedUrls: string[] = [];
    const urlsBySpecifier = new Map<string, string>();
    const references = findStaticModuleSpecifiers(jsCode);
    let code = jsCode;

    for (const reference of [...references].reverse()) {
      if (!Object.hasOwn(registry, reference.specifier)) continue;

      let moduleUrl = urlsBySpecifier.get(reference.specifier);
      if (!moduleUrl) {
        moduleUrl = this.createExternalModuleUrl(reference.specifier, registry[reference.specifier]);
        urlsBySpecifier.set(reference.specifier, moduleUrl);
        generatedUrls.push(moduleUrl);
      }

      const replacement = `${reference.quote}${moduleUrl}${reference.quote}`;
      code = `${code.slice(0, reference.start)}${replacement}${code.slice(reference.end)}`;
    }

    return { code, generatedUrls };
  }

  private validatePluginFilename(filename: string): void {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.js$/i.test(filename)) {
      throw new Error(`Invalid plugin filename: ${filename}`);
    }
  }

  private async unloadRegisteredPlugin(filename: string): Promise<void> {
    const pluginId = this.pluginIdsByFilename.get(filename);
    if (!pluginId) return;

    const instance = this.plugins.get(pluginId);
    try {
      if (instance) await this.removeChild(instance);
    } finally {
      this.plugins.delete(pluginId);
      this.pluginIdsByFilename.delete(filename);
    }
  }

  private isMissingFileError(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const candidate = error as { code?: unknown; message?: unknown };
    const code = typeof candidate.code === "string" ? candidate.code.toUpperCase() : "";
    const message = typeof candidate.message === "string" ? candidate.message : "";
    return (
      ["ENOENT", "NOT_FOUND", "OS-PLUG-FILENOTFOUND"].includes(code) ||
      /^(?:file or path )?not found$/i.test(message.trim()) ||
      /(?:file|path).*(?:not found|does not exist|no such file)/i.test(message)
    );
  }

  private async readIndex(): Promise<string[]> {
    let content: string;
    try {
      content = await this.host.files.readTextFile(this.pluginIndexPath);
    } catch (error) {
      if (this.isMissingFileError(error)) return [];
      throw error;
    }

    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error("External plugin index must be a JSON array.");
    }

    const filenames: string[] = [];
    for (const entry of parsed) {
      if (typeof entry !== "string") {
        throw new Error("External plugin index entries must be filenames.");
      }
      try {
        this.validatePluginFilename(entry);
        filenames.push(entry);
      } catch (error) {
        this.host.console.warn("Ignoring invalid filename in external plugin index:", error);
      }
    }

    return [...new Set(filenames)];
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
