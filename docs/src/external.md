# Framework Files

This page covers the reusable framework layer under `packages/framework/src/`, including the app shell, workspace system, command palette, event model, and UI components.

## `packages/framework/src/App.ts`

- Purpose: abstract app shell that boots the DOM, workspace, command palette, and platform helpers
- Key APIs: `App`, `AppState`
- Owns `contentEl`, `Workspace`, and the unified command palette.
- Routes keyboard, drag, and history events through a current event-target stack.
- Wraps storage and file helpers from the active platform bridge.

## `packages/framework/src/App.css`

- Purpose: base shell styling
- Key selectors: `body`, `.app-shell-element`, form controls
- Makes the app full-viewport and non-scrollable.
- Applies shared styling for controls and shell surfaces.

## `packages/framework/src/Comands.ts`

- Purpose: command object model used by the command palette
- Key APIs: `CMD`, `SettingCMD<T>`, `toggleCMD`
- Defines command metadata, click behavior, and UI item synchronization.
- Adds setting-aware and boolean-toggle command variants.
- Used by command-palette and settings-like flows.

## `packages/framework/src/Commands.ts`

- Purpose: modern command object model used by framework consumers
- Key APIs: `CMD`, command metadata types, command action contracts
- Coexists with `Comands.ts` for compatibility while newer imports move to `Commands.ts`.

## `packages/framework/src/CommandPalette.ts`

- Purpose: command palette framework and overlay UI logic
- Key APIs: `UnifiedCommandPalette`, `CommandPaletteState`, `CommandCategory<T>`, `CommandItem<T>`, `CMDCategory`
- Builds the searchable overlay, category sections, and selection state.
- Supports palette state history, prompts, back navigation, and browser history integration.
- Performs query matching and highlighting, including fuzzy matching.
- Depends on components, events, highlighter, commands, and palette state helpers.

## `packages/framework/src/CommandPalette.css`

- Purpose: command palette styling
- Key selectors: overlay, header, category, command item, `.highlighted-query`
- Styles the translucent overlay, search input, two-column layout, and selected item states.
- Matches DOM structures created by `packages/framework/src/CommandPalette.ts`.

## `packages/framework/src/UIComponents.ts`

- Purpose: reusable DOM component toolkit
- Key APIs: `UIComponent`, `StackComponent`, `RowComponent`, `SurfaceComponent`, `Button`, `IconButton`, `ScrollBubble`, `Item`, `Menu`
- Wraps element creation, listener management, mounting, and cleanup.
- Provides reusable inputs, buttons, icon actions, menus, and list-row components.
- Defines `ScrollBubble`, which powers book/chapter navigation in the reading UI.

## `packages/framework/src/UIComponents.css`

- Purpose: shared component styling
- Key selectors: `.scroll-bubble`, layout utility classes, menu classes, `.icon-action`
- Styles scroll bubbles, flex layout helpers, icon actions, and context menus.
- Supports the UI primitives defined in `packages/framework/src/UIComponents.ts`.

## `packages/framework/src/Event.ts`

- Purpose: lightweight typed event system and open/close helpers
- Key APIs: `ETarget`, `touchDragger`, `Openable`, `pdsp`
- Provides typed `on`, `off`, `emit`, and listener cleanup support.
- Adds touch dragging helpers and an `Openable` base with escape-to-close behavior.
- Underpins most interactive classes in the app.

## `packages/framework/src/MyBrowserConsole.ts`

- Purpose: prefixed browser console wrapper
- Key APIs: `BrowserConsole`
- Adds an enable flag and consistent prefixing for logs, warnings, and errors.
- Used by app, settings, AI, and command palette layers.

## `packages/framework/src/MyHTML.ts`

- Purpose: global DOM and string prototype helpers
- Key APIs: `DomElementInfo`; runtime additions like `createEl`, `setIcon`, `toTitleCase`
- Adds convenience helpers used across the codebase for element creation and icon rendering.
- Extends `String` with the title-case helper used by verse formatting.

## `packages/framework/src/PaletteStateController.ts`

- Purpose: snapshot-based palette state manager
- Key APIs: `PaletteState<T>`, `PaletteStateController<S>`
- Provides atom-like state objects with copy-on-read behavior.
- Supports snapshotting and restoring multiple state values for palette navigation history.
- Used directly by `packages/framework/src/CommandPalette.ts`.

## `packages/framework/src/Workspace.ts`

- Purpose: split-panel and tabbed workspace system
- Key APIs: `WorkspaceLayout`, `Workspace`, `LayoutNode`, `View`, plus related layout types
- Manages registered views, nested split/tab layouts, active panel tracking, and persistence.
- Restores serialized layouts and falls back to defaults on invalid state.
- Coordinates drag/drop, mobile swipe handling, and workspace DOM wrappers.

## `packages/framework/src/Workspace.css`

- Purpose: workspace layout styling
- Key selectors: root host, panel, tabs, drop targets, resize handles, mobile panel states
- Defines visuals for tabs, split groups, unresolved views, and drag/drop affordances.
- Includes mobile-aware rules driven by framework gesture handling.

## `packages/framework/src/GestureHandler.ts`

- Purpose: shared pointer/touch gesture handling primitives used by workspace and UI components.

## `packages/framework/src/Offset.ts`

- Purpose: geometry helpers for position/distance math in drag and gesture flows.

## `packages/framework/src/Offset.test.ts`

- Purpose: tests for geometry helper correctness.

## `packages/framework/src/escapeRegExp.ts`

- Purpose: escape user input before building regexes
- Key APIs: `escapeRegExp`
- Escapes regex metacharacters in arbitrary strings.
- Used when building command-palette search highlighters.

## `packages/framework/src/highlighter.ts`

- Purpose: regex-driven DOM highlighter
- Key APIs: `HighlightType`, `Highlighter`
- Collects, sorts, and renders non-overlapping text matches into a `DocumentFragment`.
- Supports custom wrappers, replacement text, and nested child highlighters.
- Used by palette and list UI rendering.

## `packages/framework/src/SettingsStore.ts`

- Purpose: framework-level settings store abstraction
- Key APIs: settings store types and persistence helpers consumed by framework modules.

## `packages/framework/src/CommandPaletteSettings.ts`

- Purpose: command palette settings defaults/contracts for category order and related state.

## `packages/framework/src/Plugin.ts`

- Purpose: framework-level plugin/runtime interfaces for host apps.

## `packages/framework/src/PlatformBridge.ts`

- Purpose: platform contract types consumed by framework and app layers.

## `packages/framework/src/deepMerge.ts`

- Purpose: shared deep-merge utility extracted from app startup flows.

## `packages/framework/src/deepMerge.test.ts`

- Purpose: tests for deep-merge edge cases and stability.

## `packages/framework/src/index.ts`

- Purpose: package export surface for framework consumers.
