# Framework Improvements

This page focuses on the shared framework under `src/external/`: workspace, command palette, events, DOM helpers, components, and shared CSS.

## `src/external/App.ts`

- High: fix `beforeunload` handling so it uses the browser contract correctly and makes shutdown persistence more explicit
- High: tear down global listeners and helpers on unload
- Medium: use `this.doc` consistently instead of global `document`
- Medium: make history entries more meaningful if browser history integration remains enabled

## `src/external/App.css`

- High: remove or narrow global rules like `touch-action: none`, `user-select: none`, and pointer cursors on text inputs
- Medium: use viewport-safe sizing and safe-area handling for mobile shells
- Medium: add consistent base `:focus-visible` styles for inputs and buttons

## `src/external/CommandPalette.ts`

- High: fix duplicate or stale state emissions during `state` updates and `display()` flows
- High: add real dialog behavior with focus trap, focus restore, and ARIA dialog semantics
- Medium: stop rebuilding the entire palette container for every display/context switch
- Medium: reduce noisy browser-history integration for internal palette navigation

## `src/external/CommandPalette.css`

- Medium: add clear keyboard focus styling for header actions and command rows
- Medium: improve sizing and safe-area handling across desktop and mobile
- Low: improve overflow handling for long titles and descriptions

## `src/external/UIComponents.ts`

- High: fix `Item.highlight()` so it passes valid highlight configuration into `Highlighter`
- High: remove auto-focus side effects from input constructors
- High: replace clickable non-semantic `div` controls with buttons or full keyboard semantics
- Medium: make menus viewport-aware and closable with Escape

## `src/external/UIComponents.css`

- Medium: add z-index and viewport-safe behavior for context menus
- Medium: add visible focus and disabled states that match semantic controls
- Low: enlarge and retune `.scroll-bubble` for touch-heavy use

## `src/external/Event.ts`

- High: make `emit()` exception-safe and iterate over a copied handler list
- High: add better unsubscribe ergonomics such as `once`, disposer returns, and `offAny`
- High: make `Openable` pop the target stack only when it owns the top entry
- Medium: move `touchDragger` toward pointer events and a real destroy lifecycle

## `src/external/MyBrowserConsole.ts`

- Low: consider centralizing log-level policy so debug output can be toggled per subsystem instead of ad hoc booleans

## `src/external/MyHTML.ts`

- High: stop patching global `Node`, `HTMLElement`, and `String` prototypes and export helpers instead
- Medium: either implement or remove `createEl()` options that are declared but ignored
- Medium: make `setIcon()` replace children instead of appending endlessly
- Low: move `toTitleCase()` to a plain utility module

## `src/external/PaletteStateController.ts`

- High: use deeper clone semantics for snapshots so nested state does not bleed across contexts
- Medium: cap or prune the context stack during long sessions
- Medium: add disposal/unregistration for atom states that are no longer needed

## `src/external/Workspace.ts`

- High: make tab insertion pointer-aware so drops can distinguish before and after positions correctly
- High: gate `WorkspaceTrace` behind a development flag instead of patching methods in production
- Medium: serialize layout saves and handle persistence failures explicitly
- Medium: harden splitter cleanup for `pointercancel` and lost capture, and use more practical pane minimums

## `src/external/Workspace.css`

- High: replace mobile `first-of-type` and `last-of-type` assumptions with explicit panel-role classes
- [x] Medium: add `:focus-visible` styles for tabs, close buttons, and window controls
- Medium: add `:focus-visible` styles for resize handles
- Medium: respect `prefers-reduced-motion`

## `src/external/WorkspaceDom.ts`

- Medium: ensure tab buttons and close controls expose full semantic button behavior and keyboard support
- Medium: standardize unresolved-placeholder states so they are easier to debug and recover from

## `src/external/WorkspaceDragDrop.ts`

- High: compute insertion from pointer position and tab midpoint instead of only the hovered tab
- High: clean up drag state on `pointercancel`, blur, and lost capture
- Medium: allow dropping into empty tab groups and persistent placeholders
- Medium: throttle hover hit-testing work with `requestAnimationFrame`

## `src/external/WorkspaceLayoutModel.ts`

- Medium: add more validation around malformed or partially upgraded layouts and surface actionable errors when restore fails

## `src/external/WorkspaceMobileSwipe.ts`

- High: scope gestures to the workspace root and only enable them on touch/mobile layouts
- High: move to pointer events and handle cancel paths explicitly
- Medium: replace fixed scaling constants with width-aware thresholds
- Medium: ignore gestures from interactive elements and preserve normal scrolling

## `src/external/WorkspaceTrace.ts`

- High: keep tracing opt-in and dev-only to avoid runtime overhead and console noise in production
- Medium: make traces easier to sample or cap so long sessions do not grow logs indefinitely

## `src/external/escapeRegExp.ts`

- Low: add a focused test file because the helper is small but foundational for query safety

## `src/external/highlighter.ts`

- High: preserve the full match by default instead of assuming a capture group exists
- Medium: define deterministic overlap precedence rules for multiple highlight specs
- Medium: skip unnecessary regex replacement work when plain text output is enough
- Medium: add focused tests for overlap, nested children, and zero-length matches

## `src/external/settings.ts`

- High: support schema/default handling and nested changes instead of only top-level proxy writes
- Medium: return a stable settings object instead of a fresh proxy on every getter
- Medium: replace per-property console logging with optional debug and persistence hooks
- Medium: add direct tests for nested updates and single-emission behavior

## Test gaps

- High: add direct tests for `src/external/CommandPalette.ts`, `src/external/PaletteStateController.ts`, `src/external/Event.ts`, `src/external/settings.ts`, `src/external/highlighter.ts`, `src/external/MyHTML.ts`, and `src/external/UIComponents.ts`
- High: expand workspace drag/drop tests to cover midpoint insertion and cancel cleanup
- Medium: expand swipe tests to cover actual swipe thresholds, vertical rejection, and destroy cleanup

## Cross-cutting framework themes

- High: introduce one shared disposable/listener abstraction for app shell, overlays, swipe, drag, and menu cleanup
- High: improve accessibility defaults across all shared UI primitives before adding more product features
- Medium: consolidate design tokens and motion/focus rules across `App.css`, `Workspace.css`, `CommandPalette.css`, and `Components.css`
