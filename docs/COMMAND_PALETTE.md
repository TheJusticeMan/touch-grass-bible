# Command Palette System (external/CommandPalette.ts)

## Overview

The Command Palette is a powerful fuzzy-search interface inspired by VS Code/Alfred. It provides:

- Category-based command organization
- Fuzzy search with Levenshtein distance
- Keyboard navigation
- Context stacks for drill-down
- Mobile-friendly interface

## Core Classes

### UnifiedCommandPalette

The main palette controller.

```typescript
class UnifiedCommandPalette extends Openable<Events> {
  // State management
  useState<T>(initialValue: T): PaletteState<T>;

  // Category management
  addPalette(load: CategoryLoaderFunc, id: string): this;
  addHiddenPalette(load: CategoryLoaderFunc, id: string): this;
  getCategory(id: string): CategoryLoader | undefined;

  // Display
  display(context?: Partial<CommandPaletteState>, saveHistory?: boolean): void;
  update(context: Partial<CommandPaletteState>): this;
  open(): void;
  close(): void;

  // User input
  prompt(text: string): Promise<string | null>;
  confirm(text: string): Promise<boolean>;
}
```

### CommandCategory<T>

Abstract base class for command categories.

```typescript
abstract class CommandCategory<T> {
  abstract name: string;
  abstract description: string;
  abstract title: string;

  // Lifecycle
  abstract onTrigger(state: CommandPaletteState): void;
  abstract getCommands(query: string): T[];
  abstract renderCommand(command: T, el: CommandItem<T>): Partial<CommandPaletteState>;
  abstract executeCommand(command: T): void;

  // Helpers
  getcompatible<T>(query: string, array: T[], ...criteria): T[];
  getcompatibleWithLevenshtein<T>(query: string, array: T[], ...criteria): T[];
}
```

### CommandItem<T>

Represents a single command in the palette.

```typescript
class CommandItem<T> extends Item {
  command: T;
  toState: (state: CommandPaletteState) => CommandPaletteState;

  setTitle(title: string): this;
  setDescription(desc: string): this;
  addctx(): this; // Add context menu
  on(event, handler): this;
}
```

## State Management

### PaletteState<T>

Reactive state with change notifications:

```typescript
class PaletteState<T> {
  get(): T;
  set(value: T): void;
  onChange(listener: (value: T) => void): () => void;
}
```

### PaletteStateController<T>

Manages multiple palette states with history:

```typescript
class PaletteStateController<T> {
  useState(initialValue: T): PaletteState<T>;
  pushCurrentContext(): void;
  popPreviousContext(): T | undefined;
  clearContexts(): void;
}
```

## Search Algorithm

1. First, exact substring matches (case-insensitive)
2. Then, fuzzy matches using Levenshtein distance
3. Results sorted by relevance (distance)
4. Max results: 100 (configurable)

## Keyboard Navigation

| Key                    | Action            |
| ---------------------- | ----------------- |
| Arrow Up/Down          | Navigate items    |
| Enter                  | Select item       |
| Arrow Right / Tab      | Open context menu |
| Arrow Left / Shift+Tab | Go back           |
| Escape                 | Close palette     |

## Potential Improvements

1. **Search Plugins**: Allow external search backends
2. **Fuzzy Algorithm**: Consider fuse.js for better fuzzy matching
3. **Keyboard Shortcuts**: Assign shortcuts to commands
4. **Command Groups**: Organize commands into folders
5. **Recent Commands**: Track and show recently used
6. **Pinning**: Allow pinning favorite commands
