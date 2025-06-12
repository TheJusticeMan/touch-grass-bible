import { IconNode } from "lucide";
import { ETarget } from "./Event";

export class Component<T extends HTMLElement> extends ETarget {
  element: T;

  constructor(parent: HTMLElement, tagName: keyof HTMLElementTagNameMap) {
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
}

export class Button extends Component<HTMLButtonElement> {
  constructor(parent: HTMLElement) {
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
    this.element.setIcon(icon);
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

abstract class AbstractInput<T extends HTMLElement, V> extends Component<T> {
  constructor(parent: HTMLElement, tagName: keyof HTMLElementTagNameMap) {
    super(parent, tagName);
    this.element.addEventListener("input", e => this.emit("input", () => this.getValue));
    this.element.addEventListener("change", e => this.emit("change", () => this.getValue));
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
