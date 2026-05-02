import levenshtein from "js-levenshtein";
import { ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, X } from "lucide";
import van, { Props, PropsWithKnownKeys } from "vanjs-core";
import { App } from "./App";
import { CMD, CMDType } from "./Comands";
import "./CommandPalette.css";
import {
  COMMAND_PALETTE_CONFIG_NAME,
  DEFAULT_COMMAND_PALETTE_SETTINGS,
  type CommandPaletteSettings,
} from "./CommandPaletteSettings";
import { Commands } from "./Commands";
import { escapeRegExp } from "./escapeRegExp";
import { ETarget, touchDraggerEvents } from "./Event";
import { HighlightType } from "./highlighter";
import { BrowserConsole } from "./MyBrowserConsole";
import { PaletteState, PaletteStateController } from "./PaletteStateController";
import { SettingsStore } from "./SettingsStore";
import { icon, inputMode, Item } from "./UIComponents";
import { WorkspaceDialog } from "./Workspace";

const { div, button, input, span, br } = van.tags;

/**
 * Lazy wrapper for a command category factory.
 *
 * The loader defers category instantiation until first access and then caches
 * the created category instance for future calls.
 *
 * @typeParam T - Command item type represented by the category.
 */
export class CategoryLoader<T> {
  private _palette: CommandCategory<T> | null = null;

  /**
   * @param load - Factory callback that creates a category instance.
   * @param id - Stable category id used for registration and lookup.
   */
  constructor(
    private load: CategoryLoaderFunc<T>,
    readonly id: string,
  ) {}

  /**
   * Returns this loader's category instance, creating it on first access.
   *
   * @param commandPalette - Palette runtime used by the category factory.
   * @returns Cached command category instance.
   */
  public getPalette(commandPalette: UnifiedCommandPalette): CommandCategory<T> {
    return this._palette || (this._palette = this.load(commandPalette));
  }
}

/**
 * Factory signature used to register command categories.
 *
 * @typeParam T - Command item type represented by the returned category.
 * @param commandPalette - Palette runtime that owns the category.
 * @returns A command category instance.
 */
export type CategoryLoaderFunc<T> = (commandPalette: UnifiedCommandPalette) => CommandCategory<T>;

type UnifiedCommandPaletteEvents = {
  close: void;
  keydown: { key: string };
  historypop: CommandPaletteState;
} & touchDraggerEvents;

/**
 * Abstract base class for a unified command palette UI component.
 *
 * The `UnifiedCommandPalette` provides a flexible, extensible command palette interface
 * for applications, supporting categories, keyboard navigation, context stacks, and
 * dynamic command filtering. It manages the UI lifecycle, user input, and command execution.
 *
 * @typeParam  - The application type, extending `App`, that this palette is bound to.
 *
 * @template
 * @extends ETarget
 *
 * @remarks
 * - Supports multiple command categories and dynamic context switching.
 * - Handles keyboard and mouse/touch navigation.
 * - Maintains a stack of contexts for back navigation.
 * - Designed to be subclassed with concrete implementations.
 *
 * @property isOpen - Whether the palette is currently open.
 * @property inputMode - The current input mode for the search field.
 * @property length - The number of command items currently displayed.
 * @property topCategory - The currently active top-level command category.
 *
 * @method addPalette - Adds a command category (by constructor or instance).
 * @method addPalettereturns - Adds a command category and returns the instance.
 * @method open - Opens the command palette with an optional context.
 * @method display - Displays the palette UI for a given context.
 * @method close - Closes the palette and cleans up UI.
 *
 * @protected
 * @method render - Renders the command list based on the current state and query.
 * @method moveSelection - Moves the keyboard selection up or down.
 * @method selectIndex - Selects a command item by index.
 * @method updateSelection - Updates the UI to reflect the current selection.
 * @method activateSelected - Activates the currently selected command.
 *
 * @event open - Emitted when the palette is opened.
 * @event display - Emitted when the palette is displayed with a new state.
 * @event close - Emitted when the palette is closed.
 *
 * @example
 * const palette = new UnifiedCommandPalette(app);
 */
export class UnifiedCommandPalette extends ETarget<UnifiedCommandPaletteEvents> {
  private dialog: CommandPaletteDialog | null = null;
  private _state: CommandPaletteState = new CommandPaletteState("");
  get maxResults(): number {
    return this.dialog?.maxResults.val ?? 100;
  }
  freezeScrollOnRender: boolean = false; // Flag to control scroll freezing on render

  private categories: CategoryLoader<unknown>[] = [];
  private hiddenCategories: CategoryLoader<unknown>[] = []; // Hidden categories
  private _disabledPalettes: Set<string> = new Set();
  private stateController: PaletteStateController<CommandPaletteState>;
  private categoryOrder: string[] = [];
  private settingsInitialized = false;
  private applyingSettings = false;
  private readonly settingsStore: SettingsStore<CommandPaletteSettings>;
  commands: Commands = new Commands();
  highlighter: HighlightType[] = []; // Highlighter instance for query highlighting

  inputMode: inputMode = "search"; // Default input type

  constructor(public readonly app: App) {
    super();
    this.settingsStore = new SettingsStore<CommandPaletteSettings>({
      defaultValue: DEFAULT_COMMAND_PALETTE_SETTINGS,
      defaultSaveDelayMs: 500,
      fileManager: this.app.files,
      fileName: COMMAND_PALETTE_CONFIG_NAME,
    });
    this.stateController = new PaletteStateController<CommandPaletteState>(
      () => this.getState(),
      state => {
        this._state = state;
        this.dialog?.setState(state);
      },
    );
    this.addHiddenPalette(() => new CategoryNavigator(this), "navigator");
    this.addHiddenPalette(() => new PromptCategory(this), "prompt");
  }

  async initializeSettings(): Promise<void> {
    const settings = await this.settingsStore.load(DEFAULT_COMMAND_PALETTE_SETTINGS);
    this.applySettings(settings);
    this.settingsInitialized = true;
  }

  private applySettings(settings: CommandPaletteSettings): void {
    this.applyingSettings = true;
    this.setCategoryOrder(settings.categoryOrder);
    this.setDisabledPalettes(settings.disabledPalettes);
    this.applyingSettings = false;
  }

  private onSettingsChanged(): void {
    if (!this.settingsInitialized || this.applyingSettings) return;
    const settings: CommandPaletteSettings = {
      categoryOrder: this.getCategoryOrder(),
      disabledPalettes: this.getDisabledPalettes(),
    };
    this.settingsStore.saveAfterDelay(settings);
    if (this.isOpen) this.refresh();
  }

  get isOpen(): boolean {
    return this.dialog?.isOpen ?? false;
  }

  private getOrCreateDialog(): CommandPaletteDialog {
    if (!this.dialog) {
      this.dialog = new CommandPaletteDialog(this);
      this.dialog.setState(this._state);
    }
    return this.dialog;
  }

  onDialogOpened(): void {}

  onDialogClosed(dialog: CommandPaletteDialog): void {
    if (this.dialog === dialog) {
      this._state = dialog.getState();
      this.dialog = null;
    }
    this.emit("close", undefined);
  }

  open(): this {
    if (this.isOpen) return this;
    return this.display();
  }

  close(): this {
    if (!this.isOpen) return this;
    this.update({
      query: "",
      topCategory: "",
    });
    this.stateController.clearContexts();
    this.inputMode = "search";
    this.dialog?.destroy();
    return this;
  }

  /**
   * Opens the navigator category used as the palette's quick access menu.
   *
   * @returns The current palette instance for method chaining.
   */
  menu() {
    this.update({ topCategory: "navigator" }).open();
  }

  private saveStateHistory(): this {
    this.app.historyPush();
    return this;
  }

  /**
   * Creates palette-scoped reactive state storage.
   *
   * @typeParam T - State value type.
   * @param initialValue - Initial value for the state holder.
   * @returns A reactive state handle managed by the palette state controller.
   */
  useState<T>(initialValue: T): PaletteState<T> {
    return this.stateController.useState(initialValue);
  }

  /**
   * Shows a prompt interaction and resolves with text or `null`.
   *
   * @param text - Prompt message shown to the user.
   * @returns A promise resolving to entered text or `null` when cancelled.
   */
  prompt(text: string): Promise<string | null> {
    return this.getPromptCategory()?.prompt(text) ?? Promise.resolve(null);
  }

  /**
   * Shows a confirmation interaction.
   *
   * @param text - Confirmation prompt message.
   * @returns A promise resolving to `true` for confirm and `false` for cancel.
   */
  confirm(text: string): Promise<boolean> {
    return this.getPromptCategory()?.confirm(text) ?? Promise.resolve(false);
  }

  private getPromptCategory(): PromptCategory | undefined {
    const promptCategory = this.getCategory("prompt")?.getPalette(this);
    if (promptCategory instanceof PromptCategory) return promptCategory;
  }

  /** Number of rendered command items in the current view. */
  get length(): number {
    return this.dialog?.length ?? 0;
  }

  /**
   * Current top category loader.
   *
   * Falls back to the first visible category when no explicit top category is set.
   */
  get topCategory(): CategoryLoader<unknown> | undefined {
    const topCategory = this.getCategory(this.getState().topCategory);
    if (topCategory && !this.isCategoryDisabled(topCategory.id)) return topCategory;
    return this.palettes[0];
  }

  /** Visible command categories in registration order. */
  get palettes(): CategoryLoader<unknown>[] {
    return this.categories.filter(cat => !this._disabledPalettes.has(cat.id));
  }

  /** All registered visible categories, including disabled entries. */
  get allPalettes(): CategoryLoader<unknown>[] {
    return this.categories;
  }

  isCategoryDisabled(id: string): boolean {
    return this._disabledPalettes.has(id);
  }

  /**
   * Sets which category ids are disabled (hidden from visible palettes).
   *
   * @param ids - Category ids to disable.
   */
  setDisabledPalettes(ids: string[]): void {
    this._disabledPalettes = new Set(ids);
    this.onSettingsChanged();
  }

  disableCategory(id: string) {
    if (this._disabledPalettes.has(id)) return;
    if (!this.categories.some(category => category.id === id)) return;
    this._disabledPalettes.add(id);
    if (this.getState().topCategory === id) {
      this.freezeScrollOnRender = true; // Prevent scroll reset on next render
      this.update({ topCategory: "" });
    }
    this.freezeScrollOnRender = true; // Prevent scroll reset on next render
    this.onSettingsChanged();
  }

  enableCategory(id: string) {
    if (!this._disabledPalettes.has(id)) return;
    this._disabledPalettes.delete(id);
    this.freezeScrollOnRender = true; // Prevent scroll reset on next render
    this.onSettingsChanged();
  }

  getDisabledPalettes(): string[] {
    return [...this._disabledPalettes];
  }

  /** Currently selected command item, or `null` when no item is selected. */
  get selCMD(): CommandItem<unknown> | null {
    return this.dialog?.selCMD ?? null; // Return the currently selected command item or null if none
  }

  /**
   * Registers a visible command category.
   *
   * Categories are lazily instantiated and can be reordered using
   * `setCategoryOrder()`.
   *
   * @param load - Category factory callback.
   * @param id - Stable category id.
   * @returns The current palette instance for method chaining.
   *
   * @example
   * ```ts
   * palette.addPalette(cp => new MyCategory(cp), "my-category");
   * ```
   */
  addPalette(load: CategoryLoaderFunc<unknown>, id: string): this {
    this.categories.push(new CategoryLoader(load, id));
    this.sortCategoriesByOrder(this.categoryOrder);
    return this;
  }

  /**
   * Registers multiple visible categories in a single call.
   *
   * @param categories - Category descriptor objects with `load` and `id`.
   * @returns The current palette instance for method chaining.
   */
  addPalettes(...categories: { load: CategoryLoaderFunc<unknown>; id: string }[]): this {
    categories.forEach(category => this.addPalette(category.load, category.id));
    return this;
  }

  /**
   * Removes a visible category registration.
   *
   * @param load - Category factory callback used during registration.
   * @param id - Category id used during registration.
   */
  removePalette(load: CategoryLoaderFunc<unknown>, id: string): void {
    this.categories = this.categories.filter(cat => cat.id !== id || cat.getPalette !== load);
  }

  /**
   * Registers a hidden category.
   *
   * Hidden categories are available via id lookup but not shown in normal
   * category listings.
   *
   * @param load - Category factory callback.
   * @param id - Stable category id.
   * @returns The current palette instance for method chaining.
   */
  addHiddenPalette(load: CategoryLoaderFunc<unknown>, id: string): this {
    this.hiddenCategories.push(new CategoryLoader(load, id));
    return this;
  }

  /**
   * Registers multiple hidden categories in a single call.
   *
   * @param categories - Category descriptor objects with `load` and `id`.
   * @returns The current palette instance for method chaining.
   */
  addHiddenPalettes(...categories: { load: CategoryLoaderFunc<unknown>; id: string }[]): this {
    categories.forEach(category => this.addHiddenPalette(category.load, category.id));
    return this;
  }

  /**
   * Removes a hidden category registration.
   *
   * @param load - Category factory callback used during registration.
   * @param id - Category id used during registration.
   */
  removeHiddenPalette(load: CategoryLoaderFunc<unknown>, id: string): void {
    this.hiddenCategories = this.hiddenCategories.filter(cat => cat.id !== id || cat.getPalette !== load);
  }

  /**
   * Sorts visible categories by a preferred id order.
   *
   * Categories not found in the provided order are moved to the end.
   *
   * @param order - Ordered list of category ids.
   */
  sortCategoriesByOrder(order: string[]): void {
    this.categories.sort((a, b) => {
      const aIdx = order.indexOf(a.id);
      const bIdx = order.indexOf(b.id);
      return aIdx < 0 ? 1 : bIdx < 0 ? -1 : aIdx - bIdx;
    });
  }

  /**
   * Sets and applies category sort order for visible categories.
   *
   * @param order - Ordered list of category ids.
   */
  setCategoryOrder(order: string[]): void {
    this.categoryOrder = order;
    this.sortCategoriesByOrder(order);
    this.onSettingsChanged();
  }

  getCategoryOrder(): string[] {
    return [...this.categoryOrder];
  }

  /**
   * Opens the palette directly in a specific category.
   *
   * @param category - Category id to show as top category.
   */
  opencategory(category: string) {
    /* this.hiddenCategories.find(cat => cat.constructor === category) || this._addHiddenPalette(category); */
    this.update({ topCategory: category }).open();
  }

  /**
   * Updates palette state using a partial state object.
   *
   * @param context - Partial state updates.
   * @returns The current palette instance for method chaining.
   */
  update(context: Partial<CommandPaletteState> = {}) {
    this.stateController.update(context);
    return this;
  }

  getState(): CommandPaletteState {
    return this.dialog?.getState() ?? this._state.update({});
  }

  applyStateTransition(toState: (state: CommandPaletteState) => CommandPaletteState): CommandPaletteState {
    const nextState = toState(this.getState());
    this.stateController.update(nextState);
    return this.getState();
  }

  /**
   * Displays the palette with an optional state context.
   *
   * @param context - Partial state update applied before rendering.
   * @param shouldSaveHistory - When true, pushes app history for back navigation.
   */
  display(context: Partial<CommandPaletteState> = {}, shouldSaveHistory = true) {
    if (!this.isOpen) {
      this.stateController.clearContexts();
      this.update({ query: "" });
    }
    this.update(context);
    if (shouldSaveHistory) this.saveStateHistory();
    this.stateController.pushCurrentContext();
    this.inputMode = "search";
    const dialog = this.getOrCreateDialog();
    dialog.open();
    dialog.display();
    return this;
  }

  handleBack = () => {
    const previous = this.stateController.popPreviousContext();
    if (previous)
      this.display(previous, false); // Display previous context
    else {
      this.close(); // Close if no previous context
    }
  };

  /**
   * Sets the search input value and re-renders command results.
   *
   * @param value - New query value.
   * @param select - When true, selects the input text after updating.
   */
  setValue(value: string, select = false) {
    this.update({ query: value });

    this.dialog?.setValue(value, select);
  }

  /**
   * Re-renders palette content without rebuilding the dialog shell.
   *
   * Useful for async categories that need to update command results frequently
   * while preserving the current input element and query text.
   *
   * @param context - Optional partial state updates to apply before refresh.
   * @returns The current palette instance for method chaining.
   */
  refresh(context: Partial<CommandPaletteState> = {}): this {
    if (!this.isOpen) return this.display(context, false);
    this.triggerCategoryData();
    this.update(context);
    this.dialog?.setValue(this.getState().query);
    return this;
  }

  /**
   * Ordered categories for the current display pass.
   *
   * This respects top-category focus and sibling-category overrides.
   */
  get categoriesToShow(): CategoryLoader<unknown>[] {
    const visibleCategories = this.palettes;
    const { topCategory } = this.getState();
    const top = this.topCategory;
    const siblings = top?.getPalette(this).siblings;
    // If SiblingCategories is set (even if empty)
    if (topCategory && siblings)
      return [top, ...siblings.map(catfn => this.getCategory(catfn.id))].filter(
        (category): category is CategoryLoader<unknown> =>
          category !== undefined && !this.isCategoryDisabled(category.id),
      );
    if (topCategory && top) return [top, ...visibleCategories.filter(cat => cat !== top)];
    return visibleCategories;
  }

  /**
   * Retrieves a command category instance by its constructor from the visible or hidden categories.
   * If the category is not found, it is created and added to the hidden categories.
   *
   * @param id - The constructor function of the command category to retrieve.
   * @returns The instance of the requested command category.
   */
  getCategory(id: string): CategoryLoader<unknown> | undefined {
    if (!id) return undefined;
    return this.categories.find(cat => cat.id === id) || this.hiddenCategories.find(cat => cat.id === id);
  }

  get hiddenPalettes(): CategoryLoader<unknown>[] {
    return this.hiddenCategories;
  }

  triggerCategoryData(): void {
    const state = this.getState();
    this.palettes.forEach(cat => cat.getPalette(this).tryTrigger(state));
    this.hiddenCategories.forEach(cat => cat.getPalette(this).tryTrigger(state));
  }

  popPreviousContext(): CommandPaletteState | null {
    return this.stateController.popPreviousContext();
  }
}

class CommandPaletteDialog extends WorkspaceDialog {
  private searchInput?: HTMLInputElement;
  private _domBuilt = false;
  private displayHash = van.state(0);
  private query = van.state("");
  readonly maxResults = van.state(100);
  private topCategory = van.state("");
  private mainElScale = van.state(1);
  private touchHideKeyboardBound = false;
  private commandItems: CommandItem<unknown>[] = [];
  private selectedIndex = van.state(-1);
  private visualViewport: VisualViewport | null = null;

  private readonly handleWorkspaceKeyDown = (e: { key: string }) => {
    if (!this.isOpen) return;
    this.palette.emit("keydown", e);
    this.handleKey(e);
  };

  private readonly handleHistoryPop = () => {
    this.palette.emit("historypop", this.palette.getState());
    this.palette.handleBack();
  };

  private readonly handleDragX = (e: { deltaX: number }) => {
    this.palette.emit("dragX", e);
    this.mainElScale.val = 1;
    if (e.deltaX > 0) this.palette.display({ topCategory: "navigator" });
  };

  private readonly handleDraggingX = (e: { deltaX: number }) => {
    this.palette.emit("draggingX", e);
    if (e.deltaX > 0) this.mainElScale.val = 1 - Math.min(Math.abs(e.deltaX) / 1000, 0.1);
  };

  private readonly handleDragXCancel = () => {
    this.palette.emit("dragXcancel", { deltaX: 0, deltaY: 0 });
    this.mainElScale.val = 1;
  };

  private readonly handleTouchMove = () => this.searchInput?.blur();

  private readonly handleViewportResize = () => this.applyMobileResize();
  private expanded = van.state(true);

  constructor(private readonly palette: UnifiedCommandPalette) {
    super(
      "command-palette",
      {
        title: "",
        modal: true,
        closeOnEscape: true,
        closeOnBackdrop: true,
        showCloseButton: false,
        className: "command-palette",
        ariaLabel: "Command palette",
      },
      () => this.palette.close(),
    );
    this.dialogEl.element.querySelector(".workspace-dialog-header")?.remove();
  }

  get length(): number {
    return this.commandItems.length;
  }

  getState(): CommandPaletteState {
    return new CommandPaletteState(this.query.val, this.topCategory.val, this.expanded.val);
  }

  setState(state: CommandPaletteState): void {
    this.query.val = state.query;
    this.topCategory.val = state.topCategory;
    this.expanded.val = state.expanded;
  }

  private updateState(context: Partial<CommandPaletteState>): void {
    this.setState(this.getState().update(context));
  }

  get selCMD(): CommandItem<unknown> | null {
    return this.commandItems[this.selectedIndex.val] || null;
  }

  open(): this {
    if (this.isOpen) return this;
    this.mount(this.palette.app.workspace.ensureDialogLayer());
    this.bindWorkspaceEvents();
    this.palette.onDialogOpened();
    return this;
  }

  override destroy(): void {
    if (!this.isOpen) return;
    this.unbindWorkspaceEvents();
    this.resetContent();
    this._domBuilt = false;
    this.commandItems = [];
    this.selectedIndex.val = -1;
    this.unbindTouchHideKeyboard();
    this.unbindViewportResize();
    super.destroy();
    this.palette.onDialogClosed(this);
  }

  display(): this {
    this.displayHash.val += 1;
    this.palette.triggerCategoryData();
    if (!this.isOpen || this._domBuilt) return this;
    this._domBuilt = true;
    this.applyMobileResize();
    this.bindTouchHideKeyboard();
    this.contentEl.addClass("palette");

    this.searchInput = input({
      value: this.query,
      placeholder: () =>
        `Search ${this.topCategory.val ? this.palette.topCategory?.getPalette(this.palette).title : "all"}...`,
      type: this.palette.inputMode,
      class: "palette-search",
      oninput: (e: Event) => {
        const target = e.target as HTMLInputElement;
        this.updateState({ query: target.value });
        this.maxResults.val = 100; // Reset max results on new input to allow dynamic loading
      },
    });

    van.add(
      this.contentEl.element,
      div(
        { class: "palette-header" },
        button(
          {
            class: "icon-action",
            title: "Back to previous context",
            onclick: () => this.palette.handleBack(),
          },
          icon(ChevronLeft),
        ),
        button(
          {
            class: "icon-action",
            title: "Toggle expanded view",
            onclick: () => this.updateState({ expanded: !this.expanded.val }),
          },
          () => icon(this.expanded.val ? ChevronsDownUp : ChevronsUpDown),
        ),
        button(
          { class: "icon-action", title: "Close Palette", onclick: () => this.palette.close() },
          icon(X),
        ),
      ),
      this.searchInput,
      this.renderPaletteContainer(),
    );

    this.searchInput.focus();
    return this;
  }

  setValue(value: string, select = false): void {
    this.query.val = value;
    if (select) this.searchInput?.select();
  }

  private resetContent(): void {
    this.searchInput?.remove();
    this.searchInput = undefined;
    this.contentEl.element.empty();
  }

  private bindWorkspaceEvents(): void {
    this.palette.app.workspace.on("keydown", this.handleWorkspaceKeyDown);
    this.palette.app.workspace.on("historypop", this.handleHistoryPop);
    this.palette.app.workspace.on("dragX", this.handleDragX);
    this.palette.app.workspace.on("draggingX", this.handleDraggingX);
    this.palette.app.workspace.on("dragXcancel", this.handleDragXCancel);
  }

  private unbindWorkspaceEvents(): void {
    this.palette.app.workspace.off("keydown", this.handleWorkspaceKeyDown);
    this.palette.app.workspace.off("historypop", this.handleHistoryPop);
    this.palette.app.workspace.off("dragX", this.handleDragX);
    this.palette.app.workspace.off("draggingX", this.handleDraggingX);
    this.palette.app.workspace.off("dragXcancel", this.handleDragXCancel);
  }

  private bindTouchHideKeyboard(): void {
    if (this.touchHideKeyboardBound) return;
    this.touchHideKeyboardBound = true;
    this.dialogEl.element.addEventListener("touchmove", this.handleTouchMove, { passive: true });
  }

  private unbindTouchHideKeyboard(): void {
    if (!this.touchHideKeyboardBound) return;
    this.dialogEl.element.removeEventListener("touchmove", this.handleTouchMove);
    this.touchHideKeyboardBound = false;
  }

  private applyMobileResize(): void {
    const visual = window.visualViewport;
    if (!visual) return;
    this.visualViewport?.removeEventListener("resize", this.handleViewportResize);
    this.visualViewport = visual;
    this.dialogEl.element.style.height = `calc(${visual.height}px - 2em)`;
    visual.addEventListener("resize", this.handleViewportResize, { passive: true });
  }

  private unbindViewportResize(): void {
    this.visualViewport?.removeEventListener("resize", this.handleViewportResize);
    this.visualViewport = null;
  }

  private readonly handleScroll = () => {
    window.requestAnimationFrame(() => {
      if (this.maxResults.val < 1000) {
        const currentselection = this.selectedIndex.val;
        this.maxResults.val = 1000;
        this.selectedIndex.val = currentselection;
        this.scrollSelectedIntoView();
      }
    });
  };

  private handleKey(e: { key: string }): void {
    const key = e.key;
    switch (key) {
      case "ArrowDown":
        this.moveSelection(1);
        break;
      case "ArrowUp":
        this.moveSelection(-1);
        break;
      case "Enter":
        this.activateSelected();
        break;
      case "ArrowRight":
      case "Tab":
        this.activateContextFromCommand(this.commandItems[this.selectedIndex.val]);
        break;
      case "ArrowLeft":
      case "Shift+Tab": {
        const previous = this.palette.popPreviousContext();
        if (!previous) return;
        this.palette.display(previous, false);
        break;
      }
      case "Escape":
        this.palette.close();
        break;
    }
  }

  private activateContextFromCommand(command: CommandItem<unknown> | undefined): void {
    if (command?.contextMenuAllowed) {
      this.updateState({ query: "" });
      this.palette.display(command.toState(this.getState()));
    }
  }

  private renderPaletteContainer(): HTMLDivElement {
    return div({ class: () => (this.expanded.val ? "palette-content expanded" : "palette-content") }, () => {
      void this.displayHash.val;
      const state = this.getState();
      this.palette.highlighter = [
        // Only insert the query highlighter if state.query actually exists
        ...(state.query
          ? [
              {
                // eslint-disable-next-line security/detect-non-literal-regexp
                regEXP: new RegExp(`(${escapeRegExp(state.query)})`, "ig"),
                callback: (match: string) => span({ class: "highlighted-query" }, match),
              },
            ]
          : []),
        { regEXP: /\n/g, callback: () => br() },
      ];

      this.commandItems = [];
      this.selectedIndex.val = 0;

      return div({ style: "display: contents" }, this.renderOverview(), this.renderMain(state));
    });
  }

  private renderOverview(): HTMLDivElement {
    return div({ class: "palette-content-over" }, () => {
      const navigator = this.palette.getCategory("navigator")?.getPalette(this.palette);
      if (!navigator || window.matchMedia("(max-width: 800px)").matches) return;

      const commands = navigator.trygetCommands(this.query.val);
      this.selectedIndex.val = commands.length;
      /* if (commands.length === 0) return; */

      return div(
        { class: "category" },
        div(
          { class: "category-title", onclick: () => this.palette.display({ topCategory: "navigator" }) },
          navigator.title,
        ),
        commands
          .slice(0, this.maxResults.val - this.commandItems.length)
          .map(command => this.commandToEl(command, navigator)),
      );
    });
  }

  private renderMain(state: CommandPaletteState): HTMLDivElement {
    return div(
      {
        class: "palette-content-main",
        style: () => (this.mainElScale.val !== 1 ? `transform: scale(${this.mainElScale.val});` : ""),
        onscroll: this.handleScroll,
      },
      this.palette.categoriesToShow
        .map(cat => ({ cat: cat.getPalette(this.palette), id: cat.id }))
        .map(({ cat, id }) => {
          if (this.commandItems.length >= this.maxResults.val) return;
          const commands = cat.trygetCommands(this.query.val);
          const extras = cat.extraCMD?.trygetCommands(this.query.val) || [];

          if (commands.length === 0 && extras.length === 0 && state.topCategory !== id) return;

          return div(
            { class: "category" },
            div(
              { class: "category-title", onclick: () => this.palette.display({ topCategory: id }) },
              cat.title,
            ),
            commands
              .slice(0, this.maxResults.val - this.commandItems.length)
              .map(command => this.commandToEl(command, cat)),
            extras.slice(0, this.maxResults.val - this.commandItems.length).map(command => {
              const commandEl = this.commandToEl(command, cat.extraCMD!);
              commandEl.classList.add("extras-item");
              return commandEl;
            }),
            state.topCategory === id
              ? new Item()
                  .setTitle("No results found")
                  .setDescription(this.query.val ? "Try something else." : "Type to search...")
                  .setHidden(false).element
              : undefined,
          );
        }),
      this.commandItems.length >= this.maxResults.val
        ? new Item({ onclick: () => (this.maxResults.val = 40000) })
            .setTitle("Are you kidding me?")
            .setDescription("Seriously, you want to load more results?")
            .setHidden(false).element
        : undefined,
    );
  }

  commandToEl(command: unknown, cat: CommandCategory<unknown>) {
    if (this.commandItems.length > this.maxResults.val)
      throw new Error("Too many commands, stopping render. This should never happen.");
    const cmdindex = this.commandItems.length;
    const itemEl = new CommandItem(
      {
        onclick: () => cat.tryexecute(command, itemEl.toState),
        onmousemove: () => (this.selectedIndex.val = cmdindex),
        class: () => (this.selectedIndex.val === cmdindex ? "command-item selected" : "command-item"),
      },
      command,
      cat,
    ).onContext(() => this.activateContextFromCommand(this.commandItems[cmdindex]));

    itemEl.toState = cat.tryrender(command, itemEl);
    this.commandItems.push(itemEl);
    return itemEl.element;
  }

  private moveSelection(delta: number): void {
    const maxIndex = this.commandItems.length - 1;
    this.selectedIndex.val = Math.min(Math.max(this.selectedIndex.val + delta, 0), maxIndex);
    this.scrollSelectedIntoView();
  }

  scrollSelectedIntoView(): void {
    this.selCMD?.element.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
  }

  private activateSelected(): void {
    this.selCMD?.element.click();
  }
}

/**
 * Represents the state of a command palette, including the current query,
 * the maximum number of results to display, and the currently selected top category.
 *
 * @typeParam  - The type of the application instance.
 */
export class CommandPaletteState {
  constructor(
    public query: string = "",
    public topCategory: string = "",
    public expanded: boolean = true,
  ) {}

  /**
   * Returns an immutable-like cloned state with partial updates applied.
   *
   * @param partial - Partial state values to override.
   * @returns New state object preserving prototype behavior.
   */
  update(partial: Partial<this> = {}): this {
    return Object.assign(Object.create(this), this, partial);
  }
}

/**
 * Abstract base class representing a category of commands for a command palette.
 *
 * @template T - The type representing individual commands in the category.
 *
 * @remarks
 * - Each command category has a name, description, and title for UI representation.
 * - Provides highlighting and query matching utilities for command filtering.
 * - Supports sibling categories and an optional extra command category for default commands.
 * - Handles command lifecycle: setup, trigger, retrieval, rendering, and execution, with error handling.
 * - Offers fuzzy and Levenshtein-based search for command compatibility.
 * - Allows adding commands and settings to the default command category.
 *
 * @property {string} name - The unique name of the category.
 * @property {string} description - A description of the category, suitable for UI display.
 * @property {string} title - The title for the category, used in UI.
 * @property {T[]} commands - The list of commands in this category.
 * @property {HighlightType[]} highlighter - The highlighter instance for query highlighting.
 * @property {Function[]} [SiblingCategories] - Optional array of sibling category constructors.
 * @property {DefaultCommandCategory<>} [extraCMD] - Optional default command category for extra commands.
 * @property {string} query - The current query string for filtering commands.
 *
 * @constructor
 * @param {} app - The application instance.
 * @param {UnifiedCommandPalette<>} commandPalette - The command palette instance.
 *
 * @method setUp - Initializes the category with the current command palette state.
 * @method onTrigger - Abstract; called when the category is triggered.
 * @method getCommands - Abstract; retrieves commands matching a query.
 * @method renderCommand - Abstract; renders a command for display.
 * @method executeCommand - Abstract; executes a command.
 * @method onInit - Optional; called when the category is initialized.
 * @method tryTrigger - Safely triggers the category, handling errors.
 * @method trygetCommands - Safely retrieves commands, handling errors.
 * @method tryrender - Safely renders a command, handling errors.
 * @method tryexecute - Safely executes a command, handling errors.
 * @method getcompatible - Filters commands matching the query using provided criteria.
 * @method getcompatibleWithLevenshtein - Fuzzy-filters commands using Levenshtein distance.
 * @method addCommand - Adds a command to the default command category.
 * @method addCommands - Adds multiple commands to the default command category.
 * @method addSetting - Adds a setting callback to the default command category.
 */
export abstract class CommandCategory<T> {
  abstract readonly name: string;
  abstract readonly description: string; // Description for the category, can be used in UI
  //state: CommandCategoryState = new CommandCategoryState();
  title: string = ""; // Title for the category, can be used in UI
  protected commands: T[] = [];
  //query: string = ""; // Current query string for filtering commands
  get query(): string {
    return this.commandPalette.getState().query;
  }
  siblings?: CategoryLoader<unknown>[];
  console: BrowserConsole = new BrowserConsole(true, `${this.constructor.name}:`); // Console for logging

  // younger siblings
  private _extraCMD?: CMDCategory;

  get extraCMD(): CMDCategory | undefined {
    return this._extraCMD;
  }

  constructor(public commandPalette: UnifiedCommandPalette) {
    this.onInit?.(); // Call onInit if defined
  }

  /**
   * Trigger hook for preparing category data before render.
   *
   * @param state - Current palette state.
   */
  abstract onTrigger(state: CommandPaletteState): void;

  /**
   * Returns commands matching the supplied query.
   *
   * @param query - User query text.
   */
  abstract getCommands(query: string): T[];

  /**
   * Renders a command item and returns its state transition.
   *
   * @param command - Command being rendered.
   * @param el - UI item element for mutation.
   */
  abstract renderCommand(
    command: T,
    el: CommandItem<T>,
  ): Partial<CommandPaletteState> | ((state: CommandPaletteState) => CommandPaletteState);

  /**
   * Executes a command when selected.
   *
   * @param command - Command to execute.
   */
  abstract executeCommand(command: T): void;
  onForward?: (state: CommandPaletteState) => CommandPaletteState; // Optional function to modify state when navigating forward

  onInit?(): void; // Called when the category is initialized

  /**
   * Safe wrapper around `onTrigger()` with error logging.
   *
   * @param state - Current palette state.
   * @returns The current category instance for method chaining.
   */
  tryTrigger(state: CommandPaletteState): this {
    this.title = this.name;
    try {
      this.extraCMD?.resetCommands();
      this.onTrigger(state);
      this.extraCMD?.onTrigger(state);
    } catch (e) {
      this.console.error(`Error in ${this.constructor.name}.onTrigger`, e);
    }
    return this;
  }

  /**
   * Safe wrapper around `getCommands()` with error logging.
   *
   * @param query - User query text.
   * @returns Matching commands, or an empty array on error.
   */
  trygetCommands(query: string): T[] {
    try {
      return this.getCommands(query);
    } catch (e) {
      this.console.error(`Error in ${this.constructor.name}.getCommands`, e);
      return [];
    }
  }

  /**
   * Safe wrapper around `renderCommand()` with error logging.
   *
   * @param command - Command being rendered.
   * @param el - UI item element for mutation.
   * @returns A state transition callback.
   */
  tryrender(command: T, el: CommandItem<T>): (state: CommandPaletteState) => CommandPaletteState {
    try {
      const result = this.renderCommand(command, el);
      return typeof result === "function" ? result : state => state.update(result);
    } catch (e) {
      this.console.error(`Error in ${this.constructor.name}.renderCommand`, e);
    }
    return state => state.update({});
  }

  /**
   * Applies command state transition and safely executes command logic.
   *
   * @param command - Command to execute.
   * @param toState - State transition function from render phase.
   * @returns The current category instance for method chaining.
   */
  tryexecute(command: T, toState: (state: CommandPaletteState) => CommandPaletteState): this {
    this.commandPalette.update({ query: "" });
    this.commandPalette.applyStateTransition(toState);
    try {
      this.executeCommand(command);
    } catch (e) {
      this.console.error(`Error in ${this.constructor.name}.executeCommand`, e);
    }
    return this;
  }

  /**
   * Filters items by case-insensitive substring criteria while avoiding duplicates.
   *
   * @typeParam T - Item type.
   * @param query - Query text.
   * @param array - Candidate item list.
   * @param criteria - String selector callbacks used for matching.
   * @returns Matching items.
   */
  getcompatible<T>(query: string, array: T[], ...criteria: Array<(item: T) => string>): T[] {
    if (!query) return array;

    const lowerQuery = query.toLowerCase();
    const matchedIndices = new Set<number>();

    return criteria
      .map(cb =>
        array.filter(
          (item, index) =>
            !matchedIndices.has(index) &&
            cb(item).toLowerCase().includes(lowerQuery) &&
            (matchedIndices.add(index), true), // Add index to matched set
        ),
      )
      .flat();
  }

  /**
   * Fuzzy-filters items using Levenshtein distance while avoiding duplicates.
   *
   * @typeParam T - Item type.
   * @param query - Query text.
   * @param array - Candidate item list.
   * @param criteria - String selector callbacks used for matching.
   * @returns Matching items ordered by distance per criterion.
   */
  getcompatibleWithLevenshtein<T>(query: string, array: T[], ...criteria: ((item: T) => string)[]): T[] {
    if (!query) return array; // Return all items if no query
    const lowerQuery = query.toLowerCase();
    const matchedIndices = new Set<number>();
    const maxdiff: number = query.length * 0.3; // Maximum Levenshtein distance to consider a match
    return criteria
      .map(cb =>
        array
          .map((item, index) =>
            matchedIndices.has(index)
              ? { d: maxdiff, item, index }
              : {
                  d: levenshtein(lowerQuery, cb(item).toLowerCase()),
                  item,
                  index,
                },
          )
          .filter(item => item.d < maxdiff) // Filter items within the max distance
          .sort((a, b) => a.d - b.d) // Sort by distance
          .map(item => (matchedIndices.add(item.index), item.item)),
      )
      .flat();
  }

  /**
   * Lazy access to the default extra-command category.
   *
   * @returns The default command category instance.
   */
  get defaultCMD(): CMDCategory {
    if (!this._extraCMD) this._extraCMD = new CMDCategory(this.commandPalette);
    return this._extraCMD;
  }
}

/**
 * Represents a UI item within a command palette, encapsulating its DOM elements,
 * state, and interaction logic.
 *
 * @template T - The type of the command represented by this item.
 * @template  - The type of the application, extending `App`.
 *
 * @remarks
 * This class is responsible for rendering a command item, managing its title,
 * description, context menu visibility, and handling user interactions such as
 * clicks and mouse events. It is designed to be used within a command palette
 * component, supporting context menus and state management.
 *
 * @example
 * ```typescript
 * const item = new CommandItem(app, parentEl, command, paletteCategory)
 *   .setTitle("My command")
 *   .setDescription("Does something useful")
 *   .setContextMenuVisibility(true)
 *   .onClick(() => { /* handle click *\/ });
 * ```
 *
 * @see CommandCategory
 * @see CommandPaletteState
 */
export class CommandItem<T> extends Item {
  private allowsContextMenu: boolean = false;
  private contextCallback?: (e: Event) => void;
  toState: (state: CommandPaletteState) => CommandPaletteState;

  constructor(
    l: Props & PropsWithKnownKeys<HTMLDivElement> = {},
    public command: T,
    PaletteCat: CommandCategory<T>,
  ) {
    super(l);
    this.highlight(PaletteCat.commandPalette.highlighter);
    this.toState = state => state.update({});
  }

  /**
   * Adds a context-menu affordance icon to this command item.
   *
   * @returns The current command item instance for method chaining.
   */
  addctx() {
    this.addIconButton(btn => {
      btn
        .setIcon(ChevronRight)
        .setTooltip("Open context menu")
        .on("click", e => {
          e.stopPropagation(); // Prevent triggering the main click
          this.contextCallback?.(e); // Call context menu callback if set
        });
    });
    this.allowsContextMenu = true;
    return this;
  }

  onClick(callback: () => void) {
    this.element.addEventListener("click", callback);
  }

  onContext(callback: (e: Event) => void): this {
    this.contextCallback = callback;
    return this;
  }

  /** Whether this item currently exposes a context-menu affordance. */
  get contextMenuAllowed() {
    return this.allowsContextMenu;
  }
}

class CategoryNavigator extends CommandCategory<CategoryLoader<unknown>> {
  readonly name = "Quick access";
  readonly description = "List of all command categories";
  names!: CategoryLoader<unknown>[];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onTrigger(_state: CommandPaletteState): void {
    this.names = this.commandPalette.allPalettes;
  }
  getCommands(query: string): CategoryLoader<unknown>[] {
    return this.getcompatible(query, this.names, category => category.getPalette(this.commandPalette).name);
  }
  renderCommand(
    command: CategoryLoader<unknown>,
    Item: CommandItem<CategoryLoader<unknown>>,
  ): Partial<CommandPaletteState> {
    const disabled = this.commandPalette.isCategoryDisabled(command.id);
    Item.setTitle(command.getPalette(this.commandPalette).name)
      .setDescription(
        `${command.getPalette(this.commandPalette).description}${disabled ? " (disabled)" : ""}`,
      )
      .addToggleInput(btn =>
        btn
          .setValue(!disabled)
          .on("change", v =>
            v
              ? this.commandPalette.enableCategory(command.id)
              : this.commandPalette.disableCategory(command.id),
          ),
      );

    return { topCategory: command.id };
  }

  executeCommand(): void {
    this.commandPalette.display();
  }
}

class PromptCategory extends CommandCategory<string> {
  readonly name = "Prompt";
  readonly description = "Prompt for user input";
  private _prompt: string = "";
  siblings = [];
  cb!: (prompt: string | null) => void;
  wasopen!: boolean;
  currentTopCategory: string = "";

  constructor(UnifiedCommandPalette: UnifiedCommandPalette) {
    super(UnifiedCommandPalette);
  }

  show(cb: (prompt: string | null) => void = () => {}, text: string): void {
    this.cb = cb;
    this._prompt = text;
    this.wasopen = this.commandPalette.isOpen;
    this.currentTopCategory = this.commandPalette.getState().topCategory; // Save current top category
    this.commandPalette.display({ topCategory: "prompt" }, false);
    this.commandPalette.on("close", this.invokeCallbackOnClose);
  }

  prompt(text: string): Promise<string | null> {
    return new Promise(resolve => this.show(prompt => resolve(prompt), text));
  }

  confirm(text: string): Promise<boolean> {
    return new Promise(resolve => this.show(prompt => resolve(prompt !== null), text));
  }

  private invokeCallbackOnClose = () => {
    this.cleanup();
    this.cb(null); // Call callback with null on close
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onTrigger(_state: CommandPaletteState): void {}

  getCommands(): string[] {
    return ["Ok", "Cancel"];
  }

  renderCommand(command: string, Item: CommandItem<string>): Partial<CommandPaletteState> {
    Item.setTitle(command);
    if (command === "Ok") Item.setDescription(this._prompt);
    return { topCategory: this.currentTopCategory };
  }

  executeCommand(command: string): void {
    const query = this.commandPalette.getState().query;
    this.cleanup(); // Cleanup on cancel
    if (command === "Ok") this.cb(query);
    else if (command === "Cancel") this.cb(null);
  }

  cleanup() {
    this.commands = []; // Clear commands on cleanup
    this.commandPalette.off("close", this.invokeCallbackOnClose); // Remove event listener
    if (!this.wasopen)
      this.commandPalette.close(); // Close palette if it was not open before
    else this.commandPalette.display({ topCategory: this.currentTopCategory }, false); // Restore previous context
  }
}

export class CMDCategory extends CommandCategory<CMDType> {
  name: string = "";
  description: string = "";
  protected commands: CMDType[] = [];

  /** Clears command entries for the next trigger cycle. */
  resetCommands() {
    this.commands = [];
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onTrigger(_state: CommandPaletteState) {
    return;
  }

  /**
   * Returns matching commands by command name.
   *
   * @param query - Query text.
   */
  getCommands(query: string): CMDType[] {
    return this.getcompatible(
      query,
      this.commands,
      a => a.name,
      a => a.description,
    );
  }

  /**
   * Delegates command rendering to the command's render callback.
   *
   * @param command - Command to render.
   * @param el - UI item element for mutation.
   */
  renderCommand(
    command: CMDType,
    el: CommandItem<CMDType>,
  ): Partial<CommandPaletteState> | ((state: CommandPaletteState) => CommandPaletteState) {
    return command.render(command, el);
  }

  /**
   * Delegates command execution to the command's click callback.
   *
   * @param command - Command to execute.
   */
  executeCommand(command: CMDType): void {
    void command;
  }

  /**
   * Adds one command to this category.
   *
   * @param command - Command to add.
   * @returns This category instance for method chaining.
   */
  addCMD(
    name: string,
    description: string,
    cb: (
      cmd: CommandItem<CMDType>,
    ) => Partial<CommandPaletteState> | ((state: CommandPaletteState) => CommandPaletteState) | void,
  ): CMDCategory {
    const command = CMD(name, description, cb);
    this.commands.push(command);
    return this;
  }
}
