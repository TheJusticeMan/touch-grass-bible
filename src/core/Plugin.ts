import { IconNode } from "lucide";
import { CommandPaletteState, CategoryLoaderFunc, UnifiedCommandPalette } from "../external/CommandPalette";
import { TGAppSettings } from "../config/TGAppSettings";
import { LayoutNode, View, Workspace } from "../external/Workspace";
import TouchGrassBibleApp from "../main";
import { BrowserConsole } from "../external/MyBrowserConsole";
import { PaletteState } from "../external/PaletteStateController";
import { VerseInfoComponent } from "../ui/VerseScreen";
import { AppCommand } from "../external/App";

type VerseStateValue = TouchGrassBibleApp["verseState"] extends PaletteState<infer T> ? T : never;

type PluginAppApi = {
  readonly console: BrowserConsole;
  readonly fab: HTMLButtonElement | null;
  readonly verseState: PaletteState<VerseStateValue>;
  settings: TGAppSettings;
  openCommandPalette(state?: Partial<CommandPaletteState>): void;
  saveSettings(): void;
  saveSettingsAfterDelay(delay?: number): void;
};

type PluginPaletteApi = {
  readonly instance: UnifiedCommandPalette;
  menu(): void;
  useState<T>(initialValue: T): PaletteState<T>;
  prompt(text: string): Promise<string | null>;
  confirm(text: string): Promise<boolean>;
  setCategoryOrder(order: string[]): void;
};

type PluginCommandsApi = {
  get(commandId: string): AppCommand | undefined;
  list(): AppCommand[];
};

type PluginWorkspaceApi = {
  readonly activePanel: LayoutNode | null;
  readonly rootPanel: LayoutNode;
  open(viewType: string, panel: LayoutNode, options?: Parameters<Workspace["openView"]>[2]): View | null;
  activate(viewType: string): boolean;
  getActiveViewOfType(viewType: string): View | null;
  openDialog(options?: Parameters<Workspace["openDialog"]>[0]): ReturnType<Workspace["openDialog"]>;
};

type PluginFilesApi = {
  loadJSON<T>(url: string): Promise<T>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  readJson<T>(path: string): Promise<T>;
  writeJson(path: string, data: unknown): Promise<void>;
  upload(
    accept: string,
    onFileContent: (content: unknown) => void,
    onError?: (error: unknown) => void,
    onWarn?: (message: string) => void,
  ): Promise<void>;
  download(filename: string, data: unknown): void;
};

type EventTargetLike<E extends Record<string, unknown>> = {
  on<K extends keyof E>(eventName: K, handler: (e: E[K]) => void): unknown;
  off<K extends keyof E>(eventName: K, handler: (e: E[K]) => void): unknown;
};

type StateTargetLike<T> = {
  onChange(listener: (value: T, previous: T) => void): () => void;
};

/**
 * Base lifecycle unit for plugin-like objects.
 *
 * `Component` provides a small asynchronous lifecycle with child composition
 * and teardown registration helpers. It is used as the foundation for both the
 * public plugin API and internal plugin manager.
 *
 * @remarks
 * Lifecycle ordering is:
 * 1. `load()` calls `onload()` once.
 * 2. Children are loaded after the parent hook resolves.
 * 3. `unload()` calls `onunload()`, then registered unloaders, then child unload.
 *
 * Repeated `load()` or `unload()` calls are safe and return the current instance.
 *
 * @example
 * ```ts
 * class MyComponent extends Component {
 *   async onload(): Promise<void> {
 *     this.registerUnload(() => console.log("cleanup"));
 *   }
 * }
 *
 * const component = new MyComponent();
 * await component.load();
 * await component.unload();
 * ```
 */
export abstract class Component {
  /** Indicates whether this component has completed a successful load cycle. */
  private loaded = false;

  /** Child components that inherit this component's lifecycle. */
  private children: Component[] = [];

  /**
   * Teardown callbacks executed during `unload()`.
   *
   * Use `registerUnload()` to add callbacks so cleanup remains centralized.
   */
  unloaders: (() => void)[] = [];

  /**
   * Loads this component once, then loads all child components.
   *
   * @returns The current instance for fluent chaining.
   */
  async load() {
    if (this instanceof Plugin) this.console.log("Loading plugin...");
    if (this.loaded) return this; // Prevent double load
    await this.onload();
    this.loaded = true;
    await Promise.all(this.children.map(child => child.load()));
    if (this instanceof Plugin) this.console.log("Plugin loaded.");
    return this;
  }

  /**
   * Unloads this component once, running teardown callbacks and child unloads.
   *
   * @returns The current instance for fluent chaining.
   */
  async unload() {
    if (!this.loaded) return this; // Prevent double unload
    await this.onunload();
    this.unloaders.forEach(unload => unload());
    await Promise.all(this.children.map(child => child.unload()));
    this.loaded = false;
    return this;
  }

  /**
   * Adds a child component to lifecycle management.
   *
   * If this component is already loaded, the child is loaded immediately.
   *
   * @param child - Child component to register.
   * @returns The current instance for fluent chaining.
   */
  async addChild(child: Component) {
    this.children.push(child);
    if (this.loaded) await child.load();
    return this;
  }

  /**
   * Removes a child component from lifecycle management.
   *
   * If this component is loaded, the child is unloaded before removal completes.
   *
   * @param child - Child component to remove.
   * @returns The current instance for fluent chaining.
   */
  async removeChild(child: Component) {
    const index = this.children.indexOf(child);
    if (index === -1) return this;
    this.children.splice(index, 1);
    if (this.loaded) await child.unload();
    return this;
  }

  /**
   * Registers a callback to be executed during `unload()`.
   *
   * @param unloadFunc - Callback used to reverse work done during setup.
   * @returns The current instance for fluent chaining.
   */
  registerUnload(unloadFunc: () => void) {
    this.unloaders.push(unloadFunc);
    return this;
  }

  /**
   * Optional lifecycle hook executed during `load()`.
   *
   * Override in subclasses to perform setup work.
   */
  async onload() {}

  /**
   * Optional lifecycle hook executed during `unload()`.
   *
   * Override in subclasses to release resources.
   */
  async onunload() {}
}

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
export default class Plugin extends Component {
  /** Logger scoped to this plugin's display name. */
  console: BrowserConsole;
  /** App-shell capabilities used by plugins at runtime. */
  readonly app: PluginAppApi;
  /** Command palette capabilities and state helpers. */
  readonly palette: PluginPaletteApi;
  /** Read-only command registry access for plugins. */
  readonly commands: PluginCommandsApi;
  /** Workspace navigation and view activation helpers. */
  readonly workspace: PluginWorkspaceApi;
  /** File and data loading helpers backed by the host app. */
  readonly files: PluginFilesApi;

  /**
   * Creates a plugin instance bound to an app and manifest.
   *
   * @param app - Application instance that owns this plugin.
   * @param manifest - Plugin metadata used for identity and settings scope.
   */
  constructor(
    private readonly host: TouchGrassBibleApp,
    public manifest: PluginMetadata,
  ) {
    super();
    this.console = new BrowserConsole(true, `[${manifest.name}]`);
    const app = this.host;
    this.app = {
      get console() {
        return app.console;
      },
      get fab() {
        return app.fab;
      },
      get verseState() {
        return app.verseState;
      },
      get settings() {
        return app.settings;
      },
      set settings(settings: TGAppSettings) {
        app.settings = settings;
      },
      openCommandPalette: (state: Partial<CommandPaletteState> = {}) => app.openCommandPalette(state),
      saveSettings: () => app.saveSettings(),
      saveSettingsAfterDelay: (delay?: number) => app.saveSettingsAfterDelay(delay),
    };
    this.palette = {
      get instance() {
        return app.commandPalette;
      },
      menu: () => app.commandPalette.menu(),
      useState: <T>(initialValue: T) => app.commandPalette.useState(initialValue),
      prompt: (text: string) => app.commandPalette.prompt(text),
      confirm: (text: string) => app.commandPalette.confirm(text),
      setCategoryOrder: (order: string[]) => app.commandPalette.setCategoryOrder(order),
    };
    this.commands = {
      get: (commandId: string) => app.getCommand(commandId),
      list: () => app.getCommands(),
    };
    this.workspace = {
      get activePanel() {
        return app.workspace.activePanel;
      },
      get rootPanel() {
        return app.workspace.rootPanel;
      },
      open: (viewType, panel, options) => app.workspace.openView(viewType, panel, options),
      activate: (viewType: string) => app.workspace.activateView(viewType),
      getActiveViewOfType: (viewType: string) => app.workspace.getActiveViewOfType(viewType),
      openDialog: options => app.workspace.openDialog(options),
    };
    this.files = {
      loadJSON: <T>(url: string) => app.loadJSON<T>(url),
      readText: (path: string) => app.readTextFile(path),
      writeText: (path: string, content: string) => app.writeTextFile(path, content),
      readJson: <T>(path: string) => app.readJsonFile<T>(path),
      writeJson: (path: string, data: unknown) => app.writeJsonFile(path, data),
      upload: (
        accept: string,
        onFileContent: (content: unknown) => void,
        onError?: (error: unknown) => void,
        onWarn?: (message: string) => void,
      ) => app.uploadFile(accept, onFileContent, onError, onWarn),
      download: (filename: string, data: unknown) => app.downloadFile(filename, data),
    };
  }

  registerEvent<E extends Record<string, unknown>, K extends keyof E>(
    target: EventTargetLike<E>,
    eventName: K,
    handler: (e: E[K]) => void,
  ): this {
    target.on(eventName, handler);
    return this.registerUnload(() => {
      target.off(eventName, handler);
    });
  }

  registerStateChange<T>(target: StateTargetLike<T>, listener: (value: T, previous: T) => void): this {
    return this.registerUnload(target.onChange(listener));
  }

  /**
   * Registers a command palette loader for a category id.
   *
   * This helper also auto-registers an `open-palette-{id}` command that opens
   * the command palette with this category promoted to the top.
   *
   * @param load - Category loader callback for command palette content.
   * @param id - Target command palette category id.
   *
   * @example
   * ```ts
   * this.registerPalette(async palette => {
   *   palette.add({ id: "my-item", name: "My Item", callback: () => {} });
   * }, "my-plugin-category");
   * ```
   */
  registerPalette(load: CategoryLoaderFunc<unknown>, id: string) {
    this.palette.instance.addPalette(load, id);
    this.registerUnload(() => this.palette.instance.removePalette(load, id));

    // Get the palette name and description to create a well-named command
    const category = this.palette.instance.getCategory(id);
    const palette = category?.getPalette(this.palette.instance);

    // Auto-register a command that opens the command palette with this category on top
    this.registerCommand({
      id: `open-palette-${id}`,
      name: palette ? `Open: ${palette.name}` : `Open: ${id}`,
      description: palette?.description,
      callback: () => this.app.openCommandPalette({ topCategory: id }),
    });
  }

  /**
   * Registers a command with automatic unload cleanup.
   *
   * @param command - The command to register.
   * @returns The current instance for method chaining.
   */
  registerCommand(command: AppCommand): this {
    this.host.addCommand(command);
    this.registerUnload(() => this.host.removeCommand(command.id));
    return this;
  }

  /**
   * Registers a workspace view factory with automatic unload cleanup.
   *
   * @param id - View id used by the workspace layout system.
   * @param view - Factory that creates a view for a layout panel node.
   */
  registerView(id: string, view: (panel: LayoutNode) => View) {
    this.host.workspace.registerView(id, view);
    this.registerUnload(() => this.host.workspace.unregisterView(id));
    return this;
  }

  /**
   * Registers a verse action button with automatic unload cleanup.
   *
   * @param action - Verse action definition including icon and trigger handler.
   */
  addVerseAction({ id, name, description, icon, onTrigger }: IconActionItem) {
    this.host.addVerseAction({ id, name, description, icon, onTrigger });
    this.registerUnload(() => this.host.removeVerseAction(id));
    return this;
  }

  /**
   * Loads plugin settings by merging saved values over provided defaults.
   *
   * @typeParam T - Plugin settings shape.
   * @param defaultSettings - Fallback settings used when values are not saved.
   * @returns Merged settings object for immediate use.
   *
   * @example
   * ```ts
   * type Settings = { enabled: boolean; maxItems: number };
   *
   * const settings = await this.loadSettings<Settings>({
   *   enabled: true,
   *   maxItems: 10,
   * });
   * ```
   */
  async loadSettings<T>(defaultSettings: T): Promise<T> {
    return { ...defaultSettings, ...(await this.host.loadConfigObject<T>(this.manifest.id)) };
  }

  /**
   * Persists plugin settings under this plugin's manifest id.
   *
   * @typeParam T - Plugin settings shape.
   * @param settings - Settings object to persist.
   *
   * @example
   * ```ts
   * await this.saveSettings({ enabled: true, maxItems: 25 });
   * ```
   */
  async saveSettings<T>(settings: T) {
    await this.host.saveConfigObject<T>(this.manifest.id, settings);
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
export class InternalPlugins extends Component {
  /** Registered plugins keyed by manifest id. */
  plugins: Map<string, Plugin> = new Map();

  /**
   * Creates an internal plugin manager instance.
   *
   * @param app - Application instance used to construct plugin classes.
   */
  constructor(public app: TouchGrassBibleApp) {
    super();
  }

  /**
   * Adds a plugin by constructor and manifest, if its id is not already present.
   *
   * If a duplicate id is detected, a warning is logged and registration is
   * skipped.
   *
   * @param pluginClass - Constructor used to create a plugin instance.
   * @param manifest - Plugin metadata containing id and display information.
   * @returns This plugin manager instance for method chaining.
   */
  addPlugin(
    pluginClass: new (app: TouchGrassBibleApp, manifest: PluginMetadata) => Plugin,
    manifest: PluginMetadata,
  ) {
    if (this.plugins.has(manifest.id)) {
      this.app.console.warn(`Plugin with id ${manifest.id} already exists. Skipping.`);
      return this;
    }
    const pluginInstance = new pluginClass(this.app, manifest);
    this.plugins.set(manifest.id, pluginInstance);
    this.addChild(pluginInstance);
    return this;
  }

  /**
   * Adds multiple plugins in a single call.
   *
   * @param pluginClasses - Variadic plugin descriptors containing constructor
   * and manifest pairs.
   * @returns This plugin manager instance for method chaining.
   */
  addPlugins(
    ...pluginClasses: {
      pluginClass: new (app: TouchGrassBibleApp, manifest: PluginMetadata) => Plugin;
      manifest: PluginMetadata;
    }[]
  ) {
    pluginClasses.forEach(({ pluginClass, manifest }) => this.addPlugin(pluginClass, manifest));
    return this;
  }

  /**
   * Adds a pre-constructed plugin instance if its id is not already present.
   *
   * If a duplicate id is detected, a warning is logged and registration is
   * skipped.
   *
   * @param pluginInstance - Existing plugin instance to register.
   * @returns This plugin manager instance for method chaining.
   */
  addPluginInstance(pluginInstance: Plugin) {
    if (this.plugins.has(pluginInstance.manifest.id)) {
      this.app.console.warn(`Plugin with id ${pluginInstance.manifest.id} already exists. Skipping.`);
      return this;
    }
    this.plugins.set(pluginInstance.manifest.id, pluginInstance);
    this.addChild(pluginInstance);
    return this;
  }

  /**
   * Adds multiple pre-constructed plugin instances.
   *
   * @param pluginInstances - Plugin instances to register.
   * @returns This plugin manager instance for method chaining.
   */
  addPluginInstances(...pluginInstances: Plugin[]) {
    pluginInstances.forEach(plugin => this.addPluginInstance(plugin));
    return this;
  }
}
