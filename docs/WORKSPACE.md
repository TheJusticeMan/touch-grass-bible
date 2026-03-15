# Workspace System (external/Workspace.ts)

## Overview

The Workspace system provides a flexible panel-based layout manager similar to Obsidian. It handles:

- Tab groups and split groups
- View registration and lifecycle
- Drag-and-drop tab reordering
- Layout persistence
- Mobile swipe navigation

## Core Components

### Workspace Class

The main manager class that:

- Creates and manages `LayoutNode` panels
- Handles layout serialization/deserialization
- Manages active view and panel state
- Provides auto-save with debouncing

#### Key Methods

```typescript
class Workspace extends ETarget<WorkspaceEvents> {
  // View registration
  registerView(viewType: string, factory: ViewFactory): void;
  unregisterView(viewType: string): void;
  openView(viewType: string, panel: LayoutNode, options?): View | null;

  // Layout management
  serializeLayout(): WorkspaceLayout;
  restoreLayout(layout: WorkspaceLayout): boolean;
  saveLayout(): Promise<void>;

  // Panel operations
  createPanel(mode: NodeType, splitAxis: SplitAxis, id?, parent?): LayoutNode;
  splitPanelForDrop(target: LayoutNode, edge: PanelDropEdge, incoming: DetachedTab): LayoutNode;
}
```

### LayoutNode Class

Represents a single panel that can be either:

- **TabGroup**: Contains multiple views in tabs
- **SplitGroup**: Contains child panels

#### Key Methods

```typescript
class LayoutNode {
  // Mode management
  setMode(mode: NodeType): this;
  setSplitAxis(axis: SplitAxis): this;

  // View management
  addView(viewType: string, view: View, title?, activate?, state?): this;
  removeViewByTabId(tabId: string): this;
  setActiveViewById(tabId: string): this;

  // Child panels (for SplitGroup)
  addPanel(panel: LayoutNode, size: number): this;
  removePanel(panelId: string): this;

  // Serialization
  serialize(): SerializedPanel;
}
```

## Layout Serialization

Layouts are serialized to JSON with this structure:

```typescript
type WorkspaceLayout = {
  version: 2;
  rootPanel: SerializedPanel;
  activeViewPanelPath?: number[];
  activeViewIndex?: number;
};

type SerializedPanel = {
  id: string;
  mode: "TabGroup" | "SplitGroup";
  splitAxis: "row" | "column";
  views?: SerializedPanelView[];
  children?: SerializedPanelChild[];
  persistent?: boolean;
};
```

## LayoutTreeService

Handles complex layout operations:

- `applyDropIntent()` - Applies drag-drop operations
- `splitPanelForDrop()` - Creates split panels
- `normalizeLayout()` - Cleans up empty panels

## Potential Improvements

1. **Layout Templates**: Pre-defined layouts users can choose from
2. **Panel Resize**: Add precise resize with drag handles
3. **Floating Windows**: Support for detached/floating panels
4. **Multi-Root**: Support multiple workspace roots
5. **Undo/Redo**: Add layout change history
6. **Responsive Layouts**: Auto-adjust for screen size
