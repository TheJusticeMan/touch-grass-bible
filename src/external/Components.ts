import { CheckSquare, createElement, IconNode, Square } from "lucide";
import { Highlighter, HighlightType } from "./highlighter";
import "./Components.css";
import { ETarget } from "./Event";

type UIComponentInit = {
  detached?: boolean;
  prepend?: boolean;
};

type DomAttrValue = string | number | boolean | null | undefined;
type DomAttrRecord = Record<string, DomAttrValue>;

type ManagedDomListener = {
  target: EventTarget;
  type: string;
  listener: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions;
};

/**
 * Represents a generic UI component that wraps an HTMLElement and provides utility methods
 * for DOM manipulation and event handling.
 *
 * @template T - The type of HTMLElement this component wraps.
 * @extends UIComponent
 *
 * @example
 * ```typescript
 * const parent = document.body;
 * const myDiv = new Component<HTMLDivElement>(parent, "div")
 *   .addClass("my-class")
 *   .scrollIntoViewSS();
 * ```
 *
 * @param parent - The parent HTMLElement to which the new element will be appended.
 * @param tagName - The tag name of the element to create (e.g., "div", "span").
 *
 * @property element - The underlying HTMLElement instance.
 *
 * @method addClass - Adds one or more CSS classes to the element.
 * @method scrollIntoViewSS - Smoothly scrolls the element into view at the start of the viewport.
 * @method remove - Removes the element from the DOM.
 */
export class UIComponent<
  T extends keyof HTMLElementTagNameMap,
  EventS extends Record<string, unknown> = {
    input: string;
    change: string;
    click: Event;
    menu: Event;
    keydown: Event;
    [key: string]: unknown;
  },
> extends ETarget<EventS> {
  element: HTMLElementTagNameMap[T];
  private managedDomListeners: ManagedDomListener[] = [];
  private disposed = false;

  constructor(parent: Node | null, tagName: T, init: UIComponentInit = {}) {
    super();
    this.element = document.createElement(tagName);
    if (!init.detached && parent) {
      this.mount(parent, init.prepend);
    }
  }

  static detached<K extends keyof HTMLElementTagNameMap>(tagName: K): UIComponent<K> {
    return new UIComponent<K>(null, tagName, { detached: true });
  }

  setIcon(icon: IconNode) {
    this.element.empty(); // Clear existing content
    this.element.appendChild(createElement(icon, { "stroke-width": 1 }));
    return this;
  }

  createChild<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    options?: Parameters<HTMLElement["createEl"]>[1],
    callback?: (el: HTMLElementTagNameMap[K]) => void,
  ): HTMLElementTagNameMap[K] {
    return this.element.createEl(tagName, options, callback);
  }

  createChildComponent<K extends keyof HTMLElementTagNameMap, C extends UIComponent<K>>(
    ComponentCtor: new (parent: Node) => C,
    callback?: (component: C) => void,
  ): C {
    const component = new ComponentCtor(this.element);
    callback?.(component);
    return component;
  }

  clearChildren() {
    this.element.empty();
    return this;
  }

  mount(parent: Node, prepend = false) {
    if (prepend && "prepend" in parent) {
      (parent as ParentNode).prepend(this.element);
    } else {
      parent.appendChild(this.element);
    }
    return this;
  }

  detach() {
    this.element.remove();
    return this;
  }

  listen<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (ev: HTMLElementEventMap[K]) => void,
    options?: boolean | AddEventListenerOptions,
  ) {
    return this.listenOn(this.element, type, listener, options);
  }

  listenOn<E extends Event>(
    target: EventTarget,
    type: string,
    listener: (ev: E) => void,
    options?: boolean | AddEventListenerOptions,
  ) {
    target.addEventListener(type, listener as EventListener, options);
    this.managedDomListeners.push({
      target,
      type,
      listener: listener as EventListener,
      options,
    });
    return this;
  }

  unlistenAll() {
    this.managedDomListeners.forEach(({ target, type, listener, options }) => {
      target.removeEventListener(type, listener, options);
    });
    this.managedDomListeners = [];
    return this;
  }

  setText(text: string | DocumentFragment) {
    if (typeof text === "string") {
      this.element.textContent = text;
    } else {
      this.element.replaceChildren(text);
    }
    return this;
  }

  setAttr(name: string, value: DomAttrValue) {
    if (value === null || value === undefined || value === false) {
      this.element.removeAttribute(name);
      return this;
    }
    if (value === true) {
      this.element.setAttribute(name, "");
      return this;
    }
    this.element.setAttribute(name, String(value));
    return this;
  }

  setAttrs(attrs: DomAttrRecord) {
    Object.entries(attrs).forEach(([name, value]) => this.setAttr(name, value));
    return this;
  }

  setAria(attrs: DomAttrRecord) {
    Object.entries(attrs).forEach(([name, value]) => this.setAttr(`aria-${name}`, value));
    return this;
  }

  setData(attrs: DomAttrRecord) {
    Object.entries(attrs).forEach(([name, value]) => this.setAttr(`data-${name}`, value));
    return this;
  }

  setStyle(styles: Record<string, string | number | null | undefined>) {
    Object.entries(styles).forEach(([name, value]) => {
      if (value === null || value === undefined) {
        this.element.style.removeProperty(name);
      } else {
        this.element.style.setProperty(name, String(value));
      }
    });
    return this;
  }

  toggleClass(className: string, force?: boolean) {
    if (typeof force === "boolean") {
      this.element.classList.toggle(className, force);
      return this;
    }
    this.element.classList.toggle(className);
    return this;
  }

  setHidden(hidden: boolean) {
    this.element.hidden = hidden;
    return this;
  }

  setRole(role: string) {
    this.element.setAttribute("role", role);
    return this;
  }

  setId(id: string) {
    this.element.id = id;
    return this;
  }

  setTooltip(tooltip: string) {
    this.element.title = tooltip;
    this.setAria({ label: tooltip });
    return this;
  }

  addClass(...cls: string[]) {
    this.element.classList.add(...cls);
    return this;
  }

  scrollIntoViewSS() {
    this.element.scrollIntoView({ behavior: "smooth", block: "start" });
    return this;
  }

  destroy() {
    return this.remove();
  }

  remove() {
    if (this.disposed) return this;
    this.disposed = true;
    this.unlistenAll();
    this.clear();
    this.element.remove();
    return this;
  }
}

export class StackComponent extends UIComponent<"div"> {
  constructor(parent: Node, axis: "row" | "column" = "column") {
    super(parent, "div");
    this.addClass("ui-stack");
    this.setAxis(axis);
  }

  setAxis(axis: "row" | "column") {
    this.toggleClass("is-row", axis === "row");
    this.toggleClass("is-column", axis === "column");
    return this;
  }

  setGap(gap: string | number) {
    this.setStyle({
      "--ui-gap": typeof gap === "number" ? `${gap}px` : gap,
    });
    return this;
  }

  setAlign(align: "start" | "center" | "end" | "stretch") {
    const map = {
      start: "flex-start",
      center: "center",
      end: "flex-end",
      stretch: "stretch",
    };
    this.setStyle({ "align-items": map[align] });
    return this;
  }

  setJustify(justify: "start" | "center" | "end" | "between" | "around" | "evenly") {
    const map = {
      start: "flex-start",
      center: "center",
      end: "flex-end",
      between: "space-between",
      around: "space-around",
      evenly: "space-evenly",
    };
    this.setStyle({ "justify-content": map[justify] });
    return this;
  }
}

export class RowComponent extends StackComponent {
  constructor(parent: Node) {
    super(parent, "row");
    this.addClass("ui-row");
    this.setGap("0.5rem");
  }
}

export class SurfaceComponent extends UIComponent<"div"> {
  constructor(parent: Node) {
    super(parent, "div");
    this.addClass("ui-surface");
  }

  setTone(tone: "default" | "subtle" | "strong") {
    this.toggleClass("tone-default", tone === "default");
    this.toggleClass("tone-subtle", tone === "subtle");
    this.toggleClass("tone-strong", tone === "strong");
    return this;
  }
}

/**
 * Represents a customizable button component that extends the base `Component` class for HTMLButtonElement.
 *
 * Provides methods to set the button's text, icon, disabled state, and tooltip.
 * Emits a `"click"` event when the button is clicked, with event propagation stopped.
 *
 * @example
 * ```typescript
 * const button = new Button(parentElement)
 *   .setButtonText("Submit")
 *   .setIcon(myIcon)
 *   .setDisabled(false)
 *   .setTooltip("Click to submit");
 * ```
 */
export class Button extends UIComponent<"button"> {
  constructor(parent: Node) {
    super(parent, "button");
    this.listen("click", e => {
      e.stopPropagation();
      return this.emit("click", e);
    });
    this.listen("contextmenu", e => {
      e.preventDefault();
      return this.emit("menu", e);
    });
  }

  setButtonText(text: string) {
    this.element.textContent = text;
    return this;
  }

  setDisabled(disabled: boolean) {
    this.element.disabled = disabled;
    return this;
  }
}

export class IconActionComponent extends Button {
  constructor(parent: Node) {
    super(parent);
    this.addClass("icon-action");
    this.setAttr("type", "button");
  }

  setAction(icon: IconNode, tooltip: string) {
    this.setIcon(icon);
    this.setTooltip(tooltip);
    return this;
  }

  setPressed(pressed: boolean) {
    this.setAria({ pressed });
    this.toggleClass("is-pressed", pressed);
    return this;
  }
}

export class IconButton extends UIComponent<"div"> {
  constructor(parent: Node) {
    super(parent, "div");
    this.element.classList.add("icon-button");
    this.listen("click", e => {
      e.stopPropagation();
      return this.emit("click", e);
    });
  }

  setDisabled(disabled: boolean) {
    this.element.classList.toggle("disabled", disabled);
    return this;
  }
}

/**
 * An abstract base class for input components, extending the `Component` class.
 *
 * @typeParam T - The type of the underlying HTML element, constrained to `HTMLElement`.
 * @typeParam V - The type of the value managed by the input component.
 *
 * This class sets up standard "input" and "change" event listeners on the element,
 * emitting corresponding events with the current value. Subclasses must implement
 * `setValue` and `getValue` to handle value management.
 *
 * @example
 * class TextInput extends AbstractInput<HTMLInputElement, string> {
 *   // Implement setValue and getValue
 * }
 */
abstract class AbstractInput<T extends keyof HTMLElementTagNameMap, V> extends UIComponent<
  T,
  {
    input: V;
    change: V;
    click: Event;
    menu: Event;
    keydown: Event;
    [key: string]: unknown;
  }
> {
  constructor(parent: Node, tagName: T) {
    super(parent, tagName);
    this.listen("input", () => this.emit("input", this.getValue()));
    this.listen("change", () => this.emit("change", this.getValue()));
    this.listen("click", e => this.emit("click", e));
    this.listen("contextmenu", e => {
      e.preventDefault();
      return this.emit("menu", e);
    });
    this.listen("keydown", e => this.emit("keydown", e));
    this.element.focus();
  }

  abstract setValue(value: V): this;
  abstract getValue(): V;

  setPlaceholder(placeholder: string) {
    (this.element as HTMLInputElement | HTMLTextAreaElement).placeholder = placeholder;
    return this;
  }

  focus() {
    this.element.focus();
    return this;
  }
}

export class TextArea extends AbstractInput<"textarea", string> {
  constructor(parent: Node) {
    super(parent, "textarea");
  }

  setValue(value: string) {
    this.element.value = value;
    return this;
  }

  getValue(): string {
    return this.element.value;
  }
}

export type inputMode = "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url";

/**
 * Represents a text input component that extends the `AbstractInput` class for HTML input elements.
 *
 * @remarks
 * This class provides methods to set and get the value of the input, as well as to configure its type and input mode.
 *
 * @example
 * ```typescript
 * const input = new TextInput(parentElement)
 *   .setType('text')
 *   .setValue('Hello');
 * const value = input.getValue();
 * ```
 *
 * @extends AbstractInput<HTMLInputElement, string>
 */
export class TextInput extends AbstractInput<"input", string> {
  constructor(parent: Node) {
    super(parent, "input");
  }

  setValue(value: string) {
    this.element.value = value;
    return this;
  }

  getValue(): string {
    return this.element.value;
  }

  setType(type: string, inputMode?: inputMode) {
    this.element.type = type;
    if (inputMode) this.element.inputMode = inputMode;
    return this;
  }
}

export class toggleInput extends AbstractInput<"button", boolean> {
  value: boolean = false;
  constructor(parent: Node) {
    super(parent, "button");
    this.element.classList.add("icon-button");
  }
  setValue(value: boolean) {
    this.value = value;
    this.update(value);
    return this;
  }
  getValue(): boolean {
    return this.value;
  }
  update(value: boolean) {
    this.element.empty();
    this.setIcon(value ? CheckSquare : Square);
    return this;
  }
}

/**
 * Represents a draggable scroll bubble UI component that can be attached to a parent HTMLElement.
 *
 * The `ScrollBubble` provides a visual indicator and controller for scrolling within a container.
 * It emits custom events for grab, move, release, scroll, and scrollend actions, and manages its own
 * visibility with an auto-hide timer.
 *
 * @extends ETarget
 *
 * @example
 * ```typescript
 * const bubble = new ScrollBubble(containerElement);
 * bubble.maxScroll = 1000;
 * bubble._show();
 * bubble.on("scroll", (value) => {
 *   // Handle scroll value change
 * });
 * ```
 *
 * @event grab - Fired when the bubble is grabbed (mousedown/touchstart).
 * @event move - Fired when the bubble is moved (mousemove/touchmove).
 * @event release - Fired when the bubble is released (mouseup/touchend).
 * @event scroll - Fired when the scroll value changes.
 * @event scrollend - Fired when the scroll interaction ends.
 *
 * @property {HTMLElement | null} element - The DOM element representing the scroll bubble.
 * @property {number} maxScroll - The maximum scroll value for normalization.
 * @property {boolean} isGrabbed - Whether the bubble is currently being dragged.
 * @property {number} scrollvalue - The normalized scroll position (0 to 1).
 * @property {number} scroll - The absolute scroll value (0 to maxScroll).
 * @property {string} offsetTop - The computed top offset for the bubble in pixels.
 *
 * @method _show() - Displays the scroll bubble and sets up event listeners.
 * @method _hide() - Hides and removes the scroll bubble from the DOM.
 * @method destroy() - Cleans up the scroll bubble and removes all listeners.
 * @method setUpListeners() - Sets up internal event listeners for drag and scroll actions.
 * @method startHideTimer(delay?: number) - Starts or resets the auto-hide timer.
 */
export abstract class ScrollBubble extends UIComponent<
  "div",
  {
    scroll: number;
    scrollend: number;
    hide: void;
    [key: string]: unknown;
  }
> {
  private _scrollvalue: number = 0; // Current scroll position between 0 and 1
  maxScroll: number = 0; // Maximum scroll value
  isGrabbed: boolean = false;
  saveTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private managedParentPosition = false;

  private updateBubblePosition = () => {
    this.element.style.top = this.offsetTop;
  };

  constructor(public parent: HTMLElement) {
    super(null, "div", { detached: true });
    this.addClass("scroll-bubble");
  }

  abstract show(arg: unknown): this; // Abstract method to show the bubble, must be implemented by subclasses

  _show() {
    this.startHideTimer(); // Start the hide timer
    if (this.element.isConnected) return this; // If already shown, do nothing
    if (window.getComputedStyle(this.parent).position === "static") {
      this.parent.style.position = "relative";
      this.managedParentPosition = true;
    }

    this.mount(this.parent);
    this.element.style.top = this.offsetTop;
    this.setUpListeners();
    return this;
  }

  grab = (e: MouseEvent | TouchEvent) => {
    this.startHideTimer(); // Start the hide timer
    this.element.classList.add("active");
    //this.emit("scroll", this.scrollvalue);
    this.scrollvalue = this.getscrollvalue(e);
    this.isGrabbed = true;
  };

  move = (e: MouseEvent | TouchEvent) => {
    if (!this.isGrabbed) return; // Ignore moves if not grabbed
    this.startHideTimer(); // Start the hide timer
    this.scrollvalue = this.getscrollvalue(e);
    this.emit("scroll", this.scrollvalue);
  };

  release = () => {
    if (!this.isGrabbed) return; // Ignore releases if not grabbed
    this.startHideTimer(); // Start the hide timer
    this.element.classList.remove("active");
    this.emit("scrollend", this.scrollvalue);
    this.isGrabbed = false;
  };

  getscrollvalue(e: MouseEvent | TouchEvent): number {
    const rect = this.parent.getBoundingClientRect();
    const y = e instanceof MouseEvent ? e.clientY : e.touches[0].clientY;
    return (Math.max(rect.top, Math.min(rect.bottom, y)) - rect.top) / Math.max(1, rect.height);
  }

  setUpListeners() {
    this.element.removeEventListener("mousedown", this.grab);
    this.element.removeEventListener("touchstart", this.grab);
    document.removeEventListener("mousemove", this.move);
    document.removeEventListener("touchmove", this.move);
    document.removeEventListener("mouseup", this.release);
    document.removeEventListener("touchend", this.release);
    this.parent.removeEventListener("scroll", this.updateBubblePosition);
    window.removeEventListener("resize", this.updateBubblePosition);

    this.element.addEventListener("mousedown", this.grab);
    this.element.addEventListener("touchstart", this.grab);
    document.addEventListener("mousemove", this.move);
    document.addEventListener("touchmove", this.move);
    document.addEventListener("mouseup", this.release);
    document.addEventListener("touchend", this.release);
    this.parent.addEventListener("scroll", this.updateBubblePosition, {
      passive: true,
    });
    window.addEventListener("resize", this.updateBubblePosition);
  }

  removeListeners() {
    this.element.removeEventListener("mousedown", this.grab);
    this.element.removeEventListener("touchstart", this.grab);
    document.removeEventListener("mousemove", this.move);
    document.removeEventListener("touchmove", this.move);
    document.removeEventListener("mouseup", this.release);
    document.removeEventListener("touchend", this.release);
    this.parent.removeEventListener("scroll", this.updateBubblePosition);
    window.removeEventListener("resize", this.updateBubblePosition);
  }

  startHideTimer(delay: number = 3000) {
    // Clear the previous timeout if it exists
    if (this.saveTimeoutId !== null) {
      clearTimeout(this.saveTimeoutId);
      this.saveTimeoutId = null; // Reset the timeout ID
    }

    // Set a new timeout
    this.saveTimeoutId = setTimeout(() => {
      this._hide(); // Call hide after the delay
      this.saveTimeoutId = null; // Reset after execution
    }, delay);
  }

  _hide() {
    this.removeListeners();
    this.emit("hide");
    this.detach();
    if (this.managedParentPosition) {
      this.parent.style.removeProperty("position");
      this.managedParentPosition = false;
    }
    return this;
  }

  destroy() {
    this._hide();
    this.clear(); // Remove all event listeners
    if (this.saveTimeoutId) {
      clearTimeout(this.saveTimeoutId);
      this.saveTimeoutId = null; // Reset the timeout ID
    }
    this._scrollvalue = 0; // Reset scroll value
    this.isGrabbed = false; // Reset grab state
    this.maxScroll = 0; // Reset max scroll
    if (this.managedParentPosition) {
      this.parent.style.removeProperty("position");
      this.managedParentPosition = false;
    }
    return this;
  }

  public get scrollvalue(): number {
    return this._scrollvalue;
  }

  public set scrollvalue(value: number) {
    this._scrollvalue = Math.max(0, Math.min(1, value)); // Clamp value between 0 and 1
    this.element.style.top = this.offsetTop;
  }

  public get scroll(): number {
    return this._scrollvalue * this.maxScroll;
  }

  public set scroll(value: number) {
    this._scrollvalue = value / this.maxScroll; // Normalize to 0-1 range
    if (!this.isGrabbed) this.element.style.top = this.offsetTop; // Update position if not grabbed
  }

  get offsetTop(): string {
    return `${this._scrollvalue * (this.parent.clientHeight - (this.element?.offsetHeight || 0)) + this.parent.scrollTop}px`;
  }
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
export class Item extends UIComponent<
  "div",
  {
    click: MouseEvent;
    contextmenu: MouseEvent;
    hover: MouseEvent;
    mousemove: MouseEvent;
    [key: string]: unknown;
  }
> {
  get el(): HTMLDivElement {
    return this.element;
  }
  protected infoEl!: HTMLDivElement;
  protected titleEl!: HTMLDivElement;
  protected descriptionEl!: HTMLDivElement;
  protected componentWrapper!: HTMLDivElement;
  components: UIComponent<keyof HTMLElementTagNameMap>[] = []; // Array to hold additional components like buttons
  private highlighter: Highlighter; // Highlighter for the category
  get hili() {
    return this.highlighter.highlight.bind(this.highlighter);
  }

  constructor(parent: HTMLElement) {
    super(parent, "div");
    this.highlighter = new Highlighter([]);
    this.addClass("command-item");
    this.infoEl = this.createChild("div", { cls: "command-item-info" }, infoEl => {
      this.titleEl = infoEl.createEl("div", { cls: "command-title" });
      this.descriptionEl = infoEl.createEl("div", {
        cls: ["command-description", "hidden"],
      });
    });
    this.componentWrapper = this.createChild("div", { cls: "command-comp" });
    this.listen("click", e => this.emit("click", e));
    this.listen("contextmenu", e => {
      e.preventDefault();
      this.emit("contextmenu", e);
    });
    this.listen("mouseenter", e => this.emit("hover", e));
    this.listen("mousemove", e => this.emit("mousemove", e));
  }

  highlight(args: HighlightType[] | Highlighter) {
    if (args instanceof Highlighter) {
      this.highlighter = args;
      return this;
    }
    this.highlighter = new Highlighter({ ...args });
    return this;
  }

  addIconButton(cb: (el: IconButton) => void) {
    this.addComponent(IconButton, cb);
    const lastComp = this.components.at(-1);
    if (lastComp) this.componentWrapper.prepend(lastComp.element);
    return this;
  }

  addButton(cb: (el: Button) => void) {
    this.addComponent(Button, cb);
    return this;
  }

  addTextInput(cb: (el: TextInput) => void) {
    this.addComponent(TextInput, cb);
    return this;
  }

  addTextArea(cb: (el: TextArea) => void) {
    this.addComponent(TextArea, cb);
    return this;
  }

  addComponent<T extends UIComponent<keyof HTMLElementTagNameMap>>(
    ComponentCtor: new (parent: Node) => T,
    cb?: (el: T) => void,
  ) {
    const compInstance = new ComponentCtor(this.componentWrapper);
    this.components.push(compInstance);
    cb?.(compInstance);
    return this;
  }

  removeComponents() {
    this.components.forEach(comp => comp.remove());
    this.components = [];
    return this;
  }

  setTitle(title: string | DocumentFragment) {
    this.titleEl.replaceChildren(typeof title === "string" ? this.hili(title) : title);
    return this;
  }

  setName = this.setTitle;

  setDescription(text: string | DocumentFragment) {
    this.descriptionEl.replaceChildren(typeof text === "string" ? this.hili(text) : text);
    return this;
  }

  setHidden(hide: boolean) {
    this.descriptionEl.classList.toggle("hidden", hide);
    return this;
  }
}

/**
 * Represents a single item within a context menu.
 */
export class MenuItem extends ETarget<{
  click: MouseEvent;
}> {
  private title: string = "";
  private icon: IconNode | null = null;

  /**
   * Sets the title (main label) of the menu item.
   * @param title - The display text for the item.
   * @returns `this` for chaining.
   */
  setTitle(title: string): this {
    this.title = title;
    return this;
  }

  /**
   * Sets the icon for the menu item.
   * @param icon - The icon node (from lucide, or your icon system).
   * @returns `this` for chaining.
   */
  setIcon(icon: IconNode): this {
    this.icon = icon;
    return this;
  }

  /**
   * Registers a click handler for the menu item.
   * All handlers are called when the item is clicked.
   * @param cb - The function to call on click.
   * @returns `this` for chaining.
   */
  onClick(cb: (e: MouseEvent) => void): this {
    this.on("click", cb);
    return this;
  }

  /**
   * Renders this menu item as a child of the given parent node using `createEl`.
   * @param parent - The parent Node to attach the item to.
   * @returns The created menu item element.
   */
  render(parent: Node) {
    parent.createEl("div", { cls: "menu-item" }, (itemEl: HTMLDivElement) => {
      if (this.icon) itemEl.appendChild(createElement(this.icon, { "stroke-width": 1 }));
      itemEl.createEl("span", { cls: "menu-title", text: this.title });

      itemEl.addEventListener("click", e => {
        e.stopPropagation(); // Prevent event bubbling
        this.emit("click", e); // Emit click event
      });
    });
    return this;
  }
}

/**
 * Represents a context menu that appears at a given position and holds MenuItems.
 *
 * Example:
 * ```typescript
 * const menu = new Menu();
 * menu.setPosition(200, 180)
 *   .addItem(item => item.setTitle("Copy").onClick(() => alert("Copy!")))
 *   .addItem(item => item.setTitle("Move").onClick(() => alert("Move!")));
 * menu.show();
 * ```
 */
export class Menu extends ETarget {
  private items: MenuItem[] = [];
  private position: { x: number; y: number } = { x: 0, y: 0 };
  private menuEl: HTMLDivElement | null = null;
  private _onClickAway: ((e: MouseEvent) => void) | null = null;

  /**
   * Adds a menu item using a builder callback.
   * @param cb - Callback to configure the MenuItem.
   * @returns `this` for chaining.
   */
  addItem(cb: (item: MenuItem) => void): this {
    const item = new MenuItem();
    cb(item);
    this.items.push(item);
    return this;
  }

  /**
   * Sets the screen position for the menu (top left corner).
   * @param x - X coordinate in pixels.
   * @param y - Y coordinate in pixels.
   * @returns `this` for chaining.
   */
  setPosition(x: number, y: number): this {
    this.position = { x, y };
    return this;
  }

  showAtMouseEvent(e: MouseEvent): this {
    this.setPosition(e.clientX, e.clientY);
    return this.show();
  }

  /**
   * Renders and displays the menu at the set position.
   * Emits the "show" event with the MenuItems.
   * @returns `this` for chaining.
   */
  show(): this {
    this.hide();
    if (this.items.length === 0) return this;

    document.body.createEl("div", { cls: "context-menu" }, (menuEl: HTMLDivElement) => {
      menuEl.style.left = `${this.position.x}px`;
      menuEl.style.top = `${this.position.y}px`;
      this.items.forEach(item => item.render(menuEl).on("click", () => this.hide()));
      this.menuEl = menuEl;
    });

    this.emit("show", this.items);

    this._onClickAway = () => this.hide();
    setTimeout(() => document.addEventListener("mousedown", this._onClickAway!), 0);

    return this;
  }

  /**
   * Hides and removes the menu from the DOM. Cleans up listeners.
   */
  hide(): this {
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
    if (this._onClickAway) {
      document.removeEventListener("mousedown", this._onClickAway);
      this._onClickAway = null;
    }
    return this;
  }

  /**
   * Removes all menu items.
   * @returns `this` for chaining.
   */
  clear(): this {
    this.items = [];
    return this;
  }
}
