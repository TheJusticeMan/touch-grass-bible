# Touch Grass Bible - Documentation Index

Welcome to the Touch Grass Bible documentation. This file provides an overview of all available documentation.

## Getting Started

- **[ARCHITECTURE.md](ARCHITECTURE.md)** - High-level project structure and overview

## Core Systems

- **[MAIN_APP.md](MAIN_APP.md)** - Main application entry point
- **[APP_BASE.md](APP_BASE.md)** - Base application class
- **[VERSE_REF.md](VERSE_REF.md)** - Verse reference system
- **[VERSE_SCREEN.md](VERSE_SCREEN.md)** - Main Bible reading view
- **[SETTINGS.md](SETTINGS.md)** - Application settings

## User Interface

- **[WORKSPACE.md](WORKSPACE.md)** - Panel/layout management system
- **[COMMAND_PALETTE.md](COMMAND_PALETTE.md)** - Command palette UI

## Extensions

- **[PLUGIN_SYSTEM.md](PLUGIN_SYSTEM.md)** - Plugin architecture
- **[PLUGINS.md](PLUGINS.md)** - Built-in plugins reference

## Infrastructure

- **[PLATFORM.md](PLATFORM.md)** - Platform abstraction layer

## Development

- **[IMPROVEMENTS.md](IMPROVEMENTS.md)** - Potential improvements and enhancements

---

## Quick Links

### Key Classes

| Class                   | File                       | Description        |
| ----------------------- | -------------------------- | ------------------ |
| `TouchGrassBibleApp`    | main.ts                    | Main application   |
| `App`                   | external/App.ts            | Base app class     |
| `VerseScreen`           | VerseScreen.ts             | Bible reading view |
| `VerseRef`              | VerseRef.ts                | Verse reference    |
| `Workspace`             | external/Workspace.ts      | Layout system      |
| `UnifiedCommandPalette` | external/CommandPalette.ts | Command palette    |
| `Plugin`                | Plugin.ts                  | Plugin base class  |

### Key Interfaces

| Interface             | File                       | Description          |
| --------------------- | -------------------------- | -------------------- |
| `TGAppSettings`       | TGAppSettings.ts           | App settings         |
| `PlatformBridge`      | platform/types.ts          | Platform abstraction |
| `WorkspaceLayout`     | external/Workspace.ts      | Layout config        |
| `CommandPaletteState` | external/CommandPalette.ts | Palette state        |
