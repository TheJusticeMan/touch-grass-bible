import { App } from "./App";
import { ETarget } from "./Event";
import "./screen.css";

export class ScreenView<T extends App> extends ETarget {
  protected header: HTMLElement;
  content: HTMLElement;
  protected titleEl: HTMLElement;
  constructor(element: HTMLElement, protected app: T) {
    super();
    // Create the main navbar container
    this.header = element.createEl("div", { cls: "navbar" }, el => {
      this.titleEl = el.createEl("div", {
        cls: "navBarTitle",
        text: "Touch Grass Bible",
      });
      el.addEventListener("contextmenu", e => this.emit("menuclick", e), true);
      el.addEventListener("click", e => this.emit("titleclick", e));
    });

    // Create main content area
    this.content = element.createEl("div", { cls: "content" });
  }

  // Getter and setter for the title, synchronized with the app
  get title(): string {
    return this.app.title;
  }

  set title(value: string) {
    this.app.title = value;
    this.titleEl.textContent = value;
  }

  // Getter and setter for the current verse
  update(): void {
    this.content.empty();
  }
}
