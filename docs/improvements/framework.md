# Framework Improvements

This page focuses on shared framework code in `packages/framework/src/`.

## `packages/framework/src/App.ts`

- High: tighten unload cleanup for global listeners and history integration.
- High: verify beforeunload contract handling and persistence ordering.
- Medium: prefer injected document/context handles over globals.

## `packages/framework/src/CommandPalette.ts`

- High: stabilize state transitions to avoid duplicate emissions.
- High: improve dialog semantics (focus trap, focus restore, ARIA labels).
- Medium: reduce full re-render work during category/context switches.

## `packages/framework/src/CommandPalette.css`

- Medium: strengthen keyboard-visible states and reduced-motion coverage.
- Medium: improve long-title overflow behavior.

## `packages/framework/src/UIComponents.ts`

- High: remove auto-focus side effects from constructor paths.
- High: ensure non-button clickables have button semantics or real buttons.
- Medium: make menus viewport-aware and consistently escapable.

## `packages/framework/src/UIComponents.css`

- Medium: normalize focus/disabled states across reusable controls.
- Medium: improve touch sizing for high-frequency controls.

## `packages/framework/src/Event.ts`

- High: make `emit()` robust to handler exceptions and mutation during iteration.
- High: improve ergonomic subscription helpers (`once`, disposer-first APIs).
- Medium: tighten `Openable` stack ownership checks.

## `packages/framework/src/MyHTML.ts`

- High: reduce/replace global prototype mutation where practical.
- Medium: align declared helper options with implemented behavior.

## `packages/framework/src/PaletteStateController.ts`

- High: deepen snapshot semantics so nested state cannot leak across contexts.
- Medium: add pruning/disposal strategies for long sessions.

## `packages/framework/src/Workspace.ts`

- High: improve drop insertion logic to use pointer midpoint and panel intent.
- High: keep tracing/dev instrumentation opt-in.
- Medium: serialize saves and handle persistence failures explicitly.

## `packages/framework/src/Workspace.css`

- Medium: reduce DOM-order assumptions in mobile panel behavior.
- Medium: strengthen resize-handle keyboard/focus affordances.

## `packages/framework/src/SettingsStore.ts`

- High: support schema/default handling and nested updates cleanly.
- Medium: avoid excessive churn from fresh proxy/object wrappers on each read.

## `packages/framework/src/highlighter.ts`

- Medium: document overlap precedence and zero-length match behavior.
- Medium: add focused tests for nested/overlapping highlight specs.

## Test gaps

- High: expand direct tests for `CommandPalette.ts`, `PaletteStateController.ts`, and `SettingsStore.ts`.
- Medium: add coverage for workspace drag/drop midpoint behavior and cancel cleanup paths.
