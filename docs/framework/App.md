# `App` — Abstract Application Base Class

**File:** `src/external/App.ts`  
**Class:** `App`  
**Exported from:** `src/external/App.ts` (re-exported from `main.ts`)

---

## Purpose

`App` is the abstract base class that all Touch Grass Bible app instances extend. It provides the core infrastructure:

- DOM setup and lifecycle management
- Keyboard event routing
- Command palette hosting
- Workspace layout management
- Data persistence (localStorage)
- File import/export utilities

---

## Abstract Members (Must Be Implemented)

```typescript
abstract onload(): void;
// Called when the DOM is ready. Should initialize all app functionality.

abstract onunload(): boolean;
// Called on window.beforeunload. Should return true to allow unload.

protected abstract getDefaultWorkspaceLayout(): WorkspaceLayout;
// Should return the default panel/tab layout for first-time users.
```

---

## Constructor

```typescript
constructor(doc: Document, _title: string)
```

1. Calls `super()` on `ETarget`
2. Pushes `this` onto the target stack as the default keyboard event receiver
3. Creates `BrowserConsole` with the app title as prefix
4. Creates `div.AppShellElement` in `doc.body`
5. Attaches `touchDragger` for swipe/drag support
6. Sets `document.title`
7. Calls `onload()` immediately if DOM is ready, or waits for `DOMContentLoaded`
8. Attaches `document.keydown` listener for keyboard routing
9. Calls `handlescrollmobile()` to compensate for mobile viewport offset
10. Attaches `window.beforeunload` and `window.popstate` listeners

---

## Key Properties

| Property         | Type                    | Description                                  |
| ---------------- | ----------------------- | -------------------------------------------- |
| `console`        | `BrowserConsole`        | Formatted console for app logging            |
| `contentEl`      | `HTMLElement`           | Root DOM element (`div.AppShellElement`)     |
| `workspace`      | `Workspace`             | Panel/view layout manager                    |
| `commandPalette` | `UnifiedCommandPalette` | The command palette instance                 |
| `ctarget`        | `ETarget` (readonly)    | Current keyboard event target (top of stack) |

---

## Target Stack

The target stack enables context-sensitive keyboard handling:

```typescript
pushTarget(target: ETarget): this
// Adds a target to the top of the stack.
// All keyboard events now go to this target.

popTarget(): ETarget | undefined
// Removes and returns the top target.

get ctarget(): ETarget
// Returns the current top target (or `this` if stack is empty).
```

**Example:** Opening a modal:

```typescript
// Modal opens:
app.pushTarget(modal);
// Escape key now closes the modal, not the app

// Modal closes:
app.popTarget();
// Escape key behavior returns to app default
```

---

## Data Persistence

All data is stored in `localStorage`. There are two keys:

```typescript
// Settings / user data
async saveData(data: { [key: string]: unknown }): Promise<void>
// → localStorage["app-data"]

async loadData(): Promise<{ [key: string]: unknown }>
// ← localStorage["app-data"]

// Named config values (e.g., workspace layout)
async saveConfig(name: string, content: string): Promise<void>
// → localStorage["setting-{name}"]

async loadConfig(name: string): Promise<string>
// ← localStorage["setting-{name}"]
```

---

## Workspace Methods

```typescript
protected initializeWorkspaceHost(): HTMLDivElement
// Creates the root workspace host div inside contentEl.
// Only creates once; idempotent.

protected mountWorkspaceRoot(): void
// Appends the workspace root panel to the workspace host div.

async loadWorkspaceLayout(): Promise<void>
// Loads workspace config from localStorage and restores it.
// Falls back to getDefaultWorkspaceLayout() on failure.

saveWorkspaceLayout(): void
// Serializes and saves current workspace to localStorage.

saveWorkspaceAfterDelay(delay?: number): void
// Debounced workspace save (default 500ms).

protected enableWorkspaceAutoSave(delay?: number): void
// Subscribes to workspace "layout-change" events to trigger debounced saves.
```

---

## File I/O

```typescript
async loadJSON<T>(url: string): Promise<T>
// fetch(url) → parse JSON → return typed result

async uploadFile(
  accept: string,
  onFileContent: (content: unknown) => void,
  onError?: (error: unknown) => void,
  onWarn?: (message: string) => void
): Promise<void>
// Creates a hidden <input type="file"> element, triggers click,
// reads the selected file as text, parses as JSON, calls onFileContent.

downloadFile(filename: string, data: unknown): void
// Creates a data: URI with JSON-encoded data,
// appends a temporary <a> to the body, clicks it, removes it.
```

---

## Title Management

```typescript
get title(): string   // Returns document.title
set title(value: string)
// Sets document.title to value, or to _title if value is empty.
```

---

## Mobile Scroll Fix

```typescript
handlescrollmobile(): void
```

Compensates for mobile browsers' virtual viewport scrolling behavior. When the virtual viewport scrolls (e.g., due to keyboard opening), it adjusts the `contentEl.style.transform` to keep the app visually stable.

---

## `AppState`

```typescript
class AppState {
  constructor(
    public name: string = "",
    public time: Date = new Date(),
  )
  update(partial: Partial<AppState>): AppState
}
```

Represents a snapshot of the application state at a point in time. Used for history navigation. `update()` creates a new state with merged properties and an updated timestamp.

---

## Events

`App` extends `ETarget` and emits/handles these events:

| Event                 | Triggered By                                   |
| --------------------- | ---------------------------------------------- |
| `keydown`             | Any keyboard key press                         |
| `${key}KeyDown`       | Specific key presses (e.g., `"EscapeKeyDown"`) |
| `historypop`          | `window.popstate` (browser back button)        |
| `draggingX/Y`         | Touch dragging horizontally/vertically         |
| `dragX/Y`             | Completed touch drag                           |
| `dragXcancel/Ycancel` | Cancelled touch drag                           |
