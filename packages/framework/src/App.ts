import van from "vanjs-core";
import "./App.css";
import { CommandPaletteV2 } from "./CommandPaletteV2.0.ts";
import { ETarget } from "./Event";
import { BrowserConsole } from "./MyBrowserConsole";
import type { PlatformBridge } from "./PlatformBridge.ts";
import "./toTitleCase.ts";
import { Workspace } from "./Workspace";
import { PanelContainerSerialized } from "./Workspace/Types.ts";

const { div } = van.tags;

export { App };

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
 * @property {CommandPaletteV2<App>} commandPalette - The application's command palette.
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
  [key: string]: unknown;
}> {
  /** Console instance for app-level logs and diagnostics. */
  console: BrowserConsole;

  /** Root content element mounted in the document body. */
  contentEl: HTMLElement;

  /** Workspace manager responsible for view registration and layout lifecycle. */
  workspace: Workspace;

  /** Platform abstraction for storage, files, and environment services. */
  readonly platformBridge: PlatformBridge;

  /** Shared command palette instance used across the app shell. */
  commandPalette: CommandPaletteV2;

  files: Files;

  /**
   * Creates an application shell and wires global listeners.
   *
   * @param doc - Document used for DOM access and title updates.
   * @param _title - Default application title.
   * @param platformBridge - Optional platform bridge implementation.
   */
  constructor(
    private doc: Document,
    private _title: string,
    platformBridge: PlatformBridge,
    layout: PanelContainerSerialized,
  ) {
    super();
    this.platformBridge = platformBridge;
    this.console = new BrowserConsole(true, `${this._title || "App"}:`);
    this.console.header("color:#f0f; font-size:40px; font-weight:bold;");
    this.contentEl = div({ class: "app-shell-element" });
    van.add(document.body, this.contentEl);
    this.files = new Files(this.platformBridge);
    this.workspace = new Workspace(this.contentEl, layout, this);

    this.commandPalette = new CommandPaletteV2(this);

    this.workspace.layoutController.registerView("command-palette", () => this.commandPalette);
    // this.commandPalette = new UnifiedCommandPalette(this);

    this.title = this._title;

    this.init();
    this.handlescrollmobile();

    // Handle page unload attempts
    window.addEventListener("beforeunload", () => this.unload());
    // Handle browser history navigation
  }

  async init() {
    await this.commandPalette.initializeSettings();
    await this.load();
  }

  /**
   * Handles mobile viewport scrolling adjustments for the app shell container.
   */
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
    await this.onload();
  };
  private unload = (): boolean => {
    const shouldUnload = this.onunload();
    return shouldUnload;
  };

  /**
   * Pushes a new history entry
   */
  historyPush() {
    history.pushState({ time: new Date() }, "", "");
  }

  /**
   * Called after workspace initialization and DOM readiness.
   */
  abstract onload(): void | Promise<void>;

  /**
   * Called before app unload.
   *
   * Return `true` to allow unload and workspace shutdown.
   */
  abstract onunload(): boolean;

  /**
   * Supplies the fallback workspace layout for invalid or absent saved layouts.
   */
  abstract getDefaultWorkspaceLayout(): PanelContainerSerialized;

  /**
   * Called when persisted workspace layout JSON cannot be parsed or validated.
   *
   * @param error - Underlying parse/validation error.
   */
  onWorkspaceLayoutInvalid(error: unknown) {
    this.console.warn("Invalid workspace config JSON. Falling back to default layout.", error);
  }

  /** Called when persisted workspace layout is explicitly rejected. */
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
}

export class Files {
  console = new BrowserConsole(true, `Files:`);

  constructor(public platformBridge: PlatformBridge) {}

  /**
   * Saves raw config content under a named key.
   *
   * @param name - Config namespace key.
   * @param content - Raw serialized config content.
   */
  async saveConfig(name: string, content: string) {
    await this.platformBridge.storage.setItem(`setting-${name}`, content);
  }

  /**
   * Loads raw config content by key.
   *
   * @param name - Config namespace key.
   * @returns Serialized config string, or `{}` when no value exists.
   */
  async loadConfig(name: string): Promise<string> {
    return (await this.platformBridge.storage.getItem(`setting-${name}`)) || "{}";
  }

  /**
   * Loads and parses a typed config object by key.
   *
   * @typeParam T - Config shape.
   * @param name - Config namespace key.
   * @returns Parsed config object or empty object cast to `T` when missing.
   *
   * @example
   * ```ts
   * type Settings = { enabled: boolean };
   * const settings = await app.loadConfigObject<Settings>("my-plugin");
   * ```
   */
  async loadConfigObject<T>(name: string): Promise<T> {
    const configStr = await this.platformBridge.storage.getItem(`setting-${name}`);
    return configStr ? JSON.parse(configStr) : ({} as T);
  }

  /**
   * Saves a typed config object under a namespaced key.
   *
   * @typeParam T - Config shape.
   * @param name - Config namespace key.
   * @param content - Config object to serialize and persist.
   */
  async saveConfigObject<T>(name: string, content: T) {
    await this.platformBridge.storage.setItem(`setting-${name}`, JSON.stringify(content));
  }

  /**
   * Reads a text file through the active platform bridge.
   *
   * @param path - File path to read.
   * @returns File contents as text.
   */
  async readTextFile(path: string): Promise<string> {
    return this.platformBridge.files.readTextFile(path);
  }

  /**
   * Writes text content through the active platform bridge.
   *
   * @param path - Destination file path.
   * @param content - Text content to write.
   */
  async writeTextFile(path: string, content: string): Promise<void> {
    await this.platformBridge.files.writeTextFile(path, content);
  }

  /**
   * Reads binary content through the active platform bridge.
   *
   * @param path - File path to read.
   * @returns File contents as bytes.
   */
  async readBinaryFile(path: string): Promise<Uint8Array> {
    return this.platformBridge.files.readBinaryFile(path);
  }

  /**
   * Writes binary content through the active platform bridge.
   *
   * @param path - Destination file path.
   * @param content - Binary data to write.
   */
  async writeBinaryFile(path: string, content: Uint8Array): Promise<void> {
    await this.platformBridge.files.writeBinaryFile(path, content);
  }

  /**
   * Reads and parses JSON from a file path.
   *
   * @typeParam T - Expected JSON object shape.
   * @param path - File path to read.
   * @returns Parsed JSON value.
   */
  async readJson<T>(path: string): Promise<T> {
    return this.platformBridge.files.readJsonFile<T>(path);
  }

  /**
   * Serializes and writes JSON to a file path.
   *
   * @param path - Destination file path.
   * @param data - JSON-serializable value to write.
   */
  async writeJson(path: string, data: unknown): Promise<void> {
    await this.platformBridge.files.writeJsonFile(path, data);
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
   * Uploads a text file and returns its raw content without JSON parsing
   * @param accept - File type filter (e.g., ".js", ".txt")
   * @param onFileContent - Callback with the raw file content
   * @param onError - Optional callback for error handling
   * @param onWarn - Optional callback for warnings
   */
  async uploadTextFile(
    accept: string,
    onFileContent: (content: string) => void,
    onError?: (error: unknown) => void,
    onWarn?: (message: string) => void,
  ): Promise<void> {
    try {
      const fileContent = await this.platformBridge.files.pickFileText(accept);
      if (fileContent === null) {
        if (onWarn) onWarn("No file selected for upload.");
        return;
      }
      onFileContent(fileContent);
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
      .catch((error: unknown) => this.console.error(`Failed to save ${filename}.`, error));
  }
}
