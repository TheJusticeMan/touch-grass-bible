# Touch Grass Bible - Architecture Overview

## Project Structure

```
src/
├── main.ts                    # Main application entry point
├── Plugin.ts                  # Plugin system base classes
├── VerseRef.ts                # Bible verse reference handling
├── VerseScreen.ts             # Main Bible reading view
├── TGAppSettings.ts           # Settings management
├── Scroll.ts                  # Scroll navigation components
├── sidepanels.ts              # Navigation panel
├── BibleTopics.ts             # Bible topics/bookmarks data structure
├── booksOfTheBible.ts         # Bible book names
├── AIchat.ts                  # AI chat functionality
│
├── platform/                  # Platform abstraction layer
│   ├── types.ts               # Platform interfaces
│   ├── current.ts             # Platform detection
│   ├── web.ts                 # Web platform implementation
│   ├── electron.ts            # Electron platform implementation
│   ├── capacitor.ts           # Capacitor (mobile) implementation
│   └── browserFileIO.ts       # Browser file I/O utilities
│
├── external/                  # External/generic UI components
│   ├── App.ts                 # Base application class
│   ├── Workspace.ts           # Workspace/panel management
│   ├── CommandPalette.ts      # Command palette UI
│   ├── Components.ts          # Reusable UI components
│   ├── Event.ts               # Event system
│   ├── highlighter.ts         # Text highlighting
│   ├── PaletteStateController.ts # State management
│   ├── WorkspaceDom.ts        # Workspace DOM elements
│   ├── WorkspaceDragDrop.ts  # Drag and drop
│   ├── WorkspaceMobileSwipe.ts # Mobile swipe handling
│   ├── MyHTML.ts              # HTML utilities
│   ├── MyBrowserConsole.ts    # Console logging
│   ├── Comands.ts             # Command utilities
│   ├── settings.ts            # Settings utilities
│   └── escapeRegExp.ts        # Regex escaping
│
└── plugins/                   # Feature plugins
    ├── Bookmarks.ts           # Bookmark functionality
    ├── Settings.ts            # App settings
    ├── Search.ts              # Bible search
    ├── Notes/                 # Notes plugin
    ├── Journal/               # Journal plugin
    ├── TopicalBible.ts        # Topical Bible
    ├── Translations.ts        # Bible translations
    ├── TSK.ts                 # Treasury of Scripture Knowledge
    ├── AI.ts                  # AI assistant
    ├── Share.ts               # Share functionality
    └── categoryIDs.ts         # Category IDs
```

## Core Concepts

### Application Lifecycle

1. **TouchGrassBibleApp** (main.ts) extends **App** (external/App.ts)
2. App initializes workspace, loads settings, registers views
3. Plugins are loaded via the plugin system
4. Workspace manages panels and views

### Key Systems

- **Workspace**: Panel-based layout system (tabs, splits, drag-drop)
- **Command Palette**: Fuzzy search, categories, keyboard navigation
- **Plugin System**: Modular feature extensions
- **Platform Abstraction**: Web, Electron, Capacitor support

## Data Flow

```
User Input → Command Palette → CommandCategory → Plugin
                                    ↓
                              VerseScreen
                                    ↓
                              VerseRef (state)
                                    ↓
                              PlatformBridge (storage)
```

## Dependencies

- **lucide**: Icons
- **js-levenshtein**: Fuzzy search
- **apocalypse-throttle**: Scroll throttling
