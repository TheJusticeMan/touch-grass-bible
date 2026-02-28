import TouchGrassBibleApp, { CommandCategory } from "./main";

abstract class Component {
  private loaded = false;
  private children: Component[] = [];
  unloaders: (() => void)[] = [];
  protected async load() {
    if (this.loaded) return; // Prevent double load
    await this.onload();
    this.loaded = true;
  }
  protected async unload() {
    if (!this.loaded) return; // Prevent double unload
    await this.onunload();
    this.unloaders.forEach(unload => unload());
    await Promise.all(this.children.map(child => child.unload()));
    this.loaded = false;
  }

  async addChild(child: Component) {
    this.children.push(child);
    if (this.loaded) await child.load();
  }

  async removeChild(child: Component) {
    const index = this.children.indexOf(child);
    if (index === -1) return;
    this.children.splice(index, 1);
    if (this.loaded) await child.unload();
  }

  registerUnload(unloadFunc: () => void) {
    this.unloaders.push(unloadFunc);
  }

  async onload() {}
  async onunload() {}
}

export default class Plugin extends Component {
  constructor(
    public app: TouchGrassBibleApp,
    public manifest: { id: string; name: string; description: string; version: string },
  ) {
    super();
  }

  registerPalette(load: () => CommandCategory<unknown>, id: string) {
    this.app.commandPalette.addPalette(load, id);
    this.registerUnload(() => this.app.commandPalette.removePalette(load, id));
  }
  addSidebar() {}
}
