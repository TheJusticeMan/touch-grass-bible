import "./App.css";
import { CommandPalette, CommandPaletteCategory, CommandPaletteItem } from "./CommandPalette";
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

export interface AppHistory {
  name: string;
  time: Date;
  data: any;
}

abstract class App {
  console: BrowserConsole;
  contentEl: HTMLElement;
  private historyStack: AppHistory[] = [];

  constructor(private doc: Document, private _title: string) {
    this.console = new BrowserConsole(true, `${this._title || "App"}:`);
    this.contentEl = this.doc.body.createEl("div", { cls: "AppShellElement" });
    this.title = this._title;

    // Bind load to DOMContentLoaded
    document.addEventListener("DOMContentLoaded", () => this.onload());

    // Handle page unload attempts
    window.addEventListener("beforeunload", e => {
      if (!this.exit()) {
        e.preventDefault();
        e.returnValue = ""; // Modern browsers require this for prompt
      }
    });

    // Handle browser history navigation
    window.addEventListener("popstate", this.handlePopState.bind(this));
  }

  /**
   * Handles page exit logic
   */
  private exit(): boolean {
    return this.unload();
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
  historyPush(entry: Partial<AppHistory>) {
    const historyEntry: AppHistory = {
      name: entry.name ?? "",
      time: new Date(),
      data: entry.data ?? null,
    };
    this.historyStack.push(historyEntry);
    history.pushState(historyEntry, "", "");
  }

  /**
   * Pops the latest history entry and navigates back
   */
  historyPop() {
    this.historyStack.pop();
    if (this.historyStack.length === 0) {
      this.exit();
      return;
    }
    this.onHistoryPop(this.historyStack[this.historyStack.length - 1]);
  }

  /**
   * Handles the browser's back/forward navigation
   */
  private handlePopState() {
    this.historyPop();
  }

  async onload() {
    // Override to initialize app components
  }

  /**
   * Called when navigating back in history
   */
  abstract onHistoryPop(entry: AppHistory): void;

  abstract onunload?(): boolean;

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
