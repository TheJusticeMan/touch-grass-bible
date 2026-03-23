declare module "@touch-grass-bible" {
  export { default, default as Plugin, Component } from "src/core/Plugin";
  export type { IconActionItem, PluginMetadata } from "src/core/Plugin";
  export { VerseRef } from "src/models/VerseRef";
  export { CommandPaletteState } from "src/external/CommandPalette";
  export { BrowserConsole } from "src/external/MyBrowserConsole";
  export { LayoutNode, View } from "src/external/Workspace/Workspace";
  export { DEFAULT_CATEGORY_ORDER, DEFAULT_SETTINGS } from "src/config/TGAppSettings";
  export { HOST_MODULE_ID, HOST_API_VERSION, type ExternalHostApi } from "src/core/ExternalHostApi";
}

declare module "@touch-grass-bible/host" {
  export * from "@touch-grass-bible";
  export { default } from "@touch-grass-bible";
}
