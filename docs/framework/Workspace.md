# `Workspace` — Panel/View Layout System

**File:** `src/external/Workspace.ts`

---

## Overview

The `Workspace` manages a tree-based panel/view layout system. It supports:

- **Panels** — Containers that either split into child panels or show views in tabs
- **Views** — Individual content components (VerseScreen, NotesPanel, etc.)
- **Serialization** — Full layout state can be saved to and restored from JSON

---

## Core Types

```typescript
type WorkspaceLayout = {
  version: number;
  rootPanel: PanelLayout;
};

type PanelLayout = {
  id: string;
  mode: "views" | "panels";
  splitDirection: "horizontal" | "vertical";
  views?: ViewLayout[]; // Used when mode="views"
  children?: PanelChild[]; // Used when mode="panels"
};

type PanelChild = {
  size: number; // Relative size (flex weight)
  panel: PanelLayout;
};

type ViewLayout = {
  id: string; // Must match a registered view ID
  title: string; // Tab label
};
```

---

## `Workspace` Class

### View Registration

```typescript
registerView(id: string, factory: (panel: Panel) => View): void
// Registers a view factory function. When a panel needs to create a view
// with this ID, it calls factory(panel) to get the View instance.

unregisterView(id: string): void
// Removes the view factory.
```

### Layout Operations

```typescript
restoreLayout(layout: WorkspaceLayout): boolean
// Applies a layout to the workspace. Returns true if successful.

restoreLayoutFromString(
  rawLayout: string,
  fallback: WorkspaceLayout,
  callbacks: { onInvalidJSON: (e) => void; onRejectedLayout: () => void }
): void
// Parses rawLayout string, falls back to fallback on any error.

serializeLayout(): WorkspaceLayout
// Returns the current layout as a JSON-serializable object.

hasViewInLayout(id: string): boolean
// Returns true if any panel in the layout contains a view with this ID.

ensureViewInLayout(id: string, fallbackLayout: WorkspaceLayout): void
// If the view is not found, restores the fallbackLayout.
```

### Access

```typescript
get rootPanel(): Panel
// The root panel of the layout tree.

activateView(id: string): void
// Makes the panel containing this view ID the active tab.
```

### Events

```typescript
on("layout-change", handler): void
// Fires whenever the layout is modified (view added, panel split, tab changed).
```

---

## `Panel` Class

Represents a single node in the layout tree. Panels can be in two modes:

### `mode: "views"` (Tab Bar)

Shows one or more views as tabs. The tab bar allows switching between views.

```typescript
panel.addView(view: View, title: string): void
panel.removeView(view: View): void
panel.activateView(view: View): void
panel.activeView: View | null
```

### `mode: "panels"` (Split Container)

Contains child panels split horizontally or vertically with adjustable dividers.

```typescript
panel.addChild(panel: Panel, size: number): void
panel.removeChild(panel: Panel): void
panel.splitDirection: "horizontal" | "vertical"
```

### DOM

Each `Panel` has a `containerEl: HTMLElement` that is mounted in the workspace host.

---

## `View` Class

A `View` is the content rendered inside a panel tab.

```typescript
class View extends ETarget {
  containerEl: HTMLElement; // The view's root DOM element
  panel: Panel; // The parent panel
  title: string; // Shown in the tab bar

  onActivate(): void; // Called when this view's tab is selected
  onDeactivate(): void; // Called when another view's tab is selected
}
```

**Subclassing `View`:**

```typescript
class MyView extends View {
  onActivate() {
    // Re-render or update content when tab becomes active
  }
  onDeactivate() {
    // Save state or clean up when leaving the tab
  }
}
```

---

## Default Layout (Touch Grass Bible)

```
Root Panel [horizontal split]
├── Main Area [views, size=3]
│   ├── Tab: Scripture → VerseScreen
│   └── Tab: Tools → reading-tools (static info panel)
└── Sidebar [views, size=2]
    ├── Tab: Navigate → navigationPanel
    └── Tab: Notes → NotesPanel
```

---

## Layout Persistence

The workspace layout is serialized and saved to `localStorage["setting-workspace"]` whenever the layout changes (with a 500ms debounce).

On startup:

1. `loadWorkspaceLayout()` reads from localStorage
2. Tries to `restoreLayout(savedLayout)`
3. Falls back to `getDefaultWorkspaceLayout()` if:
   - The JSON is invalid
   - The layout is rejected (e.g., version mismatch or missing views)
