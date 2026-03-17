# External Components Reference

This document catalogs the reusable UI components and utilities in the `external/` directory.

## Components

### Components.ts

Core UI building blocks:

| Component             | Description               |
| --------------------- | ------------------------- |
| `UIComponent<T>`      | Base component class      |
| `Button`              | Button with icon/text     |
| `IconButton`          | Icon-only button          |
| `TextInput`           | Text input field          |
| `Item`                | List item                 |
| `IconActionComponent` | Icon with action          |
| `ScrollBubble`        | Scroll position indicator |

### DOM Elements (WorkspaceDom.ts)

| Component                 | Description         |
| ------------------------- | ------------------- |
| `WorkspacePanelContainer` | Panel container     |
| `WorkspacePanelTabs`      | Tab bar             |
| `WorkspacePanelContent`   | Panel content       |
| `WorkspaceTabButton`      | Tab button          |
| `WorkspacePlaceholder`    | Loading placeholder |

## Utilities

### Event.ts

Event system:

```typescript
class ETarget<Events> {
  on<K extends keyof Events>(event: K, handler: (e: Events[K]) => void): this;
  emit<K extends keyof Events>(event: K, data: Events[K]): void;
  off<K extends keyof Events>(event: K, handler: (...args: any[]) => void): void;
  once<K extends keyof Events>(event: K, handler: (e: Events[K]) => void): this;
}

class Openable<Events> extends ETarget<Events> {
  isOpen: boolean;
  open(): void;
  close(): void;
  toggle(): void;
}
```

### highlighter.ts

Text highlighting:

```typescript
class Highlighter {
  constructor(patterns: HighlightPattern[]);
  highlight(text: string): string;
}

type HighlightPattern = {
  regEXP: RegExp;
  elTag?: string; // Wrap in element
  cls?: string; // Add class
  replace?: string; // Replace match
};
```

### escapeRegExp.ts

RegExp escaping:

```typescript
function escapeRegExp(string: string): string;
```

### MyBrowserConsole.ts

Console logging:

```typescript
class BrowserConsole {
  constructor(enabled: boolean, prefix?: string);
  log(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
  header(style?: string): void;
}
```

### MyHTML.ts

HTML utilities:

```typescript
// DOM manipulation helpers
// See source for full API
```

### settings.ts

Settings utilities:

```typescript
// Settings-related helpers
// See source for full API
```

## State Management

### PaletteStateController.ts

Manages reactive state:

```typescript
class PaletteState<T> {
  get(): T;
  set(value: T): void;
  onChange(listener: (value: T) => void): () => void;
}

class PaletteStateController<T> {
  useState(initialValue: T): PaletteState<T>;
  pushCurrentContext(): void;
  popPreviousContext(): T | undefined;
  clearContexts(): void;
}
```

## Drag and Drop

### WorkspaceDragDrop.ts

Tab drag and drop:

```typescript
class DragDropController {
  handleTabPointerDown(panel: LayoutNode, tabId: string, event: PointerEvent): void;
  // ...
}
```

## Mobile Support

### WorkspaceMobileSwipe.ts

Mobile swipe navigation:

```typescript
class GlobalSwipeHandler {
  // Handle swipe gestures
}
```
