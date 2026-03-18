# Platform And Shell Files

This page covers the files that adapt the app to different runtimes, plus the Electron and web shells that load the compiled app.

## `src/platform/browserFileIO.ts`

- Purpose: browser-only file picker and file download helpers
- Key APIs: `pickBrowserFileText(accept)`, `saveBrowserFile(filename, content, mimeType?)`
- Opens a temporary file input to read text content from user-selected files.
- Saves text content by generating a `Blob` and clicking a temporary download link.

## `src/platform/capacitor.test.ts`

- Purpose: tests for the Capacitor bridge
- Key APIs: Vitest suite for `createPlatformBridge()`
- Mocks Capacitor filesystem APIs and browser file helpers.
- Verifies storage, file access, JSON loading, and file-pick delegation behavior.

## `src/platform/capacitor.ts`

- Purpose: Capacitor-native platform bridge
- Key APIs: `createPlatformBridge()`
- Normalizes relative paths and uses Capacitor `Filesystem` for reads and writes.
- Stores key/value data under `.tg-storage/<key>.txt` in app data storage.
- Separates internal data files from exported documents.

## `src/platform/current.ts`

- Purpose: active platform selector
- Key APIs: `createPlatformBridge()`, re-exported platform types
- Chooses between web, Electron, and Capacitor implementations using `__TG_PLATFORM_TARGET__`.
- Defaults to `web` when no explicit target is defined.

## `src/platform/electron.test.ts`

- Purpose: tests for the renderer-side Electron bridge
- Key APIs: Vitest suite for `createPlatformBridge()`
- Mocks `window.touchGrassElectronPlatform` and browser file helpers.
- Verifies preload-bridge delegation and missing-bridge failure handling.

## `src/platform/electron.ts`

- Purpose: renderer-side Electron adapter
- Key APIs: `createPlatformBridge()`
- Validates the preload bridge and wraps storage/file methods from `window.touchGrassElectronPlatform`.
- Adds JSON read/write helpers on top of text-based bridge methods.
- Still uses browser DOM helpers for import/export prompts.

## `src/platform/types.ts`

- Purpose: shared platform bridge contracts
- Key APIs: `PlatformTarget`, `PlatformStorageAdapter`, `PlatformFileAdapter`, `PlatformBridge`
- Defines the common async interfaces all platform implementations must satisfy.

## `src/platform/web.test.ts`

- Purpose: tests for the browser/web bridge
- Key APIs: Vitest suite for `createPlatformBridge()`
- Uses mocked `localStorage` and fetch behavior.
- Verifies storage, virtual file paths, JSON round-tripping, and import/export delegation.

## `src/platform/web.ts`

- Purpose: pure-browser platform bridge
- Key APIs: `createPlatformBridge()`
- Uses `localStorage` for key/value storage.
- Implements a virtual file layer by prefixing normalized paths with `tg-file:`.
- Loads bundled assets with `fetch(...)` and reuses browser file I/O helpers.

## `src/electron/electron.js`

- Purpose: Electron main-process entrypoint
- Key APIs: app bootstrap, `createMainWindow()`, `registerPlatformHandlers()`
- Creates the main window with isolated context and a preload script.
- Registers IPC handlers for storage, file access, assets, and window controls.
- Stores app data under Electron's `userData` path and sanitizes relative paths.

## `src/electron/forge.config.js`

- Purpose: Electron Forge packaging configuration
- Key APIs: exported Forge config object
- Enables `asar` packaging and defines makers for Windows, macOS, DEB, and RPM.
- Configures icons, native module unpacking, and Electron fuse hardening options.

## `src/electron/index.html`

- Purpose: Electron HTML shell
- Key elements: loading overlay, progress text, `<script src="main.js">`
- Loads `main.css` and the compiled `main.js` bundle.
- Shows a fake loading progression before the app fully initializes.

## `src/electron/package-lock.json`

- Purpose: generated NPM lockfile for the Electron packaging project
- Key content: pinned dependency graph for Forge, Electron, and packaging tooling
- Documents the exact dependency versions used for the Electron subproject.
- This is generated state rather than handwritten app logic.

## `src/electron/package.json`

- Purpose: Electron packaging manifest
- Key fields: `main`, `scripts`, metadata, dependencies
- Declares Electron Forge scripts for start, package, and make.
- Pins runtime and build dependencies for the desktop bundle.

## `src/electron/preload.js`

- Purpose: secure preload bridge for Electron renderer code
- Key APIs: `window.touchGrassElectronPlatform`
- Exposes async storage, file, asset, and window-control methods through `contextBridge`.
- Forwards each method to `ipcRenderer.invoke(...)` on named channels.

## `src/web/favicon.ico`

- Purpose: static browser icon asset
- Key role: favicon and general app icon fallback
- Binary asset; not summarized as code.

## `src/web/icon-192.png`

- Purpose: static 192x192 web/PWA icon
- Key role: install/home-screen icon asset
- Binary asset; not summarized as code.

## `src/web/icon-512.png`

- Purpose: static 512x512 web/PWA icon
- Key role: larger install and branding icon asset
- Binary asset; not summarized as code.

## `src/web/index.html`

- Purpose: browser/PWA HTML shell
- Key elements: loading overlay, manifest links, icon links, service worker registration script
- Loads `main.css` and `main.js` and registers `service-worker.js` when supported.
- Reuses the same loading-screen pattern as the Electron shell.

## `src/web/manifest.json`

- Purpose: PWA manifest
- Key fields: app name, scope, display mode, theme colors, icons
- Declares install metadata and standalone display behavior.
- Points at 192px and 512px icons for installed app surfaces.

## `src/web/service-worker.js`

- Purpose: offline cache service worker
- Key APIs: `install`, `fetch`, and `activate` handlers
- Pre-caches core HTML, CSS, JS, JSON data, and icon assets.
- Serves cached content first and cleans up stale caches on activation.
