declare module "@touch-grass-bible" {
  export { DEFAULT_SETTINGS } from "src/config/TGAppSettings";
  export { HOST_API_VERSION, HOST_MODULE_ID, type ExternalHostApi } from "src/core/ExternalHostApi";
  export { Component, default, default as Plugin } from "src/core/Plugin";
  export type { IconActionItem, PluginMetadata } from "src/core/Plugin";
  export {
    BrowserConsole,
    CommandPaletteState,
    DEFAULT_CATEGORY_ORDER,
    LayoutNode,
    View,
  } from "@touchgrass/framework";
  export { VerseRef } from "src/models/VerseRef";
}
