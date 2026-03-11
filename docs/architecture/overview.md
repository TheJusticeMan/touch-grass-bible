# Architecture Overview

Touch Grass Bible is built as a **single-page, offline-first application** with no backend dependency. The architecture follows a layered, plugin-oriented design built entirely on a custom TypeScript framework.

---

## High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                          Browser / Electron / Capacitor          │
├─────────────────────────────────────────────────────────────────┤
│                        Touch Grass Bible App                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   TouchGrassBibleApp                     │   │
│  │  ┌──────────────────┐   ┌──────────────────────────┐   │   │
│  │  │   Workspace       │   │   Command Palette         │   │   │
│  │  │  ┌────────────┐  │   │  ┌────────────────────┐  │   │   │
│  │  │  │VerseScreen │  │   │  │  Plugin Categories  │  │   │   │
│  │  │  ├────────────┤  │   │  │  (Search, Bookmarks │  │   │   │
│  │  │  │Navigation  │  │   │  │   TSK, Topics, etc) │  │   │   │
│  │  │  ├────────────┤  │   │  └────────────────────┘  │   │   │
│  │  │  │NotesPanel  │  │   └──────────────────────────┘   │   │
│  │  │  └────────────┘  │                                   │   │
│  │  └──────────────────┘                                   │   │
│  └─────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│                  Plugin Layer (src/plugins/)                      │
│   BookmarkPlugin · TSKPlugin · BibleSearchPlugin · NotesPlugin   │
│   TopicalBiblePlugin · TranslationsPlugin · SettingsPlugin       │
├─────────────────────────────────────────────────────────────────┤
│                  Core Data Layer (src/)                           │
│   VerseRef · BibleTopics · NoteVault · TGAppSettings             │
├─────────────────────────────────────────────────────────────────┤
│              Framework Layer (src/external/)                      │
│   App · Workspace · CommandPalette · Components · Event          │
├─────────────────────────────────────────────────────────────────┤
│                    Bible Data (dist/ + fetch)                     │
│    translations.json · crossrefs.json · topics.json             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layers Explained

### 1. Framework Layer (`src/external/`)

The lowest-level layer. Contains entirely reusable, application-agnostic building blocks:

- **`App`** — Abstract base class. All applications extend this. Provides localStorage persistence, keyboard routing, workspace management, command palette, and browser history integration.
- **`Workspace`** — Flexible panel/view layout system with split directions. Serializable to/from JSON.
- **`UnifiedCommandPalette`** — Multi-category command interface with fuzzy search, keyboard navigation, and state control.
- **`UIComponent`** — Base for all UI elements (buttons, inputs, panels, views). Provides parent/child hierarchy, lifecycle, and CSS management.
- **`ETarget`** — Event emitter system supporting typed events. All interactive classes extend this.

> See [framework/](../framework/) for detailed documentation on each class.

---

### 2. Core Data Layer (`src/`)

Domain models and data structures specific to the Bible study domain:

- **`VerseRef`** — Central model. Holds `book`, `chapter`, `verse`. Provides access to Bible text, OSIS format conversion, cross-references, bookmarks, notes, external URLs, and navigation (next/prev chapter).
- **`BibleTopics`** — Maps topic names to verse references with optional ratings. Used for both user bookmarks and the OpenBible topical index.
- **`NoteVault`** — Stores and retrieves personal notes (keyed by verse OSIS). Notes are separate from the inline per-verse notes in `VerseRef`.
- **`TGAppSettings`** — TypeScript interface plus defaults defining all user-configurable settings.

---

### 3. Plugin Layer (`src/plugins/`)

Each plugin is a self-contained module extending the `Plugin` base class. Plugins:
- Register command categories in the command palette.
- Optionally add action buttons to individual verse displays.
- Optionally register new workspace views.
- Automatically clean up on unload via registered unloaders.

**Plugins loaded at startup (in `main.ts`):**
1. `BookmarkPlugin` — Bookmark tags and verse lists
2. `TSK` — Cross-reference lookup (Treasury of Scripture Knowledge)
3. `BibleSearchPlugin` — Full-text search + hierarchical go-to-verse
4. `TopicalBiblePlugin` — Topic browsing
5. `NotesPlugin` — Personal notes per verse
6. `TranslationsPlugin` — Switch between KJV/YLT/ASV
7. `SettingsPlugin` — In-app configuration

---

### 4. Application Layer (`src/main.ts`)

`TouchGrassBibleApp` extends `App` and coordinates all other layers:
- Loads settings from localStorage
- Fetches Bible translation data from `translations.json`
- Instantiates and loads all plugins
- Registers workspace views (VerseScreen, NotesPanel, navigationPanel)
- Sets up the default workspace layout
- Handles keyboard shortcuts and auto-save

---

### 5. Platform Layer

The same JavaScript bundle runs on three platforms with minimal differences:

| Platform | Entry | Storage | File I/O |
|----------|-------|---------|---------|
| Web (PWA) | `src/web/index.html` | `localStorage` | Service Worker cache |
| Electron | `src/electron/electron.js` | `localStorage` + Node fs | Native filesystem |
| iOS/Android | Capacitor | `localStorage` | `@capacitor/filesystem` |

---

## Key Design Principles

### Offline-First
All Bible data is bundled or cached by a service worker. There is no runtime API dependency. The app works fully offline after the first load.

### No External UI Framework
The app is built on a custom component system (`src/external/Components.ts`). No React, Vue, or Angular — just TypeScript and the DOM.

### Separation of Concerns via Plugins
Features are isolated in plugins. Adding or removing a feature doesn't touch the core app. Each plugin registers its own command categories and verse actions, and cleans up after itself when unloaded.

### Keyboard-First Navigation
The `App` base class routes keyboard events through a stack-based target system (`ctarget`). This enables context-sensitive keyboard handling: the active modal/view intercepts keys before they fall through to the app.

### Single Source of Truth for Bible Data
`VerseRef` is a static singleton-like data store. All Bible text is accessed via `VerseRef.bibleTranslations`. Cross-references, topics, bookmarks, and notes are all accessible via `VerseRef` static and instance members. This makes it trivial to look up related data from anywhere in the codebase.

---

## File Count & Size Summary

| Directory | Files | Purpose |
|-----------|-------|---------|
| `src/` | ~13 TS files | App-specific logic |
| `src/external/` | ~15 TS files + CSS | Reusable framework |
| `src/plugins/` | 8 TS files | Feature modules |
| `src/web/` | 4 files | PWA assets |
| `src/electron/` | 3 files | Desktop wrapper |
| `processing/` | 5 files | Data pipeline scripts |
| `scripts/` | 4 files | Utility scripts |
| `data/` | 3 JSON files (~4 MB each) | Bible translation text |
