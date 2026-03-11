# Touch Grass Bible — Documentation

Welcome to the documentation for the **Touch Grass Bible** project — a minimalist, offline-first Bible study application built entirely in TypeScript with no external frameworks.

## What is Touch Grass Bible?

Touch Grass Bible is a fast, keyboard-driven Bible reading and study app that works in the browser, as a desktop application (Electron), and on mobile (iOS/Android via Capacitor). It offers full-text search, cross-references, topical browsing, bookmarks, personal notes, and multiple translations — all without a backend or user account.

> "Because faith is as real as dirt under your fingernails."

**Live App:** [https://thejusticeman.github.io/touch-grass-bible/](https://thejusticeman.github.io/touch-grass-bible/)

---

## Documentation Index

### Architecture
| Document | Description |
|----------|-------------|
| [architecture/overview.md](architecture/overview.md) | High-level architecture: components, layers, and relationships |
| [architecture/framework.md](architecture/framework.md) | The `external/` framework: base classes and reusable systems |
| [architecture/plugin-system.md](architecture/plugin-system.md) | Plugin lifecycle, registration, and command integration |
| [architecture/data-flow.md](architecture/data-flow.md) | Data flow, reactive state, and persistence strategy |

### Core Modules
| Document | Description |
|----------|-------------|
| [modules/main.md](modules/main.md) | `TouchGrassBibleApp` — entry point and app orchestration |
| [modules/VerseRef.md](modules/VerseRef.md) | `VerseRef` — verse reference model and Bible data access |
| [modules/BibleTopics.md](modules/BibleTopics.md) | `BibleTopics` — topic and bookmark management |
| [modules/VerseScreen.md](modules/VerseScreen.md) | `VerseScreen` — main verse display and chapter rendering |
| [modules/NotesPanel.md](modules/NotesPanel.md) | `NotesPanel` / `NoteVault` — personal notes system |
| [modules/sidepanels.md](modules/sidepanels.md) | `navigationPanel` — sidebar navigation |
| [modules/AIchat.md](modules/AIchat.md) | `AIchat` — AI chat integration (in progress) |
| [modules/settings.md](modules/settings.md) | `TGAppSettings` — settings schema and defaults |

### Framework (`src/external/`)
| Document | Description |
|----------|-------------|
| [framework/App.md](framework/App.md) | `App` — abstract base class for all app instances |
| [framework/Workspace.md](framework/Workspace.md) | `Workspace` — panel/view layout system |
| [framework/CommandPalette.md](framework/CommandPalette.md) | `UnifiedCommandPalette` — command palette and categories |
| [framework/Components.md](framework/Components.md) | UI component library: `Button`, `TextInput`, `Item`, etc. |
| [framework/EventSystem.md](framework/EventSystem.md) | `ETarget` event emitter and keyboard event routing |

### Plugins (`src/plugins/`)
| Document | Description |
|----------|-------------|
| [plugins/overview.md](plugins/overview.md) | All plugins at a glance — overview and comparison |
| [plugins/Search.md](plugins/Search.md) | `BibleSearchPlugin` — full-text search and hierarchical navigation |
| [plugins/Bookmarks.md](plugins/Bookmarks.md) | `BookmarkPlugin` — bookmark tags and verse collections |
| [plugins/TSK.md](plugins/TSK.md) | `TSK` — cross-references from Treasury of Scripture Knowledge |
| [plugins/Topics.md](plugins/Topics.md) | `TopicalBiblePlugin` — topic-based verse browsing |
| [plugins/Notes.md](plugins/Notes.md) | `NotesPlugin` — personal verse notes management |
| [plugins/Translations.md](plugins/Translations.md) | `TranslationsPlugin` — Bible translation switcher |
| [plugins/Settings.md](plugins/Settings.md) | `SettingsPlugin` — in-app configuration panel |

### Data
| Document | Description |
|----------|-------------|
| [data/bible-data.md](data/bible-data.md) | Bible data formats: translations, cross-refs, topics |
| [data/processing.md](data/processing.md) | Data processing scripts (`processing/`) |

### Build & Deployment
| Document | Description |
|----------|-------------|
| [build/setup.md](build/setup.md) | First-time setup and development workflow |
| [build/build-system.md](build/build-system.md) | esbuild configuration and build pipeline |
| [build/deployment.md](build/deployment.md) | Web (PWA), Electron (desktop), Capacitor (mobile) |

### Improvements & Roadmap
| Document | Description |
|----------|-------------|
| [improvements/overview.md](improvements/overview.md) | Summary of recommended improvements |
| [improvements/architecture.md](improvements/architecture.md) | Architectural refactoring suggestions |
| [improvements/testing.md](improvements/testing.md) | Testing strategy and test coverage recommendations |
| [improvements/features.md](improvements/features.md) | Feature ideas and enhancement proposals |

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/TheJusticeMan/touch-grass-bible.git
cd touch-grass-bible

# Install dependencies
npm install

# Download Bible data files
npm run getdatafiles

# Start development server
npm run dev
# Opens at http://localhost:3000
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (strict mode) |
| Bundler | esbuild |
| UI Framework | None (custom, vanilla DOM) |
| Search | `@orama/orama` + Levenshtein distance |
| Icons | Lucide |
| Mobile | Capacitor (iOS/Android) |
| Desktop | Electron |
| Data | OpenBible.info (cross-refs, topics) |
| Storage | `localStorage` (no backend) |

## License

MIT — see [LICENCE](../LICENCE)
