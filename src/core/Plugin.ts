import { IconNode } from "lucide";
import { eInternalPlugins, ePlugin } from "@touchgrass/framework";
import TouchGrassBibleApp from "../main";
import { VerseInfoComponent } from "../ui/VerseScreen";

/**
 * Action definition rendered in verse-level action areas.
 */
export type IconActionItem = {
  /** Unique action identifier used for registration and teardown. */
  id: string;

  /** Human-readable action label shown in UI surfaces. */
  name: string;

  /** Optional helper text describing what the action does. */
  description?: string;

  /** Lucide icon node rendered for the action. */
  icon: IconNode;

  /**
   * Action handler executed with the active verse context.
   *
   * @param verseInfo - Current verse information component.
   */
  onTrigger: (verseInfo: VerseInfoComponent) => void;
};

/**
 * Static metadata that identifies and describes a plugin.
 */
export type PluginMetadata = {
  /** Stable plugin id used for registry keys and persisted settings scopes. */
  id: string;

  /** Human-readable plugin name. */
  name: string;

  /** Human-readable plugin description. */
  description: string;

  /** Semantic or display version for the plugin. */
  version: string;
};

/**
 * Base class for internal plugins registered with the application runtime.
 *
 * `Plugin` keeps plugin-specific lifecycle and registration concerns local,
 * while exposing grouped app capabilities through `app`, `palette`,
 * `commands`, `workspace`, and `files`.
 *
 * @remarks
 * Any command, view, palette, or verse action registered through this class is
 * automatically removed when the plugin unloads.
 */
export default class Plugin extends ePlugin<TouchGrassBibleApp> {
  /**
   * Creates a plugin instance bound to an app and manifest.
   *
   * @param app - Application instance that owns this plugin.
   * @param manifest - Plugin metadata used for identity and settings scope.
   */
  constructor(
    readonly app: TouchGrassBibleApp,
    public manifest: PluginMetadata,
  ) {
    super(app, manifest);
  }

  /**
   * Registers a verse action button with automatic unload cleanup.
   *
   * @param action - Verse action definition including icon and trigger handler.
   */
  addVerseAction({ id, name, description, icon, onTrigger }: IconActionItem) {
    this.app.addVerseAction({ id, name, description, icon, onTrigger });
    this.registerUnload(() => this.app.removeVerseAction(id));
    return this;
  }
}

/**
 * Internal plugin registry and lifecycle coordinator.
 *
 * This manager tracks plugin instances by manifest id, prevents duplicates, and
 * wires plugin lifecycles into the shared `Component` parent lifecycle.
 *
 * @example
 * ```ts
 * manager.addPlugins(
 *   { pluginClass: NotesPlugin, manifest: notesManifest },
 *   { pluginClass: SearchPlugin, manifest: searchManifest },
 * );
 * ```
 */

export class InternalPlugins extends eInternalPlugins<TouchGrassBibleApp> {
  constructor(public app: TouchGrassBibleApp) {
    super(app);
  }
}
