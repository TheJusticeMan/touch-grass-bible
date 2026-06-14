import levenshtein from "js-levenshtein";
import { ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, X } from "lucide";
import van, { Props, PropsWithKnownKeys, type State } from "vanjs-core";
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
import { touchDragger } from "./Event";
import { HighlightRule } from "./highlighter";
import { renderIcon } from "./Icons";
import { BrowserConsole } from "./MyBrowserConsole";
import { SettingsStore } from "./SettingsStore";
import { Item, toggle } from "./UIComponents";
import { View, viewStateController } from "./Workspace";

const { div, button, input, span, br } = van.tags;

const COMMAND_PALETTE_VIEW_ID = "command-palette";

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
   * @param dialog - Palette runtime used by the category factory.
   * @returns Cached command category instance.
   */
  public getPalette(dialog: CommandPaletteDialog): CommandCategory<T> {
    return this._palette || (this._palette = this.load(dialog));
  }
}

/**
 * Factory signature used to register command categories.
 *
 * @typeParam T - Command item type represented by the returned category.
 * @param dialog - Palette runtime that owns the category.
 * @returns A command category instance.
 */
export type CategoryLoaderFunc<T> = (dialog: CommandPaletteDialog) => CommandCategory<T>;

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
export class UnifiedCommandPalette {
  dialog: CommandPaletteDialog = new CommandPaletteDialog(this);

  state = new viewStateController({});
  get maxResults(): number {
    return this.dialog?.state.maxResults.val ?? 100;
  }
  freezeScrollOnRender: boolean = false; // Flag to control scroll freezing on render

  private categories: CategoryLoader<unknown>[] = [];
  hiddenCategories: CategoryLoader<unknown>[] = []; // Hidden categories
  private _disabledPalettes: Set<string> = new Set();
  private categoryOrder: string[] = [];
  private settingsInitialized = false;
  private applyingSettings = false;
  private readonly settingsStore: SettingsStore<CommandPaletteSettings>;
  commands: Commands = new Commands();
  highlighter: HighlightRule[] = []; // Highlighter instance for query highlighting

  constructor(public readonly app: App) {
    this.settingsStore = new SettingsStore<CommandPaletteSettings>({
      defaultValue: DEFAULT_COMMAND_PALETTE_SETTINGS,
      defaultSaveDelayMs: 500,
      fileManager: this.app.files,
      fileName: COMMAND_PALETTE_CONFIG_NAME,
    });
    this.state = new viewStateController<CommandPaletteViewState>({
      query: "",
      topCategory: "",
      expanded: true,
      maxResults: 100,
    });
    this.app.workspace.layoutController.registerView(COMMAND_PALETTE_VIEW_ID, () => this.dialog);
    this.addHiddenPalette(() => new CategoryNavigator(this.dialog!), "navigator");
    this.addHiddenPalette(() => new PromptCategory(this.dialog!), "prompt");
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
    return this.dialog.isCreated;
  }

  open(): this {
    if (this.isOpen) return this;
    return this.display();
  }

  close(): this {
    if (!this.isOpen) return this;
    const dialog = this.dialog;
    this.state.clearStateHistory();
    if (dialog) {
      this.app.workspace.layoutController.removeViewInstance(dialog);
    }
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
   * Creates palette-scoped native Van state storage.
   *
   * @typeParam T - State value type.
   * @param initialValue - Initial value for the state holder.
   * @returns A native `van.state` atom managed by the Van state controller.
   */
  useVanState<T>(initialValue: T): State<T> {
    return this.state.useState(initialValue);
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
    const promptCategory = this.getCategory("prompt")?.getPalette(this.dialog!);
    if (promptCategory instanceof PromptCategory) return promptCategory;
  }

  /** Number of rendered command items in the current view. */
  get length(): number {
    return this.dialog?.length ?? 0;
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
    if (this.dialog?.state.topCategory.val === id) {
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
  update(context: Partial<CommandPaletteViewState> = {}) {
    this.dialog?.updateViewState(context);
    return this;
  }

  /**
   * Displays the palette with an optional state context.
   *
   * @param context - Partial state update applied before rendering.
   * @param shouldSaveHistory - When true, pushes app history for back navigation.
   */
  display(context: Partial<CommandPaletteViewState> = {}, shouldSaveHistory = true) {
    if (!this.isOpen) {
      this.state.clearStateHistory();
      this.update({ query: "" });
    }
    this.update(context);
    if (shouldSaveHistory) this.saveStateHistory();
    this.state.saveState();
    this.dialog?.updateViewState(context);
    if (!this.isOpen) {
      this.app.workspace.layoutController.addFloatingView(COMMAND_PALETTE_VIEW_ID);
    }
    this.dialog?.requestRender(true);
    return this;
  }

  handleBack = () => {
    const previous = this.state.undo();
    if (previous) {
      this.dialog?.undo();
      this.display({}, false); // Display previous context
    } else {
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
  refresh(context: Partial<CommandPaletteViewState> = {}): this {
    if (!this.isOpen) return this.display(context, false);
    this.update(context);
    this.dialog?.requestRender(true);
    return this;
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
}

export type CommandPaletteViewState = {
  query: string;
  topCategory: string;
  expanded: boolean;
  maxResults: number;
};

export class CommandPaletteDialog extends View<CommandPaletteViewState> {
  readonly viewTypeId = COMMAND_PALETTE_VIEW_ID;
  private displayHash = van.state(0);
  private mainElScale = van.state(1);
  private touchHideKeyboardBound = false;
  private commandItems: CommandItem<unknown>[] = [];
  private selectedIndex = van.state(-1);
  private visualViewport: VisualViewport | null = null;
  private isFocusedSearchInput = true;

  get searchInput(): HTMLInputElement | undefined {
    return (this.el?.querySelector(".palette-search") as HTMLInputElement) ?? undefined;
  }

  private readonly handleWindowPopState = () => {
    // this.palette.emit("historypop", this.palette.getState());
    this.palette.handleBack();
  };

  private readonly handleTouchMove = () => (this.searchInput?.blur(), (this.isFocusedSearchInput = false));

  private readonly handleViewportResize = () => this.applyMobileResize();

  constructor(public readonly palette: UnifiedCommandPalette) {
    super("", { query: "", topCategory: "", expanded: true, maxResults: 100 });
  }

  get length(): number {
    return this.commandItems.length;
  }

  focus(): void {
    if (!this.isFocusedSearchInput) return;
    console.log("Focusing search input");
    this.searchInput?.focus();
  }

  get selCMD(): CommandItem<unknown> | null {
    return this.commandItems[this.selectedIndex.val] || null;
  }

  get topCategory(): CategoryLoader<unknown> | undefined {
    const topCategory = this.palette.getCategory(this.state.topCategory.val);
    if (topCategory && !this.palette.isCategoryDisabled(topCategory.id)) return topCategory;
    return undefined;
  }

  triggerCategoryData(state: CommandPaletteViewState): void {
    this.palette.palettes.forEach(cat => cat.getPalette(this).tryTrigger(state));
    this.palette.hiddenCategories.forEach(cat => cat.getPalette(this).tryTrigger(state));
  }

  /**
   * Ordered categories for the current display pass.
   *
   * This respects top-category focus and sibling-category overrides.
   */
  get categoriesToShow(): CategoryLoader<unknown>[] {
    const visibleCategories = this.palette.palettes;
    const { topCategory } = this.getState();
    const top = this.topCategory;
    const siblings = top?.getPalette(this).siblings;
    // If SiblingCategories is set (even if empty)
    if (topCategory && siblings)
      return [top, ...siblings.map(catfn => this.palette.getCategory(catfn.id))].filter(
        (category): category is CategoryLoader<unknown> =>
          category !== undefined && !this.palette.isCategoryDisabled(category.id),
      );
    if (topCategory && top) return [top, ...visibleCategories.filter(cat => cat !== top)];
    return visibleCategories;
  }

  create(): HTMLElement {
    return div(
      {
        class: "palette",
        ...touchDragger({
          ondragx: ({ deltaX }) => {
            if (deltaX > 0) this.palette.menu();
          },
          stylesetter: ({ deltaX, isX }) =>
            isX
              ? `transform: scale(${1 - Math.min(Math.max(deltaX.val, 0) / 1000, this.state.topCategory.val === "navigator" ? 0 : 0.1)});`
              : "",
        }),
      },
      div(
        {
          class: "palette-header",
        },
        button(
          {
            class: "icon-action",
            title: "Back to previous context",
            onclick: () => this.palette.handleBack(),
          },
          renderIcon(ChevronLeft),
        ),
        button(
          {
            class: "icon-action",
            title: "Toggle expanded view",
            onclick: () => this.updateViewState({ expanded: !this.state.expanded.val }),
          },
          () => renderIcon(this.state.expanded.val ? ChevronsDownUp : ChevronsUpDown),
        ),
        button(
          { class: "icon-action", title: "Close Palette", onclick: () => this.palette.close() },
          renderIcon(X),
        ),
      ),
      input({
        value: this.state.query,
        placeholder: () =>
          `Search ${this.state.topCategory.val ? this.topCategory?.getPalette(this).title : "all"}...`,
        type: "search",
        class: "palette-search",
        oninput: (e: Event) => {
          this.updateViewState({ query: (e.target as HTMLInputElement).value, maxResults: 100 });
        },
        onfocus: () => (this.isFocusedSearchInput = true),
      }),
      this.renderPaletteContainer(),
    );
  }

  onMount(): void {
    this.isFocusedSearchInput = true;
    window.addEventListener("popstate", this.handleWindowPopState);
    this.applyMobileResize();
    this.bindTouchHideKeyboard();
    this.requestRender(true);
  }

  onUnmount(): void {
    window.removeEventListener("popstate", this.handleWindowPopState);
    this.commandItems = [];
    this.selectedIndex.val = -1;
    this.unbindTouchHideKeyboard();
    this.unbindViewportResize();
  }

  requestRender(defer = false): void {
    if (!defer) {
      this.triggerCategoryData(this.getState());
      this.displayHash.val += 1;
      return;
    }

    // Two RAFs ensure we repaint after floating-view enter animation starts.
    window.requestAnimationFrame(() => {
      this.triggerCategoryData(this.getState());
      this.displayHash.val += 1;
      window.requestAnimationFrame(() => {
        this.triggerCategoryData(this.getState());
        this.displayHash.val += 1;
      });
    });
  }

  setValue(value: string, select = false): void {
    this.updateViewState({ query: value });
    if (select) this.searchInput?.select();
  }

  private bindTouchHideKeyboard(): void {
    if (this.touchHideKeyboardBound) return;
    if (!this.el) return;
    this.touchHideKeyboardBound = true;
    this.el.addEventListener("touchmove", this.handleTouchMove, { passive: true });
  }

  private unbindTouchHideKeyboard(): void {
    if (!this.touchHideKeyboardBound) return;
    this.el?.removeEventListener("touchmove", this.handleTouchMove);
    this.touchHideKeyboardBound = false;
  }

  private applyMobileResize(): void {
    const visual = window.visualViewport;
    if (!visual) return;
    this.visualViewport?.removeEventListener("resize", this.handleViewportResize);
    this.visualViewport = visual;
    if (this.el) {
      this.el.style.height = `calc(${visual.height}px - 2em)`;
    }
    visual.addEventListener("resize", this.handleViewportResize, { passive: true });
  }

  private unbindViewportResize(): void {
    this.visualViewport?.removeEventListener("resize", this.handleViewportResize);
    this.visualViewport = null;
  }

  private readonly handleScroll = () => {
    window.requestAnimationFrame(() => {
      if (this.state.maxResults.val < 1000) {
        const currentselection = this.selectedIndex.val;
        this.state.maxResults.val = 1000;
        this.selectedIndex.val = currentselection;
        this.scrollSelectedIntoView();
      }
    });
  };

  handleKeyDown(event: KeyboardEvent, meaning: string): void {
    if (
      ["ArrowDown", "ArrowUp", "Enter", "ArrowRight", "ArrowLeft", "Tab", "Shift+Tab", "Escape"].includes(
        meaning,
      )
    ) {
      event.preventDefault();
    }
    this.handleKey({ key: meaning });
  }

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
        this.undo();
        this.palette.state.undo();
        this.palette.display({}, false);
        break;
      }
      case "Escape":
        this.palette.close();
        break;
    }
  }

  private activateContextFromCommand(command: CommandItem<unknown> | undefined): void {
    if (command?.contextMenuAllowed) {
      this.updateViewState({ query: "", ...command.toState() });
      this.saveState();
      this.palette.display(command.toState());
    }
  }

  private renderPaletteContainer(): HTMLDivElement {
    return div(
      { class: () => (this.state.expanded.val ? "palette-content expanded" : "palette-content") },
      () => {
        void this.displayHash.val;
        this.palette.highlighter = [
          // Only insert the query highlighter if state.query actually exists
          ...(this.state.query.val
            ? [
                {
                  // eslint-disable-next-line security/detect-non-literal-regexp
                  regEXP: new RegExp(`(${escapeRegExp(this.state.query.val)})`, "ig"),
                  callback: (match: string) => span({ class: "highlighted-query" }, match),
                },
              ]
            : []),
          { regEXP: /\n/g, callback: () => br() },
        ];

        this.commandItems = [];
        this.selectedIndex.val = 0;

        return div({ class: "palette-content-inner" }, this.renderOverview(), this.renderMain());
      },
    );
  }

  private renderOverview(): HTMLDivElement {
    return div({ class: "palette-content-over" }, () => {
      const navigator = this.palette.getCategory("navigator")?.getPalette(this);
      if (!navigator || window.matchMedia("(max-width: 700px)").matches) return;

      navigator.dialog = this; // Ensure navigator has dialog reference for command rendering
      const commands = navigator.trygetCommands(this.state.query.val);
      this.selectedIndex.val = commands.length;
      /* if (commands.length === 0) return; */

      return div(
        { class: "category" },
        div(
          { class: "category-title", onclick: () => this.palette.display({ topCategory: "navigator" }) },
          navigator.title,
        ),
        commands
          .slice(0, this.state.maxResults.val - this.commandItems.length)
          .map(command => this.commandToEl(command, navigator)),
      );
    });
  }

  private renderMain(): HTMLDivElement {
    return div(
      {
        class: "palette-content-main",
        style: () => (this.mainElScale.val !== 1 ? `transform: scale(${this.mainElScale.val});` : ""),
        onscroll: this.handleScroll,
        onscrollend: (e: Event) => (
          (e.currentTarget as HTMLElement).scrollTop === 0 && (this.isFocusedSearchInput = true),
          this.focus()
        ),
      },
      this.categoriesToShow
        .map(cat => ({ cat: cat.getPalette(this), id: cat.id }))
        .map(({ cat, id }) => {
          if (this.commandItems.length >= this.state.maxResults.val) return;
          cat.dialog = this; // Ensure category has dialog reference for command rendering
          const commands = cat.trygetCommands(this.state.query.val);
          const extras = cat.extraCMD?.trygetCommands(this.state.query.val) || [];

          if (commands.length === 0 && extras.length === 0 && this.state.topCategory.val !== id) return;

          return div(
            { class: "category" },
            div(
              { class: "category-title", onclick: () => this.palette.display({ topCategory: id }) },
              cat.title,
            ),
            commands
              .slice(0, this.state.maxResults.val - this.commandItems.length)
              .map(command => this.commandToEl(command, cat)),
            extras
              .slice(0, this.state.maxResults.val - this.commandItems.length)
              .map(command => this.commandToEl(command, cat.extraCMD!, true)),
            this.state.topCategory.val === id
              ? new Item()
                  .setTitle("No results found")
                  .setDescription(this.state.query.val ? "Try something else." : "Type to search...")
                  .setHidden(false).element
              : undefined,
          );
        }),
      this.commandItems.length >= this.state.maxResults.val
        ? new Item({ onclick: () => (this.state.maxResults.val = 40000) })
            .setTitle("Are you kidding me?")
            .setDescription("Seriously, you want to load more results?")
            .setHidden(false).element
        : undefined,
    );
  }

  commandToEl(command: unknown, cat: CommandCategory<unknown>, isextra = false): HTMLDivElement {
    if (this.commandItems.length > this.state.maxResults.val)
      throw new Error("Too many commands, stopping render. This should never happen.");
    const cmdindex = this.commandItems.length;
    const itemEl = new CommandItem(
      {
        onclick: () => cat.tryexecute(command, itemEl.toState, this),
        onmousemove: () => (this.selectedIndex.val = cmdindex),
        class: () =>
          (this.selectedIndex.val === cmdindex ? "command-item selected" : "command-item") +
          (isextra ? " extras-item" : ""),
      },
      command,
      cat,
    ).onContext(() => this.activateContextFromCommand(itemEl));

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
    return this.dialog.getState().query ?? "";
  }
  siblings?: CategoryLoader<unknown>[];
  console: BrowserConsole = new BrowserConsole(true, `${this.constructor.name}:`); // Console for logging

  // younger siblings
  private _extraCMD?: CMDCategory;

  get extraCMD(): CMDCategory | undefined {
    return this._extraCMD;
  }

  constructor(public dialog: CommandPaletteDialog) {
    this.onInit?.(); // Call onInit if defined
  }

  /**
   * Trigger hook for preparing category data before render.
   *
   * @param state - Current palette state.
   */
  abstract onTrigger(state: CommandPaletteViewState): void;

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
  ): Partial<CommandPaletteViewState> | (() => Partial<CommandPaletteViewState>);

  /**
   * Executes a command when selected.
   *
   * @param command - Command to execute.
   */
  abstract executeCommand(command: T): void;
  onForward?: () => Partial<CommandPaletteViewState>; // Optional function to modify state when navigating forward

  onInit?(): void; // Called when the category is initialized

  /**
   * Safe wrapper around `onTrigger()` with error logging.
   *
   * @param state - Current palette state.
   * @returns The current category instance for method chaining.
   */
  tryTrigger(state: CommandPaletteViewState): this {
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
      const commands = this.getCommands(query);
      if (!commands) {
        throw new Error("getCommands returned null or undefined");
      }
      return commands;
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
  tryrender(command: T, el: CommandItem<T>): () => Partial<CommandPaletteViewState> {
    try {
      const result = this.renderCommand(command, el);
      return typeof result === "function" ? result : () => result;
    } catch (e) {
      this.console.error(`Error in ${this.constructor.name}.renderCommand`, e);
    }
    return () => ({});
  }

  /**
   * Applies command state transition and safely executes command logic.
   *
   * @param command - Command to execute.
   * @param toState - State transition function from render phase.
   * @returns The current category instance for method chaining.
   */
  tryexecute(
    command: T,
    toState: () => Partial<CommandPaletteViewState>,
    dialog: CommandPaletteDialog,
  ): this {
    this.dialog.palette.update({ query: "" });
    dialog.updateViewState(toState());
    dialog.saveState();
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
              : { d: levenshtein(lowerQuery, cb(item).toLowerCase()), item, index },
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
    if (!this._extraCMD) this._extraCMD = new CMDCategory(this.dialog);
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
 * @see CommandPaletteViewState
 */
export class CommandItem<T> extends Item {
  private allowsContextMenu: boolean = false;
  private contextCallback?: (e: Event) => void;
  toState: () => Partial<CommandPaletteViewState> = () => ({});

  constructor(
    l: Props & PropsWithKnownKeys<HTMLDivElement> = {},
    public command: T,
    PaletteCat: CommandCategory<T>,
  ) {
    super(l);
    this.highlight(PaletteCat.dialog.palette.highlighter);
    this.toState = () => ({});
  }

  /**
   * Adds a context-menu affordance icon to this command item.
   *
   * @returns The current command item instance for method chaining.
   */
  addctx() {
    this.prependComponent(
      div(
        {
          class: "icon-button",
          title: "Open context menu",
          onclick: e => (e.stopPropagation(), this.contextCallback?.(e)),
        },
        renderIcon(ChevronRight),
      ),
    );
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
  names: CategoryLoader<unknown>[] = [];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onTrigger(_state: CommandPaletteViewState): void {
    this.names = this.dialog.palette.allPalettes;
  }
  getCommands(query: string): CategoryLoader<unknown>[] {
    const names = this.names.length ? this.names : this.dialog.palette.allPalettes;
    return this.getcompatible(query, names, category => category.getPalette(this.dialog).name);
  }
  renderCommand(
    command: CategoryLoader<unknown>,
    Item: CommandItem<CategoryLoader<unknown>>,
  ): Partial<CommandPaletteViewState> {
    const disabled = this.dialog.palette.isCategoryDisabled(command.id);
    Item.setTitle(command.getPalette(this.dialog).name)
      .setDescription(`${command.getPalette(this.dialog).description}${disabled ? " (disabled)" : ""}`)
      .addComponent(
        toggle({
          checked: !disabled,
          onclick: (e: Event, state) => {
            e.stopPropagation();
            void (state.val
              ? this.dialog.palette.enableCategory(command.id)
              : this.dialog.palette.disableCategory(command.id));
          },
        }),
      );

    return { topCategory: command.id };
  }

  executeCommand(): void {
    this.dialog.palette.display();
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

  constructor(dialog: CommandPaletteDialog) {
    super(dialog);
  }

  show(cb: (prompt: string | null) => void = () => {}, text: string): void {
    this.cb = cb;
    this._prompt = text;
    this.wasopen = this.dialog.palette.isOpen;
    this.currentTopCategory = this.dialog?.getState().topCategory ?? ""; // Save current top category
    this.dialog.palette.display({ topCategory: "prompt" }, false);
  }

  prompt(text: string): Promise<string | null> {
    return new Promise(resolve => this.show(prompt => resolve(prompt), text));
  }

  confirm(text: string): Promise<boolean> {
    return new Promise(resolve => this.show(prompt => resolve(prompt !== null), text));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onTrigger(_state: CommandPaletteViewState): void {}

  getCommands(): string[] {
    return ["Ok", "Cancel"];
  }

  renderCommand(command: string, Item: CommandItem<string>): Partial<CommandPaletteViewState> {
    Item.setTitle(command);
    if (command === "Ok") Item.setDescription(this._prompt);
    return { topCategory: this.currentTopCategory };
  }

  executeCommand(command: string): void {
    const query = this.dialog?.getState().query ?? "";
    this.cleanup(); // Cleanup on cancel
    if (command === "Ok") this.cb(query);
    else if (command === "Cancel") this.cb(null);
  }

  cleanup() {
    this.commands = []; // Clear commands on cleanup
    if (!this.wasopen)
      this.dialog.palette.close(); // Close palette if it was not open before
    else this.dialog.palette.display({ topCategory: this.currentTopCategory }, false); // Restore previous context
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
  onTrigger(_state: CommandPaletteViewState) {
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
  ): Partial<CommandPaletteViewState> | (() => Partial<CommandPaletteViewState>) {
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
    ) => Partial<CommandPaletteViewState> | (() => Partial<CommandPaletteViewState>) | void,
  ): CMDCategory {
    const command = CMD(name, description, cb);
    this.commands.push(command);
    return this;
  }
}
