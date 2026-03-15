# Base Application Class (external/App.ts)

## Overview

The `App` class is the abstract base class for all applications. It provides core functionality for event handling, state management, command palette integration, history navigation, and data persistence.

## Key Features

### 1. Event System

- Extends `ETarget` for event emission
- Keyboard event handling with modifier key support
- Touch drag events via `touchDragger`

### 2. Workspace Management

- Creates and manages the workspace instance
- Handles workspace layout serialization/deserialization

### 3. Data Persistence

- `saveData()` / `loadData()` - App-wide storage
- `saveConfig()` / `loadConfig()` - Named config storage
- `uploadFile()` / `downloadFile()` - File import/export

### 4. Platform Abstraction

- Uses `PlatformBridge` for platform-specific operations
- Supports web, Electron, and Capacitor

## Class Structure

```typescript
abstract class App extends ETarget<Events> {
  console: BrowserConsole;
  contentEl: HTMLElement;
  workspace: Workspace;
  commandPalette: UnifiedCommandPalette;
  platformBridge: PlatformBridge;

  // Event target stack
  pushTarget(target: ETarget): this;
  popTarget(): ETarget | undefined;

  // Data operations
  async saveData(data: object): Promise<void>;
  async loadData(): Promise<object>;
  async loadJSON<T>(url: string): Promise<T>;
  async uploadFile(...): Promise<void>;
  downloadFile(filename: string, data: unknown): void;

  // Abstract methods
  abstract onload(): void | Promise<void>;
  abstract onunload(): boolean;
  abstract getDefaultWorkspaceLayout(): WorkspaceLayout;
}
```

## Event Types

| Event         | Payload              | Description         |
| ------------- | -------------------- | ------------------- |
| `keydown`     | `{ key, event }`     | Keyboard input      |
| `historypop`  | `object`             | Browser back button |
| `draggingX/Y` | `{ deltaX/Y }`       | Touch drag          |
| `dragCancel`  | `{ deltaX, deltaY }` | Drag cancelled      |

## Potential Improvements

1. **Lifecycle Hooks**: Add `onReady()`, `onError()` hooks
2. **Plugin API**: Expose more methods for plugin access
3. **Error Recovery**: Better error handling for data loading
4. **Theme Support**: Built-in theming system
5. **Accessibility**: Add ARIA attributes to AppShellElement
