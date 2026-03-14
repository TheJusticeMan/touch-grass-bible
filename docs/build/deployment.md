# Deployment Targets

Touch Grass Bible supports three deployment targets: Web (PWA), Electron (desktop), and Capacitor (iOS/Android).

---

## Web (Progressive Web App)

### Building

```bash
npm run build:web
```

This runs:

1. `npm run getdatafiles` — Download and process Bible data
2. `node esbuild.config.mjs production` — Production bundle
3. `cp src/web/* dist` — Copy web assets to dist

### Output

```
dist/
├── main.js           # App bundle (~300-500 KB minified)
├── main.css          # Compiled styles
├── index.html        # Entry point
├── manifest.json     # PWA manifest
├── service-worker.js # Offline support
├── favicon.ico       # Browser favicon
├── icon-192.png      # PWA icon (192x192)
├── icon-512.png      # PWA icon (512x512)
├── translations.json # Bible text (~12 MB)
├── crossrefs.json    # Cross-references
└── topics.json       # Topics
```

### Service Worker (Offline Support)

**File:** `src/web/service-worker.js`

The service worker implements a cache-first strategy:

1. **Install** — Caches all listed assets
2. **Fetch** — Returns cached version if available, falls back to network
3. **Activate** — Deletes all old caches with different `VERSION`

The version string on line 1 (`const VERSION = "3.1.1"`) is automatically updated by the build system on each build to bust the cache.

```javascript
const CACHE_NAME = `bible-app-cache-V${VERSION}`;
const ASSETS = [
  "./index.html", "./manifest.json", "./crossrefs.json",
  "./topics.json", "./translations.json", "./main.js", ...
];
```

**Note:** The large data files (translations, crossrefs, topics) are cached on first load. This means:

- First load requires ~27 MB of downloads
- All subsequent loads work offline instantly

### PWA Manifest

**File:** `src/web/manifest.json`

Defines how the app appears when installed as a PWA:

- `display: "standalone"` — No browser chrome
- App icons at 192px and 512px
- Proper theme colors

### Deployment

The `dist/` directory is a static site. Deploy to any static hosting:

```bash
# GitHub Pages (automatic via GitHub Actions)
# Or manually: copy dist/ to your web server

# Examples:
rsync -av dist/ user@server:/var/www/html/
# Or: upload to S3, Netlify, Vercel, etc.
```

The live version is hosted at: [https://thejusticeman.github.io/touch-grass-bible/](https://thejusticeman.github.io/touch-grass-bible/)

---

## Electron (Desktop)

### Building

```bash
npm run build:electron
```

This runs:

1. Full production build
2. Copies `src/electron/*` to `dist/`
3. Runs `npm install` in `dist/` (installs Electron)
4. Runs `npm run start` to launch the desktop app

### Electron Main Process

**File:** `src/electron/electron.js`

```javascript
const { app, BrowserWindow } = require("electron/main");

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    titleBarStyle: "hidden", // Clean frameless look
  });
  win.loadFile("index.html"); // Load the same dist/index.html
});
```

The Electron app loads the same `index.html` as the web app — no code changes needed. The same `main.js` bundle runs in Electron's Chromium environment.

### Electron Build Config

**File:** `src/electron/forge.config.js`

Contains Electron Forge packaging configuration for creating distributable installers.

### Platform Differences

In Electron, the app has access to the local filesystem. However, the current implementation uses `localStorage` for persistence (same as web), not the native filesystem. The `src/external/CapacitorFiles.ts` and `src/external/Files.ts` exist to abstract filesystem access, but Electron-specific storage is not yet implemented.

---

## Capacitor (iOS & Android)

### Building

```bash
npm run build:capacitor
```

This runs:

1. `npm run build:web` — Full web build
2. `npx cap sync` — Syncs the web bundle into the iOS/Android native projects

### Configuration

**File:** `capacitor.config.ts`

```typescript
const config: CapacitorConfig = {
  appId: "io.github.touch_grass_bible",
  appName: "Touch Grass Bible",
  webDir: "dist", // Points to the web build output
};
```

### Running on Device

```bash
# Android
npm run run:android     # npx cap run android

# iOS
npm run run:ios         # npx cap run ios
```

### Syncing Changes

After a web build, sync to native projects:

```bash
npm run sync:capacitor  # npx cap sync
```

### Native Features

The `@capacitor/filesystem` package is installed and a wrapper class (`src/external/CapacitorFiles.ts`) exists for accessing the native filesystem. This enables:

- Saving notes as actual files (not just localStorage)
- Exporting/importing settings from the device's Files app

However, full Capacitor filesystem integration may not be complete in the current version.

### Capacitor Packages

| Package                 | Version | Purpose                   |
| ----------------------- | ------- | ------------------------- |
| `@capacitor/core`       | ^8.2.0  | Core Capacitor runtime    |
| `@capacitor/cli`        | ^8.2.0  | CLI tools                 |
| `@capacitor/android`    | ^8.2.0  | Android native layer      |
| `@capacitor/ios`        | ^8.2.0  | iOS native layer          |
| `@capacitor/filesystem` | ^8.1.2  | Native file system access |
| `@capacitor/status-bar` | ^8.0.1  | Status bar styling        |

---

## Comparison

| Feature      | Web PWA                       | Electron                 | Capacitor                 |
| ------------ | ----------------------------- | ------------------------ | ------------------------- |
| Offline      | ✅ (Service Worker)           | ✅ (local files)         | ✅ (local files)          |
| Installation | Optional (browser prompt)     | Native installer         | App Store                 |
| Storage      | localStorage (~5-10 MB limit) | localStorage             | localStorage + filesystem |
| Distribution | URL                           | GitHub Releases / direct | App Stores                |
| Auto-update  | Service worker                | Manual / Squirrel        | App Store updates         |
| Platform     | Any browser                   | Windows, macOS, Linux    | iOS, Android              |
