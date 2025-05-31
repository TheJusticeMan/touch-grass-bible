import "./App.css";
import { CommandPalette, CommandPaletteCategory, CommandPaletteItem } from "./CommandPalette";
import { ETarget } from "./Event";
import { Highlighter } from "./highlighter";
import { BrowserConsole } from "./MyBrowserConsole";
import { DomElementInfo } from "./MyHTML";
import { ScreenView } from "./screen";

export {
  App,
  BrowserConsole,
  DomElementInfo,
  Highlighter,
  CommandPalette,
  CommandPaletteCategory,
  CommandPaletteItem,
  ScreenView,
};

export class AppState {
  constructor(public name: string = "", public time: Date = new Date()) {}

  // Creates a new AppHistory with updated properties
  update(partial: Partial<AppState>): AppState {
    return Object.assign(Object.create(this), this, partial, { time: new Date() });
  }
}
/**
 * Abstract base class representing a browser-based application shell.
 *
 * Provides core functionality for managing application lifecycle, history navigation,
 * command palette integration, and persistent storage. Subclasses should implement
 * abstract methods to define specific app behavior.
 *
 * @template App - The concrete application type extending this class.
 *
 * @remarks
 * - Handles DOMContentLoaded and beforeunload events for app initialization and exit.
 * - Manages a custom history stack synchronized with the browser's history API.
 * - Integrates with a command palette system for extensible command categories.
 * - Provides utility methods for saving/loading data to localStorage and fetching JSON.
 *
 * @example
 * ```typescript
 * class MyApp extends App {
 *   commandPalette = new MyCommandPalette();
 *   onHistoryPop(entry: AppHistory) { ... }
 *   onunload() { ... }
 * }
 * ```
 */
abstract class App extends ETarget {
  console: BrowserConsole;
  contentEl: HTMLElement;
  private historyStack: AppState[] = [];
  state: AppState = new AppState();
  abstract commandPalette: CommandPalette<App>;

  constructor(private doc: Document, private _title: string) {
    super();
    this.console = new BrowserConsole(true, `${this._title || "App"}:`);
    this.console.header("color:#f0f; font-size:40px; font-weight:bold;");
    this.contentEl = this.doc.body.createEl("div", { cls: "AppShellElement" });
    this.title = this._title;

    // Bind load to DOMContentLoaded
    document.addEventListener("DOMContentLoaded", () => this.onload());

    // Handle page unload attempts
    window.addEventListener("beforeunload", e => {
      if (!this.onunload()) {
        e.preventDefault();
        e.returnValue = ""; // Modern browsers require this for prompt
      }
    });
    // Handle browser history navigation
    window.addEventListener("popstate", this.handlePopState.bind(this));
  }

  getPaletteByName(name: string): CommandPaletteCategory<any, this> | null {
    const category = this.commandPalette.palettes.find(
      cat => cat.constructor.name === name
    ) as CommandPaletteCategory<any, this>;
    if (!category) {
      this.console.error(`Category "${name}" not found`);
      return null;
    }
    return category;
  }

  /**
   * Loads or initializes app state
   */
  private load() {
    this.onload();
  }

  /**
   * Unload logic, overridable
   */
  private unload(): boolean {
    return this.onunload?.() || true; // Default to true if onunload is not defined
  }

  /**
   * Pushes a new history entry
   */
  historyPush(entry: Partial<AppState>) {
    const historyEntry: AppState = this.state.update({
      ...entry,
      time: new Date(),
    });
    this.historyStack.push(historyEntry);
    history.pushState(historyEntry, "", "");
  }

  /**
   * Pops the latest history entry and navigates back
   */
  historyPop() {
    this.historyStack.pop();
    if (this.historyStack.length === 0) {
      this.unload();
      return;
    }
    this.emit("historypop", this.historyStack[this.historyStack.length - 1]);
  }

  /**
   * Handles the browser's back/forward navigation
   */
  private handlePopState() {
    this.historyPop();
  }

  abstract onload(): void;

  abstract onunload(): boolean;

  /**
   * Save data to local storage
   */
  async saveData(data: any) {
    localStorage.setItem("app-data", JSON.stringify(data));
  }

  /**
   * Load data from local storage
   */
  async loadData(): Promise<any> {
    const dataStr = localStorage.getItem("app-data");
    return Promise.resolve(dataStr ? JSON.parse(dataStr) : {});
  }

  /**
   * Getter for app title
   * @returns The current title of the app
   */
  get title(): string {
    return this.doc.title;
  }

  /**
   * Setter for app title
   * empty string will reset to default title
   * @param value - The new title for the app
   */
  set title(value: string) {
    this.doc.title = value || this._title;
  }

  async loadJSON(url: string): Promise<any> {
    try {
      console.log(`${url} loaded`);
      return await (await fetch(url)).json();
    } catch (error) {
      console.error(`Failed to load ${url}:`, error);
      return Promise.reject(error);
    }
  }
}
