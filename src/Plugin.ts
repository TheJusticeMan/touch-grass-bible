import { IconNode } from "lucide";
import { LayoutNode, View } from "./external/Workspace";
import TouchGrassBibleApp, { BrowserConsole, CategoryLoaderFunc, VerseInfoComponent } from "./main";

abstract class Component {
  private loaded = false;
  private children: Component[] = [];
  unloaders: (() => void)[] = [];
  async load() {
    if (this instanceof Plugin) this.console.log("Loading plugin...");
    if (this.loaded) return this; // Prevent double load
    await this.onload();
    this.loaded = true;
    await Promise.all(this.children.map(child => child.load()));
    if (this instanceof Plugin) this.console.log("Plugin loaded.");
    return this;
  }
  async unload() {
    if (!this.loaded) return this; // Prevent double unload
    await this.onunload();
    this.unloaders.forEach(unload => unload());
    await Promise.all(this.children.map(child => child.unload()));
    this.loaded = false;
    return this;
  }

  async addChild(child: Component) {
    this.children.push(child);
    if (this.loaded) await child.load();
    return this;
  }

  async removeChild(child: Component) {
    const index = this.children.indexOf(child);
    if (index === -1) return this;
    this.children.splice(index, 1);
    if (this.loaded) await child.unload();
    return this;
  }

  registerUnload(unloadFunc: () => void) {
    this.unloaders.push(unloadFunc);
    return this;
  }

  async onload() {}
  async onunload() {}
}

export type IconActionItem = {
  id: string;
  name: string;
  description?: string;
  icon: IconNode;
  onTrigger: (verseInfo: VerseInfoComponent) => void;
};

type PluginMetadata = {
  id: string;
  name: string;
  description: string;
  version: string;
};

export default class Plugin extends Component {
  console: BrowserConsole;
  constructor(
    public app: TouchGrassBibleApp,
    public manifest: PluginMetadata,
  ) {
    super();
    this.console = new BrowserConsole(true, `[${manifest.name}]`);
  }

  registerPalette(load: CategoryLoaderFunc<unknown>, id: string) {
    this.app.commandPalette.addPalette(load, id);
    this.registerUnload(() => this.app.commandPalette.removePalette(load, id));
  }

  registerView(id: string, view: (panel: LayoutNode) => View) {
    this.app.workspace.registerView(id, view);
    this.registerUnload(() => this.app.workspace.unregisterView(id));
  }

  addVerseAction({ id, name, description, icon, onTrigger }: IconActionItem) {
    this.app.addVerseAction({ id, name, description, icon, onTrigger });
    this.registerUnload(() => this.app.removeVerseAction(id));
  }

  async loadSettings<T>(defaultSettings: T): Promise<T> {
    return { ...defaultSettings, ...(await this.app.loadConfigObject<T>(this.manifest.id)) };
  }

  async saveSettings<T>(settings: T) {
    await this.app.saveConfigObject<T>(this.manifest.id, settings);
  }
}

export class internalPlugins extends Component {
  plugins: Map<string, Plugin> = new Map();

  constructor(public app: TouchGrassBibleApp) {
    super();
  }

  /**
   * Adds a plugin to the application if it doesn't already exist.
   * @param pluginClass - Constructor function for the plugin class
   * @param manifest - Plugin metadata containing id and configuration
   * @returns This plugin manager instance for method chaining
   * @throws No exception thrown, but logs a warning if plugin with same id already exists
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

  addPlugins(
    ...pluginClasses: {
      pluginClass: new (app: TouchGrassBibleApp, manifest: PluginMetadata) => Plugin;
      manifest: PluginMetadata;
    }[]
  ) {
    pluginClasses.forEach(({ pluginClass, manifest }) => this.addPlugin(pluginClass, manifest));
    return this;
  }

  addPluginInstance(pluginInstance: Plugin) {
    if (this.plugins.has(pluginInstance.manifest.id)) {
      this.app.console.warn(`Plugin with id ${pluginInstance.manifest.id} already exists. Skipping.`);
      return this;
    }
    this.plugins.set(pluginInstance.manifest.id, pluginInstance);
    this.addChild(pluginInstance);
    return this;
  }

  addPluginInstances(...pluginInstances: Plugin[]) {
    pluginInstances.forEach(plugin => this.addPluginInstance(plugin));
    return this;
  }
}
