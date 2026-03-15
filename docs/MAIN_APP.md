# Application Core (main.ts)

## Overview

The `main.ts` file is the entry point for the Touch Grass Bible application. It defines the `TouchGrassBibleApp` class that extends the base `App` class and initializes all core functionality.

## Key Responsibilities

1. **Application Initialization**
   - Loads settings and Bible data
   - Registers workspace views (VerseScreen, NavigationPanel, etc.)
   - Sets up command palette
   - Initializes all plugins

2. **State Management**
   - Manages `verseState` - current verse reference
   - Tracks `defaultTranslation` - current Bible translation
   - Handles `settings` - application configuration

3. **Plugin Management**
   - Uses `internalPlugins` to manage plugin lifecycle
   - Registers 10 built-in plugins (Bookmarks, Notes, Journal, Search, etc.)

## Class: TouchGrassBibleApp

### Properties

| Property             | Type                        | Description                      |
| -------------------- | --------------------------- | -------------------------------- |
| `settings`           | `TGAppSettings`             | Application configuration        |
| `plugins`            | `internalPlugins`           | Plugin manager instance          |
| `verseState`         | `PaletteState<VerseRef>`    | Current verse reference          |
| `defaultTranslation` | `PaletteState<translation>` | Current Bible translation        |
| `firstLoad`          | `boolean`                   | First load flag for help display |

### Methods

#### `onload()`

Async initialization method that:

- Loads translations.json
- Registers workspace views
- Creates default layout
- Sets up keyboard shortcuts (Ctrl+Enter for command palette)
- Loads all plugins

#### `openCommandPalette(state?)`

Opens the command palette with optional state.

#### `loadsettings(defaults)`

Loads settings with deep merge of defaults and saved data.

#### `saveSettingsAfterDelay(delay?)`

Debounced settings save (default 5 seconds).

#### `getDefaultWorkspaceLayout()`

Returns the default 3-panel layout:

- Left: Navigation panel
- Center: Verse screen + Tools
- Right: Notes panel

## Verse Actions

The app maintains a collection of verse actions (bookmark, note, etc.) that appear on each verse. Plugins can register actions via:

- `addVerseAction(action)` - Add an action
- `removeVerseAction(id)` - Remove an action
- `getVerseActions()` - Get all actions

## Potential Improvements

1. **Lazy Loading**: Consider lazy-loading Bible data to improve startup time
2. **Plugin Loading**: Add async plugin loading with progress indicators
3. **Error Boundaries**: Add error handling for plugin loading failures
4. **Settings Migration**: Add schema version handling for settings migration
5. **Memory Management**: Consider WeakMap for verse state instead of Map
