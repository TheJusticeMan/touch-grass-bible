# External Plugins

External plugins are single-file JavaScript modules that extend Touch Grass Bible. They are intended for **trusted code only**: a plugin receives the application host object and has the same access as built-in plugins. Do not install code from an untrusted source.

## Plugin module contract

Export a manifest and a default class extending the host `Plugin` base class:

```js
import { Plugin } from "@touch-grass-bible";

export const manifest = {
  id: "example-plugin",
  name: "Example Plugin",
  description: "A minimal external plugin.",
  version: "1.0.0",
};

export default class ExamplePlugin extends Plugin {
  async onload() {
    this.app.console.log(`${this.manifest.name} loaded`);
  }

  async onunload() {
    this.app.console.log(`${this.manifest.name} unloaded`);
  }
}
```

The manifest must have string `id`, `name`, `description`, and `version` properties. The host API currently exposes `Plugin`, `Component`, `VerseRef`, `BrowserConsole`, `View`, `DEFAULT_SETTINGS`, and `DEFAULT_CATEGORY_ORDER` as named exports from `@touch-grass-bible`.

`loadAll()` waits for each plugin's `onload()` and returns a report with loaded filenames and per-file failures. `onunload()` and `registerUnload()` callbacks run when a plugin is uninstalled or its host is unloaded. Make setup and cleanup safe to call over repeated load/unload cycles.

The host resolves its own `@touch-grass-bible` module and the legacy `src/core/Plugin` import. Put each static import/export declaration on its own line; host module specifiers are rewritten without changing text inside comments or string literals. Ship other code in the same `.js` file; third-party bare package imports are not bundled by the app.

## Install and remove

1. Build Touch Grass Bible with external plugins enabled (`ENABLE_EXTERNAL_PLUGINS=true`). They are disabled in builds that do not set this build-time flag.
2. In the app's Settings category, choose **Install plugin** and select the `.js` file.
3. Choose **Manage plugins** to view installed filenames and **Uninstall** to stop and remove a plugin.

Plugins are persisted under the app's `plugins/` data directory and listed in `plugins/index.json`. The installer accepts `.js` filenames containing letters, digits, dots, underscores, or hyphens; paths and directory traversal are rejected. Plugin startup errors are returned by `loadAll()` as a report of loaded filenames and per-file failures, and do not prevent other plugins from loading. Failed plugin startup is logged and does not leave a registered, active instance.

To enable the feature in a production bundle:

```bash
ENABLE_EXTERNAL_PLUGINS=true npm run build:bundle:capacitor
```

Use the equivalent Electron target when building Electron:

```bash
ENABLE_EXTERNAL_PLUGINS=true npm run build:bundle:electron
```

The flag only includes the feature; the app still needs a compatible runtime that supports module Blob URLs and the required content-security policy.
