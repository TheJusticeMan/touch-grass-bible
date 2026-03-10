# Plugin System

The plugin system provides a structured, lifecycle-managed way to extend Touch Grass Bible's functionality. Plugins are self-contained modules that register command palette categories, verse action buttons, and workspace views — and clean up after themselves when unloaded.

---

## Overview

Every plugin extends the `Plugin` base class from `src/Plugin.ts`:

```typescript
abstract class Component {
  async load(): Promise<void>
  async unload(): Promise<void>
  registerUnload(fn: () => void): void
  async addChild(child: Component): Promise<void>
  async removeChild(child: Component): Promise<void>
  async onload(): Promise<void>   // Override in subclass
  async onunload(): Promise<void> // Override in subclass
}

export default class Plugin extends Component {
  console: BrowserConsole;
  constructor(app: TouchGrassBibleApp, manifest: PluginManifest) {...}

  registerPalette(load: () => CommandCategory, id: string): void
  registerView(id: string, view: (panel: Panel) => View): void
  addVerseAction(action: IconActionItem): void
}
```

`Component` is the lifecycle base, and `Plugin` adds app-specific registration helpers on top.

---

## Plugin Manifest

Every plugin declares itself with a manifest object:

```typescript
type PluginManifest = {
  id: string;        // Unique identifier, used as palette ID and for lookup
  name: string;      // Human-readable display name
  description: string;
  version: string;   // Semantic version string
};
```

---

## Lifecycle

```
new PluginClass(app, manifest)
         │
         ▼
    .load()
         │
         ├── calls onload() (subclass implementation)
         │       │
         │       └── registers palettes, views, verse actions
         │
         └── calls load() on any children
```

When the app shuts down:
```
    .unload()
         │
         ├── calls onunload() (subclass override, optional)
         │
         ├── runs all registered unloaders (cleanup callbacks)
         │       (removes palettes, removes verse actions, unregisters views)
         │
         └── calls unload() on all children
```

**Double-load/unload protection:** The `loaded` flag ensures `load()` and `unload()` are each called at most once.

---

## Registration Helpers

### `registerPalette(factory, id)`

Registers a command category in the unified command palette and automatically removes it on plugin unload.

```typescript
// Plugin registers a command category:
this.registerPalette(
  () => new BibleSearchCategory(this.app.commandPalette, this),
  BibleSearchCategoryID
);

// Equivalent manual registration + cleanup:
this.app.commandPalette.addPalette(factory, id);
this.registerUnload(() => this.app.commandPalette.removePalette(factory, id));
```

### `registerView(id, factory)`

Registers a workspace view factory and removes it on unload.

```typescript
this.registerView("my-view", panel => new MyView(panel, this.app));
// Unload: this.app.workspace.unregisterView("my-view")
```

### `addVerseAction(action)`

Adds a button to the per-verse action bar in the VerseScreen, and removes it on unload.

```typescript
this.addVerseAction({
  id: "bookmark-action",
  name: "Bookmark",
  icon: BookmarkIcon,
  onTrigger: (verseInfo) => { /* handle click on verse */ }
});
// Unload: this.app.removeVerseAction("bookmark-action")
```

---

## `IconActionItem` Type

```typescript
type IconActionItem = {
  id: string;
  name: string;
  description?: string;
  icon: IconNode;              // Lucide icon
  onTrigger: (verseInfo: VerseInfoComponent) => void;
};
```

---

## Plugin Loading Order (from `main.ts`)

Plugins are loaded sequentially in `TouchGrassBibleApp.onload()`:

1. `BookmarkPlugin` — Bookmarks, verse lists, verse action buttons
2. `TSK` — Cross-references (loads `crossrefs.json`)
3. `BibleSearchPlugin` — Full-text search and go-to-verse navigation
4. `TopicalBiblePlugin` — Topic browsing (loads `topics.json`)
5. `NotesPlugin` — Per-verse personal notes
6. `TranslationsPlugin` — Translation switching
7. `SettingsPlugin` — In-app settings UI

---

## Creating a New Plugin

```typescript
// src/plugins/MyPlugin.ts
import Plugin from "../Plugin";
import { CommandCategory, CommandItem, CommandPaletteState } from "../main";

class MyCategory extends CommandCategory<string> {
  readonly name = "My Feature";
  readonly description = "Does something useful";

  getCommands(query: string): string[] {
    return ["Item A", "Item B"].filter(s => s.toLowerCase().includes(query.toLowerCase()));
  }

  renderCommand(cmd: string, item: CommandItem<string>) {
    item.setTitle(cmd);
    return (state: CommandPaletteState) => state; // No state change
  }

  executeCommand(cmd: string): void {
    console.log("Selected:", cmd);
    this.commandPalette.close();
  }
}

export default class MyPlugin extends Plugin {
  async onload() {
    this.registerPalette(() => new MyCategory(this.app.commandPalette), "my-feature");
  }
}
```

Then in `main.ts` `onload()`:
```typescript
new MyPlugin(this, {
  id: "my-feature",
  name: "My Feature",
  description: "A custom plugin",
  version: "1.0.0"
}).load();
```

---

## Registered Plugins at a Glance

| ID | Class | Palettes | Verse Actions |
|----|-------|----------|---------------|
| `bookmarks` | `BookmarkPlugin` | `bookmarks`, `verse-list` | Bookmark icon, Verse list icon |
| `tsk` | `TSK` | `tsk-cross-ref` | Cross-reference icon |
| `bible-search` | `BibleSearchPlugin` | `bible-search`, `go-to-verse` | — |
| `topical-bible` | `TopicalBiblePlugin` | `topics` | Topics icon |
| `notes` | `NotesPlugin` | `my-notes` | Notes icon |
| `translations` | `TranslationsPlugin` | `translations` | — |
| `settings` | `SettingsPlugin` | `settings` | — |
