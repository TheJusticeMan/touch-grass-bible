# [Touch Grass Bible](https://thejusticeman.github.io/touch-grass-bible/)

_A minimalist, offline-first Bible app that believes in simplicity, speed, and not getting in the way._  
Try it: [Touch Grass Bible](https://thejusticeman.github.io/touch-grass-bible/)

## Features

- Instant full-text Bible search
- Bookmarks with custom tags
- Rapid navigation to any verse or chapter
- Integrated cross-references (thanks, www.openbible.info)
- Topic search (thanks, www.openbible.info)
- Mobile & dark mode friendly
- No setup, no account, no nonsense-works offline after first load

## Quick Tips

- Tap the **library** icon (top left in the command palette) for easy navigation.
- On your phone? Tap the **expand** icon for a bigger, more thumb-friendly palette.
- Click the title bar or press <kbd>Enter</kbd> to pull up the command palette anywhere.
- Nearly everything's touch-friendly (the "Touch" is literal).

## Command Palette: Category Guide

Because "menus" are passe.

| Category             | What it Offers                                                                 |
| -------------------- | ------------------------------------------------------------------------------ |
| Current Bookmark Tag | View verses you've saved under a tag (Bookmarks).                              |
| Cross References     | "TSK+" connections. See related verses for deeper study.                       |
| Bookmarks            | Your universe of tagged bookmarks; rearrange your spiritual speed-dial.        |
| Go To Verse          | Jump straight to books, chapters, or verses with a few taps or keystrokes.     |
| Topics               | Browse verses by topic/theme. "Curiosity welcomed."                            |
| Bible Search         | Find verses by word/phrase-great for when you know a little phrase from        |
| Commands             | Miscellaneous app tools, power user specials, and things that don't fit above. |

## Technology

- Written in TypeScript
- No server or user accounts
- Web, Electron, and Capacitor builds

## External Plugins

External plugins are trusted single-file JavaScript modules with full access to the app. See the [plugin author and installation guide](docs/external-plugins.md) for the module contract, build flag, and lifecycle expectations.

## Development Setup

### Prerequisites

- Node.js (current LTS recommended)
- npm

### Install

```bash
npm install
```

### Run in Development

```bash
npm run dev
```

This starts the Capacitor-targeted build watcher and serves [dist/](/home/justice/Documents/dev/touch-grass-bible/dist) locally.

## Build Targets

The repository now uses the simplified script tree under [scripts/](/home/justice/Documents/dev/touch-grass-bible/scripts). The archived legacy script folder [old-scripts-OBSOLETE/](/home/justice/Documents/dev/touch-grass-bible/old-scripts-OBSOLETE) is not required for active builds.

```bash
npm run build
npm run build:framework
npm run build:app
npm run build:bundle:capacitor
npm run build:bundle:electron
npm run build:electron
npm run build:capacitor
npm run run:electron
npm run package:electron
npm run make:electron
```

`build:capacitor` runs the Capacitor sync flow after creating the web bundle.

During `build*` flows, `data:assets` copies embedding files, bundled Bible translations from [data/translations/](/home/justice/Documents/dev/touch-grass-bible/data/translations), and [bible-map-umap.json](/home/justice/Documents/dev/touch-grass-bible/data/bible-map-umap.json) into [dist/assets/](/home/justice/Documents/dev/touch-grass-bible/dist/assets).

### Verify all build targets

```bash
targets=(build build:framework build:app build:bundle:capacitor build:bundle:electron build:electron build:capacitor)
for t in "${targets[@]}"; do
  echo "==> $t"
  npm run "$t"
done
```

### Download a translation from BibleSuperSearch

```bash
npm run data:download:bible -- YLT
```

This writes to [data/translations/](/home/justice/Documents/dev/touch-grass-bible/data/translations) using the app's translation JSON shape.
It also updates [metadata.json](/home/justice/Documents/dev/touch-grass-bible/data/translations/metadata.json) with the upstream `metadata` payload keyed by translation code.

Download all downloadable English translations:

```bash
npm run data:download:english
```

This command also refreshes [metadata.json](/home/justice/Documents/dev/touch-grass-bible/data/translations/metadata.json) for all downloaded translations.

The app reads [metadata.json](/home/justice/Documents/dev/touch-grass-bible/data/translations/metadata.json) at startup to determine which translations appear in the Translations menu.

## License

MIT. Share as you will.

## Why "Touch Grass"?

Because faith is as real as dirt under your fingernails.  
Put your screen down sometimes, but if you must pick it up, let's make it count.
