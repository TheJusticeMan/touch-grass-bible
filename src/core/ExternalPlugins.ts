import TouchGrassBibleApp from "../main";
import { Component } from "./Plugin";
import Plugin, { type PluginMetadata } from "./Plugin";

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
 * `true` at build time. It listens for the `tg-plugin-loaded` custom event
 * dispatched by `window.TouchGrassAPI.registerPlugin`.
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
    if (typeof window !== "undefined") {
      window.addEventListener("tg-plugin-loaded", this.handleRegistration);
    }
  }

  async onunload(): Promise<void> {
    if (typeof window !== "undefined") {
      window.removeEventListener("tg-plugin-loaded", this.handleRegistration);
    }
  }

  /**
   * Handles a `tg-plugin-loaded` event dispatched by external plugin code.
   *
   * Creates a plugin instance, tracks it by manifest id, and starts its
   * lifecycle via `addChild`.
   */
  private handleRegistration = (event: Event): void => {
    const { manifest, pluginClass } = (
      event as CustomEvent<{
        manifest: PluginMetadata;
        pluginClass: new (app: TouchGrassBibleApp, manifest: PluginMetadata) => Plugin;
      }>
    ).detail;

    if (this.plugins.has(manifest.id)) {
      this.host.console.warn(
        `[ExternalPlugins] Plugin "${manifest.id}" is already registered. Skipping.`,
      );
      return;
    }

    try {
      const instance = new pluginClass(this.host, manifest);
      this.plugins.set(manifest.id, instance);
      this.addChild(instance).catch(e => {
        this.host.console.error(
          `[ExternalPlugins] Failed to start lifecycle for plugin "${manifest.id}":`,
          e,
        );
      });
      this.host.console.log(`[ExternalPlugins] Registered plugin: ${manifest.id}`);
    } catch (e) {
      this.host.console.error(
        `[ExternalPlugins] Failed to instantiate plugin "${manifest.id}":`,
        e,
      );
    }
  };

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
      await this.host.writeTextFile(path, jsCode);

      const index = await this.readIndex();
      if (!index.includes(filename)) {
        index.push(filename);
        await this.host.writeTextFile(PLUGIN_INDEX, JSON.stringify(index));
      }

      this.host.console.log(`[ExternalPlugins] Installed plugin: ${filename}`);
    } catch (e) {
      this.host.console.error(`[ExternalPlugins] Failed to install plugin "${filename}":`, e);
    }
  }

  /**
   * Loads and evaluates all JS files listed in the plugin index.
   *
   * Each file is converted to a Blob, exposed as an object URL, and
   * dynamically imported so the module's side-effect calls
   * `window.TouchGrassAPI.registerPlugin`. The object URL is revoked
   * immediately after the import settles.
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
        const jsCode = await this.host.readTextFile(path);
        await this.evaluatePluginCode(jsCode, filename);
      } catch (e) {
        this.host.console.error(`[ExternalPlugins] Failed to load plugin "${filename}":`, e);
      }
    }
  }

  /**
   * Reads the plugin index from disk.
   *
   * @returns Array of plugin filenames, or an empty array when missing.
   */
  private async readIndex(): Promise<string[]> {
    try {
      const content = await this.host.readTextFile(PLUGIN_INDEX);
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
  private async evaluatePluginCode(jsCode: string, filename: string): Promise<void> {
    const blob = new Blob([jsCode], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    try {
      // eslint-disable-next-line security/detect-non-literal-require
      await import(/* @vite-ignore */ url);
      this.host.console.log(`[ExternalPlugins] Evaluated plugin: ${filename}`);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
