import { DEFAULT_CATEGORY_ORDER } from "../config/CommandPaletteSettings";
import { DEFAULT_SETTINGS } from "../config/TGAppSettings";
import { CommandPaletteState } from "../external/CommandPalette";
import { BrowserConsole } from "../external/MyBrowserConsole";
import { LayoutNode, View } from "../external/Workspace/Workspace";
import TouchGrassBibleApp from "../main";
import { VerseRef } from "../models/VerseRef";
import Plugin, { Component } from "./Plugin";

export const HOST_MODULE_ID = "@touch-grass-bible" as const;
export const HOST_API_VERSION = "1.0.0" as const;

export type ExternalHostApi = {
  readonly HOST_MODULE_ID: typeof HOST_MODULE_ID;
  readonly HOST_API_VERSION: typeof HOST_API_VERSION;
  readonly app: TouchGrassBibleApp;
  readonly default: typeof Plugin;
  readonly Plugin: typeof Plugin;
  readonly Component: typeof Component;
  readonly VerseRef: typeof VerseRef;
  readonly CommandPaletteState: typeof CommandPaletteState;
  readonly BrowserConsole: typeof BrowserConsole;
  readonly View: typeof View;
  readonly LayoutNode: typeof LayoutNode;
  readonly DEFAULT_SETTINGS: typeof DEFAULT_SETTINGS;
  readonly DEFAULT_CATEGORY_ORDER: typeof DEFAULT_CATEGORY_ORDER;
};

export function createExternalHostApi(app: TouchGrassBibleApp): ExternalHostApi {
  return {
    HOST_MODULE_ID,
    HOST_API_VERSION,
    app,
    default: Plugin,
    Plugin,
    Component,
    VerseRef,
    CommandPaletteState,
    BrowserConsole,
    View,
    LayoutNode,
    DEFAULT_SETTINGS,
    DEFAULT_CATEGORY_ORDER,
  };
}
