import { App } from "./App";
import {
  CategoryLoaderFunc,
  CommandCategory,
  CommandItem,
  CommandPaletteDialog,
  CommandPaletteViewState,
} from "./CommandPalette";
import { CommandPaletteState } from "./CommandPaletteV2.0";
import { Command } from "./Commands";
import { ETarget } from "./Event";
import { BrowserConsole } from "./MyBrowserConsole";
import { toggle } from "./UIComponents";
import { stateMapping, View } from "./Workspace";

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
    //if (this instanceof Plugin) this.console.log("Loading plugin...");
    if (this.loaded) return this; // Prevent double load
    await this.onload();
    this.loaded = true;
    await Promise.all(this.children.map(child => child.load()));
    //if (this instanceof Plugin) this.console.log("Plugin loaded.");
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

  hasChild(child: Component): boolean {
    return this.children.includes(child);
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
export class ePlugin<AppType extends App = App> extends Component {
  /** Logger scoped to this plugin's display name. */
  console: BrowserConsole;

  /**
   * Creates a plugin instance bound to an app and manifest.
   *
   * @param app - Application instance that owns this plugin.
   * @param manifest - Plugin metadata used for identity and settings scope.
   */
  constructor(
    readonly app: AppType,
    public manifest: PluginMetadata,
  ) {
    super();
    this.console = new BrowserConsole(true, `[${manifest.name}]`);
  }

  registerEvent<E extends Record<string, unknown>, K extends keyof E>(
    target: ETarget<E>,
    eventName: K,
    handler: (e: E[K]) => void,
  ): this {
    target.on(eventName, handler);
    return this.registerUnload(() => target.off(eventName, handler));
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
    this.app.commandPalette.addPalette(load, id);
    this.registerUnload(() => this.app.commandPalette.removePalette(load, id));

    /*     // Get the palette name and description to create a well-named command
    const category = this.app.commandPalette.getCategory(id);
    const palette = category?.getPalette(this.app.commandPalette);

    // Auto-register a command that opens the command palette with this category on top
    this.registerCommand({
      id: `open-palette-${id}`,
      name: palette ? `Open: ${palette.name}` : `Open: ${id}`,
      icon: Terminal,
      description: palette?.description || `Open the ${id} category in the command palette`,
      callback: () => this.app.commandPalette.display({ topCategory: id }),
    }); */
  }

  registerPaletteV2<T>(
    id: string,
    cfn: (args: {
      id: string;
      state: stateMapping<CommandPaletteState>;
    }) => import("./CommandPaletteV2.0").CommandCategory<T>,
    hidden = false,
  ) {
    this.app.commandPaletteV2.registerPalette<T>(id, cfn, hidden);
    this.registerUnload(() => this.app.commandPaletteV2.unregisterPalette(id));
  }

  registerHiddenPalette(load: CategoryLoaderFunc<unknown>, id: string) {
    this.app.commandPalette.addHiddenPalette(load, id);
    this.registerUnload(() => this.app.commandPalette.removeHiddenPalette(load, id));
  }

  /**
   * Registers a command with automatic unload cleanup.
   *
   * @param command - The command to register.
   * @returns The current instance for method chaining.
   */
  registerCommand(command: Command): this {
    this.app.commandPalette.commands.addCommand(command);
    this.registerUnload(() => this.app.commandPalette.commands.removeCommand(command.id));
    return this;
  }

  /**
   * Registers a workspace view factory with automatic unload cleanup.
   *
   * @param id - View id used by the workspace layout system.
   * @param view - Factory that creates a workspace view instance.
   */
  registerView(id: string, view: () => View) {
    this.app.workspace.layoutController.registerView(id, view);
    this.registerUnload(() => this.app.workspace.layoutController.unregisterView(id));
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
    return { ...defaultSettings, ...(await this.app.files.loadConfigObject<T>(this.manifest.id)) };
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
    await this.app.files.saveConfigObject<T>(this.manifest.id, settings);
  }
}

export class Plugin<AppType extends App = App> extends ePlugin<AppType> {}

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
export class eInternalPlugins<AppType extends App = App> extends Component {
  /** Registered plugins keyed by manifest id. */
  plugins: Map<string, ePlugin<AppType>> = new Map();
  private disabledPlugins: Set<string> = new Set();

  /**
   * Creates an internal plugin manager instance.
   *
   * @param app - Application instance used to construct plugin classes.
   */
  constructor(public app: AppType) {
    super();
  }

  async onload(): Promise<void> {
    const config = await this.app.files.loadConfigObject<{ disabledPlugins: string[] }>("disabled-plugins");
    if (config?.disabledPlugins) {
      this.disabledPlugins = new Set(config.disabledPlugins);
    }
    for (const pluginId of this.disabledPlugins) {
      const plugin = this.plugins.get(pluginId);
      if (plugin) await this.removeChild(plugin);
    }
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
    pluginClass: new (app: AppType, manifest: PluginMetadata) => ePlugin<AppType>,
    manifest: PluginMetadata,
  ) {
    if (this.plugins.has(manifest.id)) {
      this.app.console.warn(`Plugin with id ${manifest.id} already exists. Skipping.`);
      return this;
    }
    const pluginInstance = new pluginClass(this.app, manifest);
    this.plugins.set(manifest.id, pluginInstance);
    if (!this.disabledPlugins.has(manifest.id)) this.addChild(pluginInstance);
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
      pluginClass: new (app: AppType, manifest: PluginMetadata) => ePlugin<AppType>;
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
  addPluginInstance(pluginInstance: ePlugin<AppType>) {
    if (this.plugins.has(pluginInstance.manifest.id)) {
      this.app.console.warn(`Plugin with id ${pluginInstance.manifest.id} already exists. Skipping.`);
      return this;
    }
    this.plugins.set(pluginInstance.manifest.id, pluginInstance);
    if (!this.disabledPlugins.has(pluginInstance.manifest.id)) this.addChild(pluginInstance);
    return this;
  }

  /**
   * Adds multiple pre-constructed plugin instances.
   *
   * @param pluginInstances - Plugin instances to register.
   * @returns This plugin manager instance for method chaining.
   */
  addPluginInstances(...pluginInstances: ePlugin<AppType>[]) {
    pluginInstances.forEach(plugin => this.addPluginInstance(plugin));
    return this;
  }

  enable(pluginId: string) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || this.hasChild(plugin)) {
      this.app.console.warn(`Plugin with id ${pluginId} not found or already enabled.`);
      return this;
    }

    this.addChild(plugin);
    this.saveDisabledPlugins();
    return this;
  }

  disable(pluginId: string) {
    const plugin = this.plugins.get(pluginId);
    this.app.console.log(`Attempting to disable plugin with id ${pluginId}...`);
    if (!plugin || !this.hasChild(plugin) || pluginId === "settings") {
      this.app.console.warn(`Plugin with id ${pluginId} not found or already disabled.`);
      return this;
    }

    this.removeChild(plugin);
    this.saveDisabledPlugins();
    return this;
  }

  toggle(pluginId: string, value: boolean = !this.isEnabled(pluginId)) {
    if (value) {
      this.enable(pluginId);
    } else {
      this.disable(pluginId);
    }
    return this;
  }

  isEnabled(pluginId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    return !!plugin && this.hasChild(plugin);
  }

  saveDisabledPlugins() {
    const disabledPluginIds = Array.from(this.plugins.keys()).filter(id => !this.isEnabled(id));
    this.app.files.saveConfigObject("disabled-plugins", { disabledPlugins: disabledPluginIds });
  }
}

export class InternalPlugins<AppType extends App = App> extends eInternalPlugins<AppType> {}

export class pluginOptions<AppType extends App = App> extends CommandCategory<ePlugin<AppType>> {
  readonly name = "Plugin Options";
  readonly description = "Enable, disable, and configure plugins";
  enabled: Map<string, boolean> = new Map();
  constructor(
    public dialog: CommandPaletteDialog,
    public pluginManager: eInternalPlugins<AppType>,
  ) {
    super(dialog);
  }
  onTrigger(state: CommandPaletteViewState): void {
    void state;
    this.pluginManager.plugins.forEach((plugin, id) => {
      void plugin;
      this.enabled.set(id, this.pluginManager.isEnabled(id));
    });
  }
  getCommands(query: string): ePlugin<AppType>[] {
    const plugins = Array.from(this.pluginManager.plugins.values());
    return this.getcompatibleWithLevenshtein(
      query,
      plugins,
      plugin => plugin.manifest.name,
      plugin => plugin.manifest.description,
    );
  }
  renderCommand(
    command: ePlugin<AppType>,
    el: CommandItem<ePlugin<AppType>>,
  ): Partial<CommandPaletteViewState> | (() => Partial<CommandPaletteViewState>) {
    const isEnabled =
      this.enabled.get(command.manifest.id) ?? this.pluginManager.isEnabled(command.manifest.id);
    el.setTitle(`${isEnabled ? "Disable" : "Enable"}: ${command.manifest.name}`)
      .setDescription(command.manifest.description)
      .addComponent(
        toggle({
          checked: isEnabled,
          onclick: (e: Event, state) => {
            e.stopPropagation();
            this.enabled.set(command.manifest.id, state.val);
            this.pluginManager.toggle(command.manifest.id, state.val);
          },
        }),
      );
    return {};
  }
  executeCommand(command: ePlugin<AppType>): void {
    void command;
  }
}
