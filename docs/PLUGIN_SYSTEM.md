# Plugin System (Plugin.ts)

## Overview

The plugin system provides modular extension points for adding features. Built on a hierarchical component system with load/unload lifecycle management.

## Component Hierarchy

```
Component
  └── Plugin (extends Component)
        └── TouchGrassBibleApp.plugins
```

### Component Base Class

```typescript
class Component {
  loaded: boolean;
  children: Component[];
  unloaders: (() => void)[];

  async load(): this;
  async unload(): this;
  async addChild(child: Component): this;
  async removeChild(child: Component): this;
  registerUnload(func: () => void): this;
}
```

### Plugin Class

Extends Component with app integration:

```typescript
class Plugin extends Component {
  app: TouchGrassBibleApp;
  manifest: PluginMetadata;
  console: BrowserConsole;

  // Registration APIs
  registerPalette(load: CategoryLoaderFunc, id: string): void;
  registerView(id: string, factory: ViewFactory): void;
  addVerseAction(action: IconActionItem): void;

  // Settings
  async loadSettings<T>(defaultSettings: T): Promise<T>;
  async saveSettings<T>(settings: T): Promise<void>;
}
```

## Built-in Plugins

| Plugin        | ID              | Description                     |
| ------------- | --------------- | ------------------------------- |
| Bookmarks     | `bookmarks`     | Verse bookmarking               |
| Notes         | `notes`         | Personal notes on verses        |
| Journal       | `journal`       | Reading journal                 |
| Search        | `bible-search`  | Bible text search               |
| Topical Bible | `topical-bible` | Topics from OpenBible.info      |
| Translations  | `translations`  | Switch Bible versions           |
| TSK+          | `tsk`           | Treasury of Scripture Knowledge |
| Settings      | `settings`      | App configuration               |
| AI            | `ai`            | AI study assistant              |
| Share         | `share`         | Share verses externally         |

## Plugin Metadata

```typescript
type PluginMetadata = {
  id: string;
  name: string;
  description: string;
  version: string;
};
```

## Verse Actions

Plugins can add actions that appear under each verse:

```typescript
type IconActionItem = {
  id: string;
  name: string;
  description?: string;
  icon: IconNode;
  onTrigger: (verseInfo: VerseInfoComponent) => void;
};
```

## internalPlugins Manager

Manages plugin lifecycle:

```typescript
class internalPlugins extends Component {
  plugins: Map<string, Plugin>;

  addPlugin(pluginClass, manifest): this;
  addPlugins(...plugins): this;
  addPluginInstance(pluginInstance): this;
}
```

## Creating a Custom Plugin

```typescript
import Plugin from "../Plugin";

export default class MyPlugin extends Plugin {
  async onload() {
    // Register palette
    this.registerPalette(() => new MyCategory(), "my-category");

    // Register view
    this.registerView("my-view", panel => new MyView(panel));

    // Add verse action
    this.addVerseAction({
      id: "my-action",
      name: "Do Something",
      icon: MyIcon,
      onTrigger: verseInfo => {
        /* ... */
      },
    });
  }

  async onunload() {
    // Cleanup
  }
}
```

## Potential Improvements

1. **Plugin API**: Expose more app methods to plugins
2. **Plugin Settings UI**: Built-in settings panel for plugins
3. **Plugin Dependencies**: Declare and resolve dependencies
4. **Hot Reloading**: Reload plugins without app restart
5. **Plugin Marketplace**: Install from external sources
6. **Plugin Development Tools**: Debug and test plugins
