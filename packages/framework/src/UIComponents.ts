import { IconNode } from "lucide";
import van, { Props, PropsWithKnownKeys, State } from "vanjs-core";
import { highlight, HighlightRule } from "./highlighter";
import { renderIcon } from "./Icons";
import "./UIComponents.css";

const { div, input } = van.tags;

export function toggle(options: {
  checked: boolean | State<boolean>;
  onclick: (e: MouseEvent, state: State<boolean>) => void;
}): HTMLElement {
  const state = options.checked instanceof Object ? options.checked : van.state(options.checked);
  return input({
    class: "ui-toggle-input",
    type: "checkbox",
    checked: state,
    role: "switch",
    onchange: e => (state.val = (e.target as HTMLInputElement).checked),
    onclick: (e: MouseEvent) => (
      (state.val = (e.currentTarget as HTMLInputElement).checked),
      options.onclick(e, state)
    ),
  });
}

export function slider(options: {
  value: number | State<number>;
  onchange: (value: number) => void;
}): HTMLElement {
  const state = options.value instanceof Object ? options.value : van.state(options.value);

  // van.derive.on("change", value => slider.setValue(value));
  return input({
    class: "ui-slider-input",
    type: "range",
    value: state,
    role: "slider",
    onchange: e => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      state.val = value;
      options.onchange(value);
    },
  });
}

/**
 * Represents a UI item within a command palette, encapsulating its DOM elements,
 * state, and interaction logic.
 *
 * @template T - The type of the command represented by this item.
 * @template  - The type of the application, extending `App`.
 *
 * @remarks
 * This class is responsible for rendering a command item, managing its title,
 * description, context menu visibility, and handling user interactions such as
 * clicks and mouse events. It is designed to be used within a command palette
 * component, supporting context menus and state management.
 *
 * @example
 * ```typescript
 * const item = new CommandItem(app, parentEl, command, paletteCategory)
 *   .setTitle("My command")
 *   .setDescription("Does something useful")
 *   .setContextMenuVisibility(true)
 *   .onClick(() => { /* handle click *\/ });
 * ```
 *
 * @see CommandCategory
 * @see CommandPaletteState
 */
export class Item {
  element: HTMLDivElement;
  description = van.state("");
  title = van.state("");
  components = van.state([] as Array<{ element: HTMLElement }>);
  hidden = van.state(true);

  private highlighter = van.state<HighlightRule[]>([]); // Highlighter for the description
  constructor(l: Props & PropsWithKnownKeys<HTMLDivElement> = {}) {
    this.element = div(
      { class: "command-item", ...l },
      div(
        { class: "command-item-info" },
        () => div({ class: "command-title" }, highlight(this.title.val, this.highlighter.val)),
        () =>
          div(
            { class: () => `command-description ${this.hidden.val ? "hidden" : ""}` },
            highlight(this.description.val, this.highlighter.val),
          ),
      ),
      () =>
        div(
          { class: "command-comp" },
          this.components.val.map(comp => comp.element),
        ),
    );
  }

  setHidden(hide: boolean) {
    this.hidden.val = hide;
    return this;
  }

  highlight(args: HighlightRule[]) {
    this.highlighter.val = args;
    return this;
  }

  setTitle(title: string) {
    this.title.val = title;
    return this;
  }

  setDescription(text: string) {
    this.description.val = text;
    return this;
  }

  addComponent(element: HTMLElement) {
    this.components.val = [...this.components.val, { element }];
    return this;
  }

  prependComponent(element: HTMLElement) {
    this.components.val = [{ element }, ...this.components.val];
    return this;
  }
}

type MenuVanItem = {
  title: string;
  description?: string;
  icon?: IconNode;
  onClick?: (e: MouseEvent) => void;
};

export class MenuVan {
  items: State<MenuVanItem[]>;
  el?: HTMLDivElement;
  resizeObserver?: ResizeObserver;
  anchorX: number = 0;
  anchorY: number = 0;

  constructor(items: MenuVanItem[] = []) {
    this.items = van.state(items);
  }

  addItem(item: MenuVanItem) {
    this.items.val = [...this.items.val, item];
    return this;
  }

  addItems(items: MenuVanItem[]) {
    this.items.val = [...this.items.val, ...items];
    return this;
  }

  clear() {
    this.items.val = [];
    return this;
  }

  render(event: MouseEvent | TouchEvent | PointerEvent) {
    const hasTouches = "touches" in event || "changedTouches" in event;
    const point = hasTouches
      ? ((event as TouchEvent).touches[0] ?? (event as TouchEvent).changedTouches[0])
      : (event as MouseEvent | PointerEvent);
    this.anchorX = point?.clientX ?? 0;
    this.anchorY = point?.clientY ?? 0;

    // 1. Declare reactive states for positioning and direction
    const menuX = van.state(this.anchorX);
    const menuY = van.state(this.anchorY);
    const isLeft = van.state(false);
    const isTop = van.state(false);

    this.el = div(
      {
        // 2. Bind the states directly to the class and style attributes using arrow functions
        class: () =>
          `context-menu ${isLeft.val ? "is-left" : "is-right"} ${isTop.val ? "is-top" : "is-bottom"}`,
        style: () => `--menu-x: ${menuX.val}px; --menu-y: ${menuY.val}px;`,
      },
      () =>
        div(
          this.items.val.map(item =>
            div(
              {
                class: "menu-item",
                onClick: e => {
                  e.stopPropagation();
                  item.onClick?.(e);
                },
              },
              item.icon ? renderIcon(item.icon) : null,
              div({ class: "menu-title" }, item.title),
              item.description ? div({ class: "menu-description" }, item.description) : null,
            ),
          ),
        ),
    );

    van.add(document.body, this.el);

    this.resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const targetEl = entry.target as HTMLElement;
        const padding = 8;
        const menuWidth = targetEl.offsetWidth;
        const menuHeight = targetEl.offsetHeight;

        const downY = this.anchorY;
        const upY = this.anchorY - menuHeight;
        const rightX = this.anchorX;
        const leftX = this.anchorX - menuWidth;

        const maxX = window.innerWidth - menuWidth - padding;
        const maxY = window.innerHeight - menuHeight - padding;

        isLeft.val = rightX > maxX && leftX >= padding;
        isTop.val = downY > maxY && upY >= padding;

        menuX.val = Math.max(padding, Math.min(isLeft.val ? leftX : rightX, maxX));
        menuY.val = Math.max(padding, Math.min(isTop.val ? upY : downY, maxY));
      }
    });
    this.resizeObserver.observe(this.el);

    document.addEventListener("mousedown", this.hide, { once: true });
  }

  hide = () => {
    this.el?.remove();
    this.el = undefined;
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
  };

  showAtMouseEvent(e: MouseEvent | TouchEvent | PointerEvent) {
    this.render(e);
  }
}
