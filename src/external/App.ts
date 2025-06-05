import "./App.css";
import {
  Command,
  CommandCategory,
  CommandItem,
  CommandPaletteState,
  DefaultCommandCategory,
  UnifiedCommandPalette,
} from "./CommandPalette";
import { ETarget } from "./Event";
import { Highlighter } from "./highlighter";
import { BrowserConsole } from "./MyBrowserConsole";
import { DomElementInfo } from "./MyHTML";
import { ScreenView } from "./screen";

export {
  App,
  AppState,
  BrowserConsole,
  Command,
  CommandCategory,
  CommandItem,
  CommandPaletteState,
  DefaultCommandCategory,
  DomElementInfo,
  Highlighter,
  ScreenView,
  UnifiedCommandPalette,
};

class AppState {
  constructor(public name: string = "", public time: Date = new Date()) {}

  // Creates a new AppHistory with updated properties
  update(partial: Partial<AppState>): AppState {
    return Object.assign(Object.create(this), this, partial, { time: new Date() });
  }
}

/**
 * Abstract base class representing the main application shell.
 *
 * Provides core functionality for event handling, state management,
 * command palette integration, history navigation, and data persistence.
 *
 * Subclasses must implement the `onload`, `onunload`, `commandPalette`, and `MainScreen` members.
 *
 * @template App - The concrete application type.
 *
 * @extends ETarget
 *
 * @property {BrowserConsole} console - The application's console for logging and debugging.
 * @property {HTMLElement} contentEl - The main content element for the application UI.
 * @property {AppState} state - The current application state.
 * @property {ETarget[]} target - Stack of event targets for keyboard and command events.
 * @property {UnifiedCommandPalette<App>} commandPalette - The application's command palette (abstract).
 * @property {ScreenView<App>} MainScreen - The main screen view of the application (abstract).
 *
 * @constructor
 * @param {Document} doc - The document object for DOM manipulation.
 * @param {string} _title - The default title of the application.
 *
 * @method historyPush - Pushes a new entry onto the application's history stack.
 * @method historyPop - Pops the latest entry from the application's history stack and navigates back.
 * @method saveData - Saves application data to local storage.
 * @method loadData - Loads application data from local storage.
 * @method loadJSON - Loads and parses JSON data from a given URL.
 * @method uploadFile - Prompts the user to upload a file and processes its content.
 * @method downloadFile - Triggers a download of the given data as a JSON file.
 *
 * @abstract
 * @method onload - Called when the application is loaded and ready.
 * @abstract
 * @method onunload - Called before the application is unloaded; should return true to allow unload.
 *
 * @remarks
 * - Handles keyboard events and delegates them to the current event target.
 * - Integrates with browser history and prevents accidental page unloads.
 * - Provides utility methods for data import/export and persistence.
 */
abstract class App extends ETarget {
  console: BrowserConsole;
  contentEl: HTMLElement;
  abstract commandPalette: UnifiedCommandPalette<App>;
  abstract MainScreen: ScreenView<App>;
  target: ETarget[] = [];
  /**
   * Returns the current event target for keyboard and command events.
   * Falls back to the app instance if the target stack is empty.
   */
  get ctarget(): ETarget {
    return this.target.at(-1) ?? this;
  }

  constructor(private doc: Document, private _title: string) {
    super();
    this.target.push(this); // Default to the app itself for keyboard events
    this.console = new BrowserConsole(true, `${this._title || "App"}:`);
    this.console.header("color:#f0f; font-size:40px; font-weight:bold;");
    this.contentEl = this.doc.body.createEl("div", { cls: "AppShellElement" });
    this.title = this._title;

    // Bind load to DOMContentLoaded
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", this.load);
    } else {
      this.load(); // immediate call if already loaded
    }
    document.addEventListener("keydown", e => {
      const key =
        (e.metaKey ? "Meta+" : "") + // Meta is the command key on macOS, Windows key on Windows, and Super key on Linux
        (e.ctrlKey ? "Ctrl+" : "") +
        (e.altKey ? "Alt+" : "") +
        (e.shiftKey ? "Shift+" : "") +
        e.key;
      //if (this.ctarget !== this) e.preventDefault(); // Prevent default browser actions for key combinations
      this.ctarget.emit("keydown", { key, event: e });
    });

    // Handle page unload attempts
    window.addEventListener("beforeunload", e => this.unload());
    // Handle browser history navigation
    window.addEventListener("popstate", () => this.ctarget.emit("historypop", {}));
  }

  private load = () => this.onload();
  private unload = (): boolean => this.onunload();

  /**
   * Pushes a new history entry
   */
  historyPush() {
    history.pushState({ time: new Date() }, "", "");
  }

  abstract onload(): void;

  abstract onunload(): boolean;

  /**
   * Saves the provided data object to localStorage under the key "app-data".
   *
   * @param data - An object containing key-value pairs representing application settings to be saved.
   * @returns A promise that resolves when the data has been saved.
   */
  async saveData(data: { [setting: string]: any }) {
    localStorage.setItem("app-data", JSON.stringify(data));
  }

  /**
   * Load data from local storage
   */
  async loadData(): Promise<{ [setting: string]: any }> {
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

  /**
   * Loads JSON data from a given URL
   * @param url - The URL to fetch JSON data from
   * @returns A promise that resolves to the parsed JSON data
   */
  async loadJSON<T>(url: string): Promise<T> {
    const response = await fetch(url);
    return response.json() as Promise<T>;
  }

  /**
   * Prompts the user to upload a file and processes its content
   * @param accept - The file types to accept (e.g., ".json")
   * @param onFileContent - Callback function to handle the file content
   * @param onError - Optional callback for error handling
   * @param onWarn - Optional callback for warnings
   */
  async uploadFile(
    accept: string,
    onFileContent: (content: any) => void,
    onError?: (error: any) => void,
    onWarn?: (message: string) => void
  ): Promise<void> {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;

    input.onchange = async (event: Event) => {
      const target = event.target as HTMLInputElement;
      if (target.files && target.files.length > 0) {
        const file = target.files[0];
        const reader = new FileReader();

        reader.onload = (e: ProgressEvent<FileReader>) => {
          try {
            const content = JSON.parse(e.target?.result as string);
            onFileContent(content);
          } catch (error) {
            if (onError) onError(error);
          }
        };

        reader.onerror = () => {
          if (onError) onError(reader.error);
        };

        reader.readAsText(file);
      } else {
        if (onWarn) onWarn("No file selected for upload.");
      }
    };

    input.click();
  }

  /**
   * Downloads a JSON file with the given filename and data
   * @param filename - The name of the file to download
   * @param data - The data to include in the file
   */
  downloadFile(filename: string, data: any): void {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", filename);
    document.body.appendChild(downloadAnchorNode); // Required for Firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  }
}
