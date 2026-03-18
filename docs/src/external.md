# External Framework Files

This page covers the reusable framework layer under `src/external/`, including the app shell, workspace system, command palette, event model, and UI components.

## `src/external/App.ts`

- Purpose: abstract app shell that boots the DOM, workspace, command palette, and platform helpers
- Key APIs: `App`, `AppState`
- Owns `contentEl`, `Workspace`, and the unified command palette.
- Routes keyboard, drag, and history events through a current event-target stack.
- Wraps storage and file helpers from the active platform bridge.

## `src/external/App.css`

- Purpose: base shell styling
- Key selectors: `body`, `.app-shell-element`, form controls
- Makes the app full-viewport and non-scrollable.
- Applies shared styling for controls and shell surfaces.

## `src/external/Comands.ts`

- Purpose: command object model used by the command palette
- Key APIs: `CMD`, `SettingCMD<T>`, `toggleCMD`
- Defines command metadata, click behavior, and UI item synchronization.
- Adds setting-aware and boolean-toggle command variants.
- Used by `src/external/CommandPalette.ts` and settings-like plugin flows.

## `src/external/CommandPalette.ts`

- Purpose: command palette framework and overlay UI logic
- Key APIs: `UnifiedCommandPalette`, `CommandPaletteState`, `CommandCategory<T>`, `CommandItem<T>`, `CMDCategory`
- Builds the searchable overlay, category sections, and selection state.
- Supports palette state history, prompts, back navigation, and browser history integration.
- Performs query matching and highlighting, including fuzzy matching.
- Depends on components, events, highlighter, commands, and palette state controller helpers.

## `src/external/CommandPalette.css`

- Purpose: command palette styling
- Key selectors: overlay, header, category, command item, `.highlighted-query`
- Styles the translucent overlay, search input, two-column layout, and selected item states.
- Matches DOM structures created by `src/external/CommandPalette.ts`.

## `src/external/Components.ts`

- Purpose: reusable DOM component toolkit
- Key APIs: `UIComponent`, `StackComponent`, `RowComponent`, `SurfaceComponent`, `Button`, `IconButton`, `ScrollBubble`, `Item`, `Menu`
- Wraps element creation, listener management, mounting, and cleanup.
- Provides reusable inputs, buttons, icon actions, menus, and list-row components.
- Defines `ScrollBubble`, which powers book/chapter navigation in the reading UI.

## `src/external/Components.css`

- Purpose: shared component styling
- Key selectors: `.scroll-bubble`, layout utility classes, menu classes, `.icon-action`
- Styles scroll bubbles, flex layout helpers, icon actions, and context menus.
- Supports the UI primitives defined in `src/external/Components.ts`.

## `src/external/Event.ts`

- Purpose: lightweight typed event system and open/close helpers
- Key APIs: `ETarget`, `touchDragger`, `Openable`, `pdsp`
- Provides typed `on`, `off`, `emit`, and listener cleanup support.
- Adds touch dragging helpers and an `Openable` base with escape-to-close behavior.
- Underpins most interactive classes in the app.

## `src/external/MyBrowserConsole.ts`

- Purpose: prefixed browser console wrapper
- Key APIs: `BrowserConsole`
- Adds an enable flag and consistent prefixing for logs, warnings, and errors.
- Used by app, settings, AI, and command palette layers.

## `src/external/MyHTML.ts`

- Purpose: global DOM and string prototype helpers
- Key APIs: `DomElementInfo`; runtime additions like `createEl`, `setIcon`, `toTitleCase`
- Adds convenience helpers used across the codebase for element creation and icon rendering.
- Extends `String` with the title-case helper used by verse formatting.

## `src/external/PaletteStateController.ts`

- Purpose: snapshot-based palette state manager
- Key APIs: `PaletteState<T>`, `PaletteStateController<S>`
- Provides atom-like state objects with copy-on-read behavior.
- Supports snapshotting and restoring multiple state values for palette navigation history.
- Used directly by `src/external/CommandPalette.ts`.

## `src/external/Workspace.ts`

- Purpose: split-panel and tabbed workspace system
- Key APIs: `WorkspaceLayout`, `Workspace`, `LayoutNode`, `View`, plus related layout types
- Manages registered views, nested split/tab layouts, active panel tracking, and persistence.
- Restores serialized layouts and falls back to defaults on invalid state.
- Coordinates drag/drop, mobile swipe handling, and workspace DOM wrappers.

## `src/external/Workspace.css`

- Purpose: workspace layout styling
- Key selectors: root host, panel, tabs, drop targets, resize handles, mobile panel states
- Defines visuals for tabs, split groups, unresolved views, and drag/drop affordances.
- Includes mobile rules driven by CSS variables updated by swipe handling.

## `src/external/Workspace.test.ts`

- Purpose: workspace behavior tests
- Key APIs: Vitest coverage for `Workspace` and `View`
- Verifies layout restore, unresolved-view hydration, active view restoration, and state persistence.
- Covers tab reorder/drop behavior and split-axis styling expectations.

## `src/external/WorkspaceDom.ts`

- Purpose: small DOM wrapper classes for workspace UI pieces
- Key APIs: `WorkspaceTabButton`, `WorkspacePlaceholder`, `WorkspacePanelContainer`, `WorkspacePanelTabs`, `WorkspacePanelContent`
- Encapsulates tab button rendering, unresolved placeholders, and panel wrappers.
- Works with class names and modes expected by `src/external/Workspace.css`.

## `src/external/WorkspaceDragDrop.ts`

- Purpose: workspace tab drag/drop targeting
- Key APIs: `PanelDropEdge`, `DragDropController`
- Detects reorder vs. split-drop intents from pointer movement and panel geometry.
- Applies visual feedback classes and passes final intent back to the workspace.

## `src/external/WorkspaceLayoutModel.ts`

- Purpose: validation and traversal helpers for serialized layouts
- Key APIs: `LayoutNode`, `LayoutGroupNode`, `LayoutViewNode`, `WorkspaceLayoutModel`
- Validates layout versions, active view path/index, and nested panel shape.
- Offers helpers for traversal, view existence checks, and collecting view IDs.

## `src/external/WorkspaceMobileSwipe.ts`

- Purpose: global mobile swipe handler for side panels
- Key APIs: `GlobalSwipeHandler`
- Tracks touch and mouse gestures to open or close left/right side panels on narrow layouts.
- Mutates CSS variables consumed by `src/external/Workspace.css`.

## `src/external/WorkspaceMobileSwipe.test.ts`

- Purpose: tests for swipe handler click/no-drag behavior
- Key APIs: Vitest coverage for `GlobalSwipeHandler`
- Confirms simple clicks do not accidentally open or close panels.
- Uses mocked document listeners and style objects.

## `src/external/WorkspaceTrace.ts`

- Purpose: debug tracing utility for workspace lifecycle methods
- Key APIs: `workspaceMethodLifecycleLogs`, `getWorkspaceMethodLifecycleLogs()`, `clearWorkspaceMethodLifecycleLogs()`, `monkeypatchAllWorkspaceMethods()`
- Monkeypatches prototype methods once and logs `START`, `END`, and `ERROR` states.
- Supports both synchronous and promise-returning methods.
- Hooked in at the end of `src/external/Workspace.ts`.

## `src/external/escapeRegExp.ts`

- Purpose: escape user input before building regexes
- Key APIs: `escapeRegExp`
- Escapes regex metacharacters in arbitrary strings.
- Used when building command-palette search highlighters.

## `src/external/highlighter.ts`

- Purpose: regex-driven DOM highlighter
- Key APIs: `HighlightType`, `Highlighter`
- Collects, sorts, and renders non-overlapping text matches into a `DocumentFragment`.
- Supports custom wrappers, replacement text, and nested child highlighters.
- Used by palette and list UI rendering.

## `src/external/settings.ts`

- Purpose: proxy-based settings container with events
- Key APIs: `SettingsClass<SettingsType>`
- Emits `settingsChange` when proxied settings values change.
- Uses a proxy to support direct property assignment while keeping change notifications centralized.
