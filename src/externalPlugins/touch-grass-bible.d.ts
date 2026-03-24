declare module "@touch-grass-bible" {
  export { DEFAULT_CATEGORY_ORDER, DEFAULT_SETTINGS } from "src/config/TGAppSettings";
  export { HOST_API_VERSION, HOST_MODULE_ID, type ExternalHostApi } from "src/core/ExternalHostApi";
  export { Component, default, default as Plugin } from "src/core/Plugin";
  export type { IconActionItem, PluginMetadata } from "src/core/Plugin";
  export { CommandPaletteState } from "src/external/CommandPalette";
  export { BrowserConsole } from "src/external/MyBrowserConsole";
  export { LayoutNode, View } from "src/external/Workspace/Workspace";
  export { VerseRef } from "src/models/VerseRef";
}

declare module "@touch-grass-bible/host" {
  export * from "@touch-grass-bible";
  export { default } from "@touch-grass-bible";
}
