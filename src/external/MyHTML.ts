import { createElement, IconNode } from "lucide";

export {};

export interface DomElementInfo {
  /**
   * The class to be assigned. Can be a space-separated string or an array of strings.
   */
  cls?: string | string[];
  /**
   * The textContent to be assigned.
   */
  text?: string | DocumentFragment;
  /**
   * HTML attributes to be added.
   */
  attr?: {
    [key: string]: string | number | boolean | null;
  };
  /**
   * HTML title (for hover tooltip).
   */
  title?: string;
  /**
   * The parent element to be assigned to.
   */
  parent?: Node;
  value?: string;
  type?: string;
  prepend?: boolean;
  placeholder?: string;
  href?: string;
} // First, ensure that the interface for DomElementInfo is available, as you provided earlier.

declare global {
  /**
   * Extends the `Node` interface with utility methods for DOM manipulation.
   */
  interface Node {
    /**
     * Creates and appends a new HTML element of specified tag name to the current node.
     *
     * @param this - The current node acting as the parent container.
     * @param tag - The tag name of the element to create, e.g., 'div', 'span'.
     * @param o - Optional. Either a string to set as `textContent`, or a `DomElementInfo` object
     *            containing additional configuration such as classes, attributes, and more.
     * @param callback - Optional. A function invoked with the newly created element for further customization.
     * @returns The newly created and appended element of type corresponding to `tag`.
     *
     * @example
     * ```ts
     * const newDiv = parentNode.createEl("div", { cls: "my-class", text: "Hello" }, (el) => {
     *   el.addEventListener("click", () => {
     *     console.log("Clicked!");
     *   });
     * });
     * ```
     */
    createEl<K extends keyof HTMLElementTagNameMap>(
      this: Node,
      tag: K,
      o?: DomElementInfo | string,
      callback?: (el: HTMLElementTagNameMap[K]) => void
    ): HTMLElementTagNameMap[K];

    /**
     * Adds one or more classes to the element's class list.
     *
     * @param this - The target element to which classes will be added.
     * @param cls - One or more class names to add.
     * @returns The same element for chaining.
     *
     * @example
     * ```ts
     * element.addClass('active', 'highlight');
     * ```
     */
    addClass<K extends keyof HTMLElementTagNameMap>(
      this: HTMLElementTagNameMap[K],
      ...cls: string[]
    ): HTMLElementTagNameMap[K];

    /**
     * Empties all child nodes and text content from the element.
     *
     * @param this - The element to be cleared.
     * @returns The same element after clearing its content for chaining.
     *
     * @example
     * ```ts
     * myElement.empty();
     * ```
     */
    empty<K extends keyof HTMLElementTagNameMap>(this: HTMLElementTagNameMap[K]): HTMLElementTagNameMap[K];
  }
  interface HTMLElement {
    setIcon<K extends keyof HTMLElementTagNameMap>(
      this: HTMLElementTagNameMap[K],
      icon: IconNode
    ): HTMLElementTagNameMap[K];
  }

  interface String {
    /**
     * Converts a string to Title Case.
     *
     * @returns The string converted to Title Case.
     *
     * @example
     * ```ts
     * "hello world".toTitleCase(); // "Hello World"
     * ```
     */
    toTitleCase(this: String): string;
  }
}

Node.prototype.addClass = function <K extends keyof HTMLElementTagNameMap>(
  this: HTMLElementTagNameMap[K],
  ...cls: string[]
): HTMLElementTagNameMap[K] {
  this.classList.add(...cls);
  return this;
};

Node.prototype.createEl = function <K extends keyof HTMLElementTagNameMap>(
  this: Node,
  tag: K,
  o?: DomElementInfo | string,
  callback?: (el: HTMLElementTagNameMap[K]) => void
): HTMLElementTagNameMap[K] {
  // Create the element
  const el = document.createElement<K>(tag);

  // If options are provided
  if (o) {
    // If o is a string, treat it as textContent
    if (typeof o === "string") {
      el.textContent = o;
    } else {
      const options = o as DomElementInfo;

      // Assign class(es)
      if (options.cls !== undefined) {
        if (Array.isArray(options.cls)) {
          el.className = options.cls.join(" ");
        } else {
          el.className = options.cls;
        }
      }

      // Assign textContent or DocumentFragment
      if (options.text !== undefined) {
        if (typeof options.text === "string") {
          el.textContent = options.text;
        } else if (options.text instanceof DocumentFragment) {
          el.appendChild(options.text);
        }
      }

      // Set attributes
      if (options.attr !== undefined) {
        for (const [key, value] of Object.entries(options.attr)) {
          if (value === null || value === undefined || value === false) {
            // Remove attribute if value is falsey or null
            el.removeAttribute(key);
          } else if (typeof value === "boolean") {
            if (value) {
              el.setAttribute(key, "");
            } else {
              el.removeAttribute(key);
            }
          } else {
            el.setAttribute(key, String(value));
          }
        }
      }

      // Set title attribute
      if (options.title !== undefined) {
        el.setAttribute("title", options.title);
      }

      // Set value attribute
      if (options.value !== undefined) {
        (el as HTMLInputElement | HTMLTextAreaElement).value = options.value;
      }

      // Set type attribute
      if (options.type !== undefined) {
        (el as HTMLElement & { type?: string }).type = options.type;
      }

      // Set placeholder
      if (options.placeholder !== undefined) {
        (el as HTMLInputElement | HTMLTextAreaElement).placeholder = options.placeholder;
      }

      // Set href
      if (options.href !== undefined && "href" in el) {
        (el as HTMLAnchorElement).href = options.href;
      }
    }
  }

  // Execute callback if provided
  if (callback) {
    callback(el);
  }

  this.appendChild(el);

  return el;
};

Node.prototype.empty = function <K extends keyof HTMLElementTagNameMap>(
  this: HTMLElementTagNameMap[K]
): HTMLElementTagNameMap[K] {
  this.textContent = "";
  return this;
};

HTMLElement.prototype.setIcon = function <K extends keyof HTMLElementTagNameMap>(
  this: HTMLElementTagNameMap[K],
  icon: IconNode
): HTMLElementTagNameMap[K] {
  this.appendChild(createElement(icon, { "stroke-width": 1 }));
  return this;
};

String.prototype.toTitleCase = function (this: String): string {
  return this.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
};
