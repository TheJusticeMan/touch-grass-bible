import { createElement, IconNode } from "lucide";
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
export class Component<T extends HTMLElement> extends ETarget {
  element: T;

  constructor(parent: Node, tagName: keyof HTMLElementTagNameMap) {
    super();
    this.element = parent.createEl(tagName) as T;
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
export class Button extends Component<HTMLButtonElement> {
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
abstract class AbstractInput<T extends HTMLElement, V> extends Component<T> {
  constructor(parent: HTMLElement, tagName: keyof HTMLElementTagNameMap) {
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

export class TextArea extends AbstractInput<HTMLTextAreaElement, string> {
  constructor(parent: HTMLElement) {
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
export class TextInput extends AbstractInput<HTMLInputElement, string> {
  constructor(parent: HTMLElement) {
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
export class scrollBubble extends ETarget {
  element: HTMLElement | null = null; // The scroll bubble element
  private _scrollvalue: number = 0; // Current scroll position between 0 and 1
  maxScroll: number = 0; // Maximum scroll value
  isGrabbed: boolean = false;
  saveTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(public parent: HTMLElement) {
    super();
  }

  _show() {
    this.startHideTimer(); // Start the hide timer
    if (this.element) return this; // If already shown, do nothing
    document.body.createEl("div", { cls: "scrollBubble" }, el => {
      this.element = el;
      this.element.style.top = `${this.scrollvalue * 100}vh`;
      el.addEventListener("mousedown", e => this.emit("grab", e));
      el.addEventListener("touchstart", e => this.emit("grab", e));
      document.addEventListener("mousemove", e => this.emit("move", e));
      document.addEventListener("touchmove", e => this.emit("move", e));
      document.addEventListener("mouseup", e => this.emit("release", e));
      document.addEventListener("touchend", e => this.emit("release", e));
    });
    this.setUpListeners();
    return this;
  }

  setUpListeners() {
    this.clear("grab").clear("move").clear("release");
    this.on("grab", (e: MouseEvent | TouchEvent) => {
      this.startHideTimer(); // Start the hide timer
      this.element?.classList.add("active");
      //this.emit("scroll", this.scrollvalue);
      this.scrollvalue =
        (e instanceof MouseEvent ? e.clientY : e.touches[0].clientY) / this.parent.offsetHeight;
      this.isGrabbed = true;
    });

    this.on("move", (e: MouseEvent | TouchEvent) => {
      if (!this.isGrabbed) return; // Ignore moves if not grabbed
      this.startHideTimer(); // Start the hide timer
      this.emit("scroll", this.scrollvalue);
      this.scrollvalue =
        (e instanceof MouseEvent ? e.clientY : e.touches[0].clientY) / this.parent.offsetHeight;
    });

    this.on("release", (e: MouseEvent | TouchEvent) => {
      if (!this.isGrabbed) return; // Ignore releases if not grabbed
      this.startHideTimer(); // Start the hide timer
      this.element?.classList.remove("active");
      this.emit("scrollend", this.scrollvalue);
      this.isGrabbed = false;
    });
  }

  startHideTimer(delay: number = 2000) {
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
    return `${this._scrollvalue * this.parent.offsetHeight}px`;
  }
}
