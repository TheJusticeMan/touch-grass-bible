# VanJS in Touch Grass Bible

This guide explains how VanJS is used in this codebase.
It is not a general VanJS tutorial. It shows the patterns already used in app, framework, and plugins.

## Core Pattern

Most UI in this repo follows this shape:

1. Create state with `van.state(...)` or `commandPalette.useVanState(...)`.
2. Build DOM with `van.tags` helpers.
3. Use reactive functions `() => ...` for dynamic class/style/content.
4. Use `van.derive(...)` for syncing state and side effects.
5. Mount with `van.add(...)` or return a root element from `create()`.

## Imports You Will Usually Write

```ts
import van, { State } from "vanjs-core";
const { div, button, input, span } = van.tags;
```

- Use `State<T>` when you want explicit state typing.
- Pull only needed tags from `van.tags`.

## Which State API To Use Here

### `commandPalette.useVanState(...)`

Use this for state that should follow command-palette history/context and integrate with app navigation behavior.

Example (used in `VerseScreen` and app-level verse state):

```ts
readonly verseState = this.commandPalette.useVanState(new VerseRef("GENESIS", 1, 1))
readonly translationState = this.commandPalette.useVanState<translation>("KJV")
```

### `van.state(...)`

Use this for local UI state that does not need palette history snapshots.

Example:

```ts
const isAddingTag = van.state(false);
const newTag = van.state("");
```

### Legacy `useState(...)`

`commandPalette.useState(...)` returns the framework wrapper state (`PaletteState`), not native Van state.
Use this only where existing code still depends on `.get()` / `.set()` style APIs.

## Reactive Rendering Pattern

Use function children and function props for live updates.

```ts
return div(
  {
    class: () => (selected.val ? "item active" : "item"),
  },
  () => (selected.val ? "Selected" : "Not selected"),
);
```

Patterns in this repo:

- Dynamic class names for active verses/titles.
- Dynamic style strings (for example, drag bubble position).
- Conditional sections rendered by `() => condition ? div(...) : div()`.

## `van.derive(...)` in This Repo

`van.derive` is used for two main jobs:

1. Keep states synchronized.
2. Run side effects when dependencies change.

Example pattern from app/view sync:

```ts
van.derive(() => {
  const activeView = this.workspace.layoutController.activeView.val;
  if (!(activeView instanceof VerseScreen)) return;

  const viewVerse = activeView.state.verse.val;
  if (!this.verseState.val.isSame(viewVerse)) {
    this.verseState.val = viewVerse;
  }
});
```

Use guards to avoid loops:

- Compare new/old values before assignment.
- Prefer domain equality checks (like `isSame(...)`) for object values.

## Mounting UI

Two common mounting paths are used:

1. Return a root element from a `create()` method (views/components).
2. Use `van.add(target, child)` for contextual or injected UI.

Example (`Bookmarks` action menu style):

```ts
van.add(
  verseInfo.element,
  div(
    () => div(...usedTags.val.map(tag => button(tag))),
    () => (isAddingTag.val ? input({ value: newTag.val }) : button("Add")),
  ),
);
```

## Updating Arrays and Objects Safely

Do not rely on in-place mutation for reactivity.
When updating array/object state, assign a fresh value to `.val`.

Good:

```ts
items.val = [...items.val, nextItem];
```

Also used in repo to force refresh after nested behavior:

```ts
this.verseActions.val = [...this.verseActions.val];
```

## Event Handler Style

Inline handlers are the normal pattern:

```ts
button({
  onclick: () => {
    isAddingTag.val = true;
  },
});
```

For input:

```ts
input({
  value: newTag.val,
  oninput: e => (newTag.val = (e.target as HTMLInputElement).value),
});
```

## Lifecycle and Cleanup

When a UI object owns timers/listeners, clean them up in lifecycle hooks.

Pattern used in `VerseScreen`:

```ts
onUnmount(): void {
  this.scrollBubbleLifecycle?.destroy()
  this.scrollBubbleLifecycle = null
}
```

## Practical Checklist

When adding new VanJS UI in this project:

1. Choose state API: `useVanState` (palette-scoped) or `van.state` (local).
2. Build with `van.tags` and reactive function children/props.
3. Use `van.derive` only for true synchronization/side effects.
4. Guard assignments to prevent reactive ping-pong loops.
5. Reassign arrays/objects instead of mutating in place.
6. Clean up listeners/timers in teardown hooks.

## File Examples to Copy From

- `src/main.ts` for app-level state bridges with `van.derive`.
- `src/ui/VerseScreen.ts` for reactive view rendering and lifecycle cleanup.
- `src/plugins/Bookmarks.ts` for dynamic contextual UI with `van.add`.
- `packages/framework/src/CommandPalette.ts` for `useState` vs `useVanState` APIs.
- `packages/framework/src/PaletteStateController.ts` for palette-scoped Van state behavior.
