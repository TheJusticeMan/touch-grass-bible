import { createPlatformBridge, type PlatformBridge } from "@platform";
import "./App.css";
import { ETarget, touchDragger } from "./Event";
import { BrowserConsole } from "./MyBrowserConsole";
import { Workspace, WorkspaceLayout } from "./Workspace";
import { UnifiedCommandPalette } from "./CommandPalette";

export { App, AppState };

class AppState {
  constructor(
    public name: string = "",
    public time: Date = new Date(),
  ) {}

  // Creates a new AppHistory with updated properties
  update(partial: Partial<AppState>): AppState {
    return Object.assign(Object.create(this), this, partial, {
      time: new Date(),
    });
  }
}

/**
 * Abstract base class representing the main application shell.
 *
 * Provides core functionality for event handling, state management,
 * command palette integration, history navigation, and data persistence.
 *
 * Subclasses must implement the `onload` and `onunload` members.
 *
 * @template App - The concrete application type.
 *
 * @extends ETarget
 *
 * @property {BrowserConsole} console - The application's console for logging and debugging.
 * @property {HTMLElement} contentEl - The main content element for the application UI.
 * @property {AppState} state - The current application state.
 * @property {ETarget[]} target - Stack of event targets for keyboard and command events.
 * @property {UnifiedCommandPalette<App>} commandPalette - The application's command palette.
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
abstract class App extends ETarget<{
  keydown: { key: string; event: KeyboardEvent };
  historypop: object;
  open: void;
  close: void;
  draggingX: { deltaX: number };
  draggingY: { deltaY: number };
  dragX: { deltaX: number };
  dragY: { deltaY: number };
  dragCancel: { deltaX: number; deltaY: number };
  dragXcancel: { deltaX: number; deltaY: number };
  dragYcancel: { deltaX: number; deltaY: number };
  [key: string]: unknown;
}> {
  console: BrowserConsole;
  contentEl: HTMLElement;
  workspace: Workspace;
  readonly platformBridge: PlatformBridge;

  commandPalette: UnifiedCommandPalette = new UnifiedCommandPalette(this);

  private target: ETarget[] = [];
  /**
   * Returns the current event target for keyboard and command events.
   * Falls back to the app instance if the target stack is empty.
   */
  get ctarget(): ETarget {
    return this.target.at(-1) ?? (this as ETarget);
  }

  pushTarget(target: ETarget): this {
    this.target.push(target);
    return this;
  }

  popTarget(): ETarget | undefined {
    return this.target.pop();
  }

  constructor(
    private doc: Document,
    private _title: string,
    platformBridge: PlatformBridge = createPlatformBridge(),
  ) {
    super();
    this.platformBridge = platformBridge;
    this.target.push(this as ETarget); // Default to the app itself for keyboard events
    this.console = new BrowserConsole(true, `${this._title || "App"}:`);
    this.console.header("color:#f0f; font-size:40px; font-weight:bold;");
    this.contentEl = this.doc.body.createEl("div", { cls: "AppShellElement" });
    this.workspace = new Workspace(this);
    new touchDragger(this.contentEl).onany((name, e) => this.ctarget.emit(name, e));

    this.title = this._title;

    if (document.readyState !== "loading") {
      // The DOM is already ready
      this.console.log("DOM already loaded, initializing app...");
      this.load();
    } else {
      // The DOM is still loading, so wait for the event
      this.console.log("Waiting for DOM to load...");
      document.addEventListener("DOMContentLoaded", this.load.bind(this));
    }
    document.addEventListener("keydown", e => {
      const key =
        (e.metaKey ? "Meta+" : "") + // Meta is the command key on macOS, Windows key on Windows, and Super key on Linux
        (e.ctrlKey ? "Ctrl+" : "") +
        (e.altKey ? "Alt+" : "") +
        (e.shiftKey ? "Shift+" : "") +
        e.key;
      //if (this.ctarget !== this) e.preventDefault(); // Prevent default browser actions for key combinations
      const { ctarget } = this;
      ctarget.emit("keydown", { key, event: e });
      ctarget.emit(`${key}KeyDown`, { key, event: e });
    });
    this.handlescrollmobile();

    // Handle page unload attempts
    window.addEventListener("beforeunload", () => this.unload());
    // Handle browser history navigation
    window.addEventListener("popstate", () => this.ctarget.emit("historypop", {}));
  }

  handlescrollmobile() {
    const visual = window.visualViewport;
    const ctr = this.contentEl;
    if (visual && ctr) {
      visual?.addEventListener(
        "scroll",
        () => {
          const viewportOffsetY = visual.offsetTop;
          ctr.style.transform = `translateY(${viewportOffsetY}px)`;
        },
        { passive: false },
      );
    }
  }

  private load = async () => {
    await this.workspace.initialize();
    await this.onload();
  };
  private unload = (): boolean => {
    const shouldUnload = this.onunload();
    if (shouldUnload) {
      this.workspace.shutdown();
    }
    return shouldUnload;
  };

  /**
   * Pushes a new history entry
   */
  historyPush() {
    history.pushState({ time: new Date() }, "", "");
  }

  abstract onload(): void | Promise<void>;

  abstract onunload(): boolean;

  /**
   * Saves the provided data object to the current platform storage under the key "app-data".
   *
   * @param data - An object containing key-value pairs representing application settings to be saved.
   * @returns A promise that resolves when the data has been saved.
   */
  async saveData(data: { [setting: string]: unknown }) {
    await this.platformBridge.storage.setItem("app-data", JSON.stringify(data));
  }

  /**
   * Load data from local storage
   */
  async loadData(): Promise<{ [setting: string]: unknown }> {
    const dataStr = await this.platformBridge.storage.getItem("app-data");
    return dataStr ? JSON.parse(dataStr) : {};
  }

  async saveConfig(name: string, content: string) {
    await this.platformBridge.storage.setItem(`setting-${name}`, content);
  }

  async loadConfig(name: string): Promise<string> {
    return (await this.platformBridge.storage.getItem(`setting-${name}`)) || "{}";
  }

  async loadConfigObject<T>(name: string): Promise<T> {
    const configStr = await this.platformBridge.storage.getItem(`setting-${name}`);
    return configStr ? JSON.parse(configStr) : ({} as T);
  }

  async saveConfigObject<T>(name: string, content: T) {
    await this.platformBridge.storage.setItem(`setting-${name}`, JSON.stringify(content));
  }

  async readTextFile(path: string): Promise<string> {
    return this.platformBridge.files.readTextFile(path);
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    await this.platformBridge.files.writeTextFile(path, content);
  }

  async readJsonFile<T>(path: string): Promise<T> {
    return this.platformBridge.files.readJsonFile<T>(path);
  }

  async writeJsonFile(path: string, data: unknown): Promise<void> {
    await this.platformBridge.files.writeJsonFile(path, data);
  }

  abstract getDefaultWorkspaceLayout(): WorkspaceLayout;

  onWorkspaceLayoutInvalid(error: unknown) {
    this.console.warn("Invalid workspace config JSON. Falling back to default layout.", error);
  }

  onWorkspaceLayoutRejected() {
    this.console.warn("Workspace layout rejected. Falling back to default layout.");
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
    return this.platformBridge.files.loadAssetJson<T>(url);
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
    onFileContent: (content: unknown) => void,
    onError?: (error: unknown) => void,
    onWarn?: (message: string) => void,
  ): Promise<void> {
    try {
      const fileContent = await this.platformBridge.files.pickFileText(accept);
      if (fileContent === null) {
        if (onWarn) onWarn("No file selected for upload.");
        return;
      }
      onFileContent(JSON.parse(fileContent));
    } catch (error) {
      if (onError) onError(error);
    }
  }

  /**
   * Downloads a JSON file with the given filename and data
   * @param filename - The name of the file to download
   * @param data - The data to include in the file
   */
  downloadFile(filename: string, data: unknown): void {
    void this.platformBridge.files
      .saveFile(filename, JSON.stringify(data, null, 2), "application/json;charset=utf-8")
      .catch(error => this.console.error(`Failed to save ${filename}.`, error));
  }
}
