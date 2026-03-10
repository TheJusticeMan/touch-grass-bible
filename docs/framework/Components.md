# UI Component Library

**File:** `src/external/Components.ts`

---

## Overview

Touch Grass Bible uses a custom, vanilla DOM-based component system. All UI elements extend `UIComponent<Tag>`, which provides parent/child hierarchy, CSS class management, and lifecycle utilities.

---

## `UIComponent<Tag>`

The base class for all UI elements.

```typescript
class UIComponent<Tag extends keyof HTMLElementTagNameMap> extends ETarget {
  element: HTMLElementTagNameMap[Tag];  // The root DOM element
  parent?: HTMLElement;
  children: UIComponent<any>[];
}
```

### Construction

```typescript
constructor(parent: HTMLElement, tag: Tag, options?: { cls?: string; text?: string })
```

Creates the element of `tag` type inside `parent`. Optionally applies a CSS class and text content.

### Methods

```typescript
addClass(cls: string): this
removeClass(cls: string): this
toggleClass(cls: string, force?: boolean): this
hasClass(cls: string): boolean
setAttr(attr: string, value: string): this
removeAttr(attr: string): this

createEl<T extends keyof HTMLElementTagNameMap>(
  tag: T,
  options?: { cls?: string; text?: string },
  callback?: (el: HTMLElement) => void
): HTMLElementTagNameMap[T]
// Creates a child element inside this.element.

empty(): this
// Removes all child nodes from this.element.

remove(): void
// Removes this.element from the DOM.

destroy(): void
// Removes element from DOM and clears children.
```

---

## `Button`

A clickable button element.

```typescript
class Button extends UIComponent<"button"> {
  setButtonText(text: string): this
  setIcon(icon: IconNode): this        // Lucide icon
  setTooltip(text: string): this
  onClick(callback: () => void): this  // Shorthand for .on("click", cb)
  setDisabled(disabled: boolean): this
}
```

---

## `IconButton`

A button variant designed for icon-only display (no text label).

```typescript
class IconButton extends UIComponent<"button"> {
  setIcon(icon: IconNode): this
  setTooltip(text: string): this
}
```

---

## `TextInput`

A single-line text input.

```typescript
class TextInput extends UIComponent<"input"> {
  setPlaceholder(text: string): this
  setValue(value: string): this
  getValue(): string
  setType(type: string): this   // "text", "search", "number", etc.
  on("input", (value: string) => void): this
  on("enter", (value: string) => void): this  // Enter key pressed
}
```

---

## `TextArea`

A multi-line text area.

```typescript
class TextArea extends UIComponent<"textarea"> {
  setPlaceholder(text: string): this
  setValue(value: string): this
  getValue(): string
  on("input", (value: string) => void): this
}
```

---

## `Item`

A listable row with title and optional description.

```typescript
class Item extends UIComponent<"div"> {
  setName(name: string): this
  setDescription(text: string): this
  on("click", () => void): this
}
```

Used in the command palette and navigation panel for clickable list rows.

---

## `sidePanel<App>`

A collapsible side panel attached to an `App` instance.

```typescript
abstract class sidePanel<TApp extends App> extends ETarget {
  app: TApp;
  containerEl: HTMLElement;
  open(): void
  close(): void
  toggle(): void
  isOpen: boolean
}
```

---

## `ScreenView<App>`

A full-screen view extending `UIComponent`. Used for overlay screens.

---

## `Openable<Events>`

A modal overlay base class with open/close lifecycle.

```typescript
abstract class Openable<Events> extends ETarget<Events> {
  open(): this
  close(): this
  abstract onopen(): void
  abstract onclose(): void
  isOpen: boolean
}
```

Used by `noteEditor` for the note editing overlay.

---

## `pdsp` Helper

```typescript
function pdsp(handler: () => void): (e: Event) => void
```

Returns an event handler that calls `e.preventDefault()` and `e.stopPropagation()` before calling `handler`. Shorthand for preventing event bubbling.

---

## CSS Architecture

Each major component group has a corresponding CSS file:

| CSS File | Component |
|----------|-----------|
| `App.css` | Base app shell layout |
| `CommandPalette.css` | Palette overlay and items |
| `Components.css` | Buttons, inputs, items |
| `Workspace.css` | Panel layouts, tab bars |
| `screen.css` | ScreenView styling |
| `VerseScreen.css` | Verse display, highlighting |
| `NotesPanel.css` | Notes panel, editor overlay |

The CSS uses CSS custom properties for theming (foreground/background colors from `settings.style`).
