import { IconNode } from "lucide";
import TouchGrassBibleApp, { BrowserConsole, CommandCategory, VerseInfoComponent } from "./main";

abstract class Component {
  private loaded = false;
  private children: Component[] = [];
  unloaders: (() => void)[] = [];
  async load() {
    if (this instanceof Plugin) this.console.log("Loading plugin...");
    if (this.loaded) return; // Prevent double load
    await this.onload();
    this.loaded = true;
    await Promise.all(this.children.map(child => child.load()));
    if (this instanceof Plugin) this.console.log("Plugin loaded.");
  }
  async unload() {
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

export type IconActionItem = {
  id: string;
  name: string;
  description?: string;
  icon: IconNode;
  onTrigger: (verseInfo: VerseInfoComponent) => void;
};

export default class Plugin extends Component {
  console: BrowserConsole;
  constructor(
    public app: TouchGrassBibleApp,
    public manifest: { id: string; name: string; description: string; version: string },
  ) {
    super();
    this.console = new BrowserConsole(true, `[${manifest.name}]`);
  }

  registerPalette(load: () => CommandCategory<unknown>, id: string) {
    this.app.commandPalette.addPalette(load, id);
    this.registerUnload(() => this.app.commandPalette.removePalette(load, id));
  }
  addSidebar() {}

  addVerseAction({ id, name, description, icon, onTrigger }: IconActionItem) {
    this.app.MainScreen.addAction({ id, name, description, icon, onTrigger });
    this.registerUnload(() => this.app.MainScreen.removeAction(id));
  }
}
