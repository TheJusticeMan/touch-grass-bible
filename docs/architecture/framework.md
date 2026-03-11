# The `external/` Framework

The `src/external/` directory contains a reusable, application-agnostic framework. It is the foundation that Touch Grass Bible is built on, but it could be used to build any browser-based, keyboard-driven application.

---

## File Inventory

| File | Lines | Role |
|------|-------|------|
| `App.ts` | 358 | Abstract application base class |
| `Workspace.ts` | ~1,400 | Panel/view layout system |
| `CommandPalette.ts` | ~922 | Unified command interface |
| `Components.ts` | ~716 | UI component library |
| `Event.ts` | ~270 | Event emitter and touch/drag handling |
| `MyHTML.ts` | ~235 | DOM helper utilities |
| `Files.ts` | ~323 | Platform-agnostic file I/O |
| `State.ts` | ~42 | Reactive state container |
| `PaletteStateController.ts` | ~126 | Command palette state navigation |
| `Highlighter.ts` | ~128 | Regex-based text highlighting |
| `MyBrowserConsole.ts` | ~72 | Formatted browser console wrapper |
| `Comands.ts` | ~92 | `CMD` and `toggleCMD` command helpers |
| `CapacitorFiles.ts` | ~64 | Capacitor filesystem API wrapper |
| `settings.ts` | ~39 | Settings utilities |
| `escapeRegExp.ts` | 4 | Regex escaping helper |

All of these are re-exported from `App.ts`, so consumers only need to import from `"./external/App"`.

---

## `App` — Abstract Application Shell

**File:** `src/external/App.ts`

`App` is the abstract base class every application extends. It wires together all the framework subsystems.

### Constructor

```typescript
constructor(doc: Document, title: string)
```

The constructor:
1. Creates the root `div.AppShellElement` in `doc.body`.
2. Attaches a `touchDragger` for swipe/drag support.
3. Sets up `keydown` event routing through the target stack.
4. Handles `beforeunload` and `popstate` browser events.
5. Calls `onload()` once the DOM is ready.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `console` | `BrowserConsole` | Formatted logging |
| `contentEl` | `HTMLElement` | Root DOM element (`div.AppShellElement`) |
| `workspace` | `Workspace` | The panel/view layout manager |
| `commandPalette` | `UnifiedCommandPalette` | The command palette instance |

### Target Stack

The `target` stack controls which `ETarget` receives keyboard events. When a modal opens, it pushes itself onto the stack. When closed, it pops itself. The getter `ctarget` returns the top of the stack.

```typescript
app.pushTarget(modal);    // Modal now receives key events
// ... modal is open ...
app.popTarget();          // App resumes receiving key events
```

### Abstract Methods

```typescript
abstract onload(): void;
abstract onunload(): boolean;
protected abstract getDefaultWorkspaceLayout(): WorkspaceLayout;
```

### Data Persistence

```typescript
saveData(data: object): Promise<void>       // → localStorage["app-data"]
loadData(): Promise<object>                  // ← localStorage["app-data"]
saveConfig(name: string, content: string)   // → localStorage["setting-{name}"]
loadConfig(name: string): Promise<string>   // ← localStorage["setting-{name}"]
```

### Workspace Integration

```typescript
loadWorkspaceLayout(): Promise<void>
saveWorkspaceLayout(): void
enableWorkspaceAutoSave(delay?: number): void  // Debounced 500ms
```

### File I/O Utilities

```typescript
loadJSON<T>(url: string): Promise<T>                // Fetch + parse JSON
uploadFile(accept, onContent, onError?, onWarn?)     // File input dialog
downloadFile(filename, data)                          // Trigger browser download
```

---

## `Workspace` — Panel/View Layout System

**File:** `src/external/Workspace.ts`

The `Workspace` manages a tree of panels and views. It supports:
- **Views** — Individual content panels (e.g., VerseScreen, NotesPanel)
- **Panels** — Containers that hold views (tab bar) or split into child panels
- **Split directions** — `"horizontal"` or `"vertical"`
- **Serialization** — Save/restore the entire layout to/from JSON

### Layout Structure

```typescript
type WorkspaceLayout = {
  version: number;
  rootPanel: PanelLayout;
};

type PanelLayout = {
  id: string;
  mode: "views" | "panels";
  splitDirection: "horizontal" | "vertical";
  views?: ViewLayout[];           // When mode="views"
  children?: PanelChild[];        // When mode="panels"
};
```

### Key Methods

```typescript
registerView(id: string, factory: (panel: Panel) => View): void
unregisterView(id: string): void
hasViewInLayout(id: string): boolean
ensureViewInLayout(id: string, fallbackLayout: WorkspaceLayout): void
restoreLayout(layout: WorkspaceLayout): boolean
serializeLayout(): WorkspaceLayout
```

### Events

The workspace emits `"layout-change"` whenever a panel is split, a view is added/removed, or tabs are rearranged. The app listens to this event to trigger debounced layout saves.

---

## `UnifiedCommandPalette` — Command Interface

**File:** `src/external/CommandPalette.ts`

The command palette is a modal overlay that aggregates multiple `CommandCategory` instances into a single unified search interface.

### Core Concepts

**CommandCategory** — A named category of commands. Plugins register categories via `app.commandPalette.addPalette(factory, id)`.

```typescript
abstract class CommandCategory<T> {
  abstract name: string;
  abstract description: string;
  abstract getCommands(query: string): T[];
  abstract renderCommand(cmd: T, item: CommandItem<T>): StateTransition;
  abstract executeCommand(cmd: T): void;
  onTrigger(state: CommandPaletteState): void;   // Called when category becomes active
}
```

**CommandItem** — A rendered row in the palette. Supports title, description, context button, and hidden state.

**State** — `CommandPaletteState` holds `topCategory`, `inputMode`, `maxResults`, etc.

### Navigation

The palette supports hierarchical navigation: selecting an item can update `topCategory` to drill into a sub-category (e.g., go-to-verse: book → chapter → verse).

```typescript
// State transition returned by renderCommand:
return (state) => state.update({ topCategory: "next-category-id" });
```

### Input Modes

- `"search"` — Full text search against command titles/descriptions
- `"numeric"` — Accepts numeric input for chapter/verse navigation

### Columns Layout

When the viewport is wider than 800px, the palette renders in a two-column layout for better use of screen real estate.

---

## `Components` — UI Component Library

**File:** `src/external/Components.ts`

A set of reusable DOM-based UI components. All extend `UIComponent`.

### `UIComponent<Tag>`

Base class for all UI elements.

```typescript
class UIComponent<Tag extends keyof HTMLElementTagNameMap> {
  containerEl: HTMLElementTagNameMap[Tag];
  parent?: UIComponent<any>;
  children: UIComponent<any>[];
  addClass(cls: string): this
  removeClass(cls: string): this
  createEl<T>(tag, options): T
  empty(): this
  remove(): void
}
```

### Included Components

| Component | Description |
|-----------|-------------|
| `Button` | Clickable button with `.onClick(cb)` and `.setIcon(icon)` |
| `IconButton` | Button with a Lucide icon |
| `TextInput` | Single-line input with `onEnter`, `onInput` callbacks |
| `TextArea` | Multi-line text area |
| `Item` | Listable row item with title and description slots |
| `sidePanel<App>` | Collapsible side panel attached to an App instance |
| `ScreenView<App>` | Full-screen view attached to an App instance |
| `Highlighter` | Applies regex-based formatting to text content |

---

## `ETarget` — Event System

**File:** `src/external/Event.ts`

`ETarget` is a typed event emitter. All interactive classes in the framework extend `ETarget`.

```typescript
class ETarget<Events extends { [key: string]: unknown }> {
  on(event: string, handler: (data) => void): void
  once(event: string, handler: (data) => void): void
  emit(event: string, data): void
  off(event: string, handler): void
}
```

See [EventSystem.md](../framework/EventSystem.md) for full details.

---

## `State` — Reactive State Container

**File:** `src/external/State.ts`

```typescript
class StateClass<T> {
  get(): T
  set(value: T): void
  onChange(cb: (value: T) => void): void
}
```

Used extensively in the command palette to track state that drives UI re-renders.

---

## `Highlighter`

**File:** `src/external/highlighter.ts`

Applies multiple regex patterns to a text string, wrapping matches in HTML elements.

```typescript
type HighlightRule = {
  regEXP: RegExp;
  elTag?: keyof HTMLElementTagNameMap;  // Wrap in this element
  cls?: string;                          // Apply this CSS class
  replace?: string;                      // Replace match content
};

const VerseHighlight = new Highlighter([
  { regEXP: /\[(.+?)\]/gi, elTag: "i" },          // Italics for translator notes
  { regEXP: /(LORD|God)/gi, elTag: "b" },           // Bold divine names
  { regEXP: /^(\d+)/gi, cls: "verseNumber" },       // Style verse numbers
  { regEXP: /#/gi, cls: "versePBreak", replace: "¶" }, // Paragraph marks
]);
```

---

## `BrowserConsole`

**File:** `src/external/MyBrowserConsole.ts`

Wraps `console` with:
- An `enabled` flag (disabled in production)
- A configurable prefix shown in all messages
- A `header()` method for styled log headers
- `log`, `warn`, `error` methods

---

## Re-exports

`App.ts` re-exports everything from all framework modules, so consuming code only needs:

```typescript
import { Button, TextInput, ETarget, Workspace } from "./external/App";
```
