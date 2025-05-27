import { App } from "./App";
import "./screen.css";

export class ScreenView<T extends App> {
  protected header: HTMLElement;
  content: HTMLElement;
  protected titleEl: HTMLElement;
  constructor(element: HTMLElement, protected app: T) {
    // Create the main navbar container
    this.header = element.createEl("div", { cls: "navbar" }, el => {
      this.titleEl = el.createEl("div", {
        cls: "navBarTitle",
        text: "Touch Grass Bible",
      });
      el.addEventListener("click", this.ontitleclick.bind(this));
    });

    // Create main content area
    this.content = element.createEl("div", { cls: "content" });
  }

  // Getter and setter for the title, synchronized with the app
  get title(): string {
    return this.app.title;
  }

  onmenuclick(callback: (e: MouseEvent) => void): this {
    this.header.addEventListener("contextmenu", callback, true);
    return this;
  }

  set title(value: string) {
    this.app.title = value;
    this.titleEl.textContent = value;
  }

  // Getter and setter for the current verse
  update(): void {
    this.content.empty();
  }

  ontitleclick(callback: (e: MouseEvent) => void): this {
    this.header.addEventListener("click", callback);
    return this;
  }
}
