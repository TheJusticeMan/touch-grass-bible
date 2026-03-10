# Event System — `ETarget`, `touchDragger`, `Openable`

**File:** `src/external/Event.ts`

---

## Overview

The event system provides a typed, chainable event emitter (`ETarget`) used throughout the entire framework. Nearly every class in Touch Grass Bible extends `ETarget` — from `App` down to individual `UIComponent` instances.

---

## `Chainable`

All ETarget classes extend `Chainable`, which provides a single utility:

```typescript
class Chainable {
  next(callback: (a: this) => void): this
  // Calls callback(this) and returns this.
  // Enables inline side effects in fluent chains.
}
```

---

## `ETarget<E>`

**Generic parameter:** `E extends Record<string, unknown>` — defines the event types and their payloads.

```typescript
abstract class ETarget<E extends Record<string, unknown>> extends Chainable {
  on<K extends keyof E>(eventName: K, handler: (e: E[K]) => void): this
  // Register a handler. Returns `this` for chaining.

  onany(handler: (eventName: keyof E, e: E[keyof E]) => void): this
  // Register a handler for ALL events. Useful for event proxying.

  off<K extends keyof E>(eventName: K, handler: (e: E[K]) => void): this
  // Unregister a specific handler.

  clear(eventName?: keyof E): this
  // Remove all handlers for one event, or all handlers if no event specified.

  emit<K extends keyof E>(eventName: K, e?: E[K]): this
  // Fire all handlers for this event. Default event data is {}.
  // Returns `this` for chaining.

  cancelOn<K extends keyof E>(unsubscribeOn: K, event: ETarget): this
  // When `unsubscribeOn` fires on this, the last registered handler on `event` is removed.
  // Useful for one-time cleanup patterns.

  get ActiveEvent(): keyof E | null
  // Returns the name of the currently executing event (if inside a handler).
  // Useful for re-entrancy detection.
}
```

### Typing Example

```typescript
class Button extends ETarget<{
  click: MouseEvent;
  hover: MouseEvent;
  change: { value: string };
}> {}

const btn = new Button();
btn.on("click", e => console.log(e.clientX));   // Typed: MouseEvent
btn.on("change", e => console.log(e.value));      // Typed: { value: string }
btn.emit("click", new MouseEvent("click"));
```

### Event Re-entrancy

The `_ActiveEvent` stack tracks currently executing events:

```typescript
emit("foo", data) {
  this._ActiveEvent.push("foo");
  // ... call handlers ...
  this._ActiveEvent.pop();
}
```

`get ActiveEvent` returns the top of the stack, so handlers can check what event triggered them.

---

## `touchDragger`

Attaches touch event listeners to a `HTMLElement` and emits semantic drag events.

### Events Emitted

| Event | Payload | When |
|-------|---------|------|
| `draggingX` | `{ deltaX: number }` | During horizontal swipe |
| `draggingY` | `{ deltaY: number }` | During vertical swipe |
| `dragX` | `{ deltaX: number }` | Horizontal swipe ≥ threshold (default 50px) |
| `dragY` | `{ deltaY: number }` | Vertical swipe ≥ threshold |
| `dragCancel` | `{ deltaX, deltaY }` | Swipe didn't reach threshold |
| `dragXcancel` | `{ deltaX, deltaY }` | Horizontal drag cancelled or vertical detected |
| `dragYcancel` | `{ deltaX, deltaY }` | Vertical drag cancelled or horizontal detected |

### Direction Detection

Direction is determined by comparing `|deltaX|` vs `|deltaY|`. The larger magnitude determines the direction. Only single-finger touches are processed.

### Usage in App

```typescript
// In App constructor:
new touchDragger(this.contentEl)
  .onany((name, e) => this.ctarget.emit(name, e));
// Forwards all drag events to the current keyboard/event target.
```

This allows views to listen for swipe events:

```typescript
app.on("dragX", ({ deltaX }) => {
  if (deltaX > 0) goBack();
  else goForward();
});
```

### Configuration

```typescript
dragger.setThreshold(100); // Require 100px drag to trigger dragX/dragY
```

---

## `Openable<E>`

A base class for modal overlays and dialog-like components. Manages open/close state and integrates with the `App` target stack.

```typescript
abstract class Openable<E extends Record<string, unknown>> extends ETarget<E> {
  constructor(appInstance: App)
  // Registers Escape key handler to auto-close.

  open(): this
  // Pushes this onto app.target stack → becomes keyboard event receiver.
  // Calls onopen().
  // Emits "open".

  close(): this
  // Pops from app.target stack.
  // Calls onclose().
  // Emits "close".

  get isOpen(): boolean

  abstract onopen(): void   // Create and show the overlay DOM
  abstract onclose(): void  // Remove the overlay DOM
}
```

### Target Stack Integration

Opening an `Openable` automatically makes it the active keyboard event receiver. This means:
- `Escape` key closes the modal (registered in constructor)
- Other keyboard events go to the modal instead of the app

On close, the previous target is restored.

### Subclass Example

```typescript
class ConfirmDialog extends Openable<{ confirm: void; cancel: void }> {
  onopen() {
    const dialog = document.createElement("div");
    dialog.innerHTML = `
      <button id="yes">Yes</button>
      <button id="no">No</button>
    `;
    dialog.querySelector("#yes")?.addEventListener("click", () => {
      this.emit("confirm");
      this.close();
    });
    dialog.querySelector("#no")?.addEventListener("click", () => {
      this.emit("cancel");
      this.close();
    });
    document.body.appendChild(dialog);
    this.dialogEl = dialog;
  }
  onclose() {
    this.dialogEl.remove();
  }
}

const dialog = new ConfirmDialog(app);
dialog.on("confirm", () => performAction());
dialog.open();
```

---

## `pdsp` Utility

```typescript
export function pdsp(cb: (e: Event) => void): (e: Event) => void
```

Wraps a callback to prevent default browser behavior and stop event propagation:

```typescript
element.addEventListener("contextmenu", pdsp(() => {
  // Right-click opens command palette instead of context menu
  app.openCommandPalette();
}));
```

---

## Keyboard Event Flow

```
User presses key
    │
    └── document.addEventListener("keydown", handler)
          │
          └── Constructs key string:
                key = (meta? "Meta+") + (ctrl? "Ctrl+") + (alt? "Alt+") +
                      (shift? "Shift+") + e.key
                      e.g.: "Ctrl+Enter", "Shift+A", "Escape"
              │
              └── app.ctarget.emit("keydown", { key, event })
              └── app.ctarget.emit(`${key}KeyDown`, { key, event })
```

**Example key strings:**
- `"Escape"` → `"EscapeKeyDown"`
- `"Enter"` → `"EnterKeyDown"`
- `"Ctrl+Enter"` → `"Ctrl+EnterKeyDown"`
- `"ArrowRight"` → `"ArrowRightKeyDown"`
- `"a"` → `"aKeyDown"`
- `"A"` (shift+a) → `"Shift+AKeyDown"`
