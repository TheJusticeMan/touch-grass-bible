import { eExternalPlugins } from "src/external";
import TouchGrassBibleApp from "../main";
import { HOST_MODULE_ID, createExternalHostApi } from "./ExternalHostApi";
import Plugin, { type PluginMetadata } from "./Plugin";

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
export class ExternalPlugins extends eExternalPlugins<TouchGrassBibleApp, PluginMetadata, Plugin> {
  constructor(host: TouchGrassBibleApp) {
    super({
      host,
      pluginBaseClass: Plugin,
      isManifest: ExternalPlugins.isPluginMetadata,
      additionalModules: [
        {
          id: HOST_MODULE_ID,
          exports: (currentHost: TouchGrassBibleApp) => createExternalHostApi(currentHost),
        },
      ],
    });
  }

  private static isPluginMetadata(value: unknown): value is PluginMetadata {
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
}
