import { createElement, IconNode } from "lucide";
import { Highlighter, HighlightType } from "./highlighter";
import "./Components.css";
import { ETarget } from "./Event";

/**
 * Represents a generic UI component that wraps an HTMLElement and provides utility methods
 * for DOM manipulation and event handling.
 *
 * @template T - The type of HTMLElement this component wraps.
 * @extends ETarget
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
export class Component<
  T extends keyof HTMLElementTagNameMap,
  EventS extends Record<string, any> = {
    click: MouseEvent;
    input: string;
    change: string;
    [key: string]: any;
  }
> extends ETarget<EventS> {
  element: HTMLElementTagNameMap[T];

  constructor(parent: Node, tagName: T) {
    super();
    this.element = parent.createEl(tagName);
  }

  addClass(...cls: string[]) {
    this.element.classList.add(...cls);
    return this;
  }

  scrollIntoViewSS() {
    this.element.scrollIntoView({ behavior: "smooth", block: "start" });
    return this;
  }

  remove() {
    this.element.remove();
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
export class Button extends Component<"button"> {
  constructor(parent: Node) {
    super(parent, "button");
    this.element.addEventListener("click", e => {
      e.stopPropagation();
      return this.emit("click", e);
    });
  }

  setButtonText(text: string) {
    this.element.textContent = text;
    return this;
  }

  setIcon(icon: IconNode) {
    this.element.empty(); // Clear existing content
    this.element.appendChild(createElement(icon, { "stroke-width": 1 }));
    return this;
  }

  setDisabled(disabled: boolean) {
    this.element.disabled = disabled;
    return this;
  }

  setTooltip(tooltip: string) {
    this.element.title = tooltip;
    return this;
  }
}

class IconButton extends Component<"div"> {
  constructor(parent: Node) {
    super(parent, "div");
    this.element.classList.add("icon-button");
    this.element.addEventListener("click", e => {
      e.stopPropagation();
      return this.emit("click", e);
    });
  }

  setIcon(icon: IconNode) {
    this.element.empty(); // Clear existing content
    this.element.appendChild(createElement(icon, { "stroke-width": 1 }));
    return this;
  }

  setTooltip(tooltip: string) {
    this.element.title = tooltip;
    return this;
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
abstract class AbstractInput<T extends keyof HTMLElementTagNameMap, V> extends Component<
  T,
  {
    input: V;
    change: V;
    click: MouseEvent;
    [key: string]: any;
  }
> {
  constructor(parent: Node, tagName: T) {
    super(parent, tagName);
    this.element.addEventListener("input", e => this.emit("input", this.getValue()));
    this.element.addEventListener("change", e => this.emit("change", this.getValue()));
  }

  abstract setValue(value: V): this;
  abstract getValue(): V;

  setPlaceholder(placeholder: string) {
    (this.element as any).placeholder = placeholder;
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

/**
 * Represents a draggable scroll bubble UI component that can be attached to a parent HTMLElement.
 *
 * The `scrollBubble` provides a visual indicator and controller for scrolling within a container.
 * It emits custom events for grab, move, release, scroll, and scrollend actions, and manages its own
 * visibility with an auto-hide timer.
 *
 * @extends ETarget
 *
 * @example
 * ```typescript
 * const bubble = new scrollBubble(containerElement);
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
export abstract class scrollBubble extends ETarget<{
  scroll: number; // Fired when the scroll value changes, passing the new scroll value
  scrollend: number; // Fired when scrolling ends, passing the final scroll value
}> {
  element: HTMLElement | null = null; // The scroll bubble element
  private _scrollvalue: number = 0; // Current scroll position between 0 and 1
  maxScroll: number = 0; // Maximum scroll value
  isGrabbed: boolean = false;
  saveTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(public parent: HTMLElement) {
    super();
  }

  abstract show(arg: any): this; // Abstract method to show the bubble, must be implemented by subclasses

  _show() {
    this.startHideTimer(); // Start the hide timer
    if (this.element) return this; // If already shown, do nothing
    document.body.createEl("div", { cls: "scrollBubble" }, el => {
      this.element = el;
      this.element.style.top = `${this.scrollvalue * 100}vh`;
    });
    this.setUpListeners();
    return this;
  }

  grab = (e: MouseEvent | TouchEvent) => {
    this.startHideTimer(); // Start the hide timer
    this.element?.classList.add("active");
    //this.emit("scroll", this.scrollvalue);
    this.scrollvalue =
      (e instanceof MouseEvent ? e.clientY : e.touches[0].clientY) / this.parent.offsetHeight;
    this.isGrabbed = true;
  };

  move = (e: MouseEvent | TouchEvent) => {
    if (!this.isGrabbed) return; // Ignore moves if not grabbed
    this.startHideTimer(); // Start the hide timer
    this.emit("scroll", this.scrollvalue);
    this.scrollvalue =
      (e instanceof MouseEvent ? e.clientY : e.touches[0].clientY) / this.parent.offsetHeight;
  };

  release = (e: MouseEvent | TouchEvent) => {
    if (!this.isGrabbed) return; // Ignore releases if not grabbed
    this.startHideTimer(); // Start the hide timer
    this.element?.classList.remove("active");
    this.emit("scrollend", this.scrollvalue);
    this.isGrabbed = false;
  };

  setUpListeners() {
    this.element?.removeEventListener("mousedown", this.grab);
    this.element?.removeEventListener("touchstart", this.grab);
    document.removeEventListener("mousemove", this.move);
    document.removeEventListener("touchmove", this.move);
    document.removeEventListener("mouseup", this.release);
    document.removeEventListener("touchend", this.release);

    this.element?.addEventListener("mousedown", this.grab);
    this.element?.addEventListener("touchstart", this.grab);
    document.addEventListener("mousemove", this.move);
    document.addEventListener("touchmove", this.move);
    document.addEventListener("mouseup", this.release);
    document.addEventListener("touchend", this.release);
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
    this.element?.remove();
    this.element = null; // Clear the element reference
    //this.clear();
    return this;
  }

  destroy() {
    this.element?.remove();
    this.clear(); // Remove all event listeners
    if (this.saveTimeoutId) {
      clearTimeout(this.saveTimeoutId);
      this.saveTimeoutId = null; // Reset the timeout ID
    }
    this._scrollvalue = 0; // Reset scroll value
    this.isGrabbed = false; // Reset grab state
    this.maxScroll = 0; // Reset max scroll
    return this;
  }

  public get scrollvalue(): number {
    return this._scrollvalue;
  }
  public set scrollvalue(value: number) {
    this._scrollvalue = Math.max(0, Math.min(1, value)); // Clamp value between 0 and 1
    if (this.element) this.element.style.top = this.offsetTop; // Update position if element exists
  }
  public get scroll(): number {
    return this._scrollvalue * this.maxScroll;
  }
  public set scroll(value: number) {
    this._scrollvalue = value / this.maxScroll; // Normalize to 0-1 range
    if (this.element && !this.isGrabbed) this.element.style.top = this.offsetTop; // Update position if not grabbed
  }
  get offsetTop(): string {
    return `${
      this._scrollvalue * this.parent.offsetHeight + (window.innerHeight - this.parent.offsetHeight)
    }px`;
  }
}

/**
 * Represents a UI item within a command palette, encapsulating its DOM elements,
 * state, and interaction logic.
 *
 * @template T - The type of the command represented by this item.
 * @template AppType - The type of the application, extending `App`.
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
export class Item extends ETarget<{
  click: MouseEvent;
  contextmenu: MouseEvent;
  hover: MouseEvent;
  [key: string]: any;
}> {
  el: HTMLElement;
  protected infoEl: HTMLDivElement;
  protected titleEl: HTMLDivElement;
  protected descriptionEl: HTMLDivElement;
  protected componentWrapper: HTMLDivElement;
  components: Component<any>[] = []; // Array to hold additional components like buttons
  private highlighter: Highlighter; // Highlighter for the category
  get hili() {
    return this.highlighter.highlight.bind(this.highlighter);
  }

  constructor(parent: HTMLElement) {
    super();
    this.highlighter = new Highlighter([]);
    parent.createEl("div", { cls: "command-item" }, itemEl => {
      this.el = itemEl;
      this.infoEl = itemEl.createEl("div", { cls: "command-item-info" }, infoEl => {
        this.titleEl = infoEl.createEl("div", { cls: "command-title" });
        this.descriptionEl = infoEl.createEl("div", { cls: ["command-description", "hidden"] });
      });
      this.componentWrapper = itemEl.createEl("div", { cls: "command-comp" });
    });
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
    this.componentWrapper.prepend(this.components.at(-1)?.element);
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

  private addComponent<T extends Component<any>>(
    ComponentCtor: new (parent: Node) => T,
    cb?: (el: T) => void
  ) {
    const compInstance = new ComponentCtor(this.componentWrapper);
    this.components.push(compInstance);
    cb?.(compInstance);
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
export class MenuItem extends ETarget {
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
  onClick(cb: (e: MouseEvent) => any): this {
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
  addItem(cb: (item: MenuItem) => any): this {
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
      this.items.forEach(item => item.render(menuEl).on("click", e => this.hide()));
      this.menuEl = menuEl;
    });

    this.emit("show", this.items);

    this._onClickAway = (e: MouseEvent) => this.hide();
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
