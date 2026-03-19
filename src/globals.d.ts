import type Plugin from "./core/Plugin";
import type { PluginMetadata } from "./core/Plugin";
import type TouchGrassBibleApp from "./main";

/**
 * Build-time flag injected by esbuild's `define` option.
 * When `true`, the external plugin system is enabled and `window.TouchGrassAPI`
 * is exposed. When `false`, the secure build is produced with a stricter CSP.
 */
declare global {
  const __ENABLE_EXTERNAL_PLUGINS__: boolean;

  interface Window {
    /**
     * Public plugin API exposed only when `__ENABLE_EXTERNAL_PLUGINS__` is
     * `true` at build time.
     */
    TouchGrassAPI?: {
      /** Base class external plugins must extend. */
      Plugin: typeof Plugin;
      /**
       * Registers an external plugin with the application.
       *
       * Dispatches a `tg-register-plugin` custom event that
       * `ExternalPlugins` listens for.
       *
       * @param manifest - Plugin metadata.
       * @param pluginClass - Plugin constructor.
       */
      registerPlugin: (
        manifest: PluginMetadata,
        pluginClass: new (app: TouchGrassBibleApp, manifest: PluginMetadata) => Plugin,
      ) => void;
    };
  }
}

export {};

