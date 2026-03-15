import levenshtein from "js-levenshtein";
import { ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, X } from "lucide";
import { App } from "./App";
import "./CommandPalette.css";
import { IconActionComponent, inputMode, Item, TextInput, UIComponent } from "./Components";
import { ETarget, Openable } from "./Event";
import { PaletteState, PaletteStateController } from "./PaletteStateController";

import { escapeRegExp } from "./escapeRegExp";
import { Highlighter } from "./highlighter";
import { CMD } from "./Comands";
import { BrowserConsole } from "./MyBrowserConsole";

export class CategoryLoader<T> {
  private _palette: CommandCategory<T> | null = null;
  constructor(
    private load: CategoryLoaderFunc<T>,
    readonly id: string,
  ) {}

  public getPalette(commandPalette: UnifiedCommandPalette): CommandCategory<T> {
    return this._palette || (this._palette = this.load(commandPalette));
  }
}

export type CategoryLoaderFunc<T> = (commandPalette: UnifiedCommandPalette) => CommandCategory<T>;

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
 * - Designed to be subclassed with concrete implementations of `state`.
 *
 * @property state - The current state of the command palette (must be implemented by subclass).
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
 * class MyCommandPalette extends UnifiedCommandPalette<MyApp> {
 *   state = new MyCommandPaletteState();
 * }
 */
export class UnifiedCommandPalette extends Openable<{
  open: void;
  display: CommandPaletteState;
  close: void;
  update: CommandPaletteState;
  keydown: { key: string };
  historypop: CommandPaletteState;
  draggingX: { deltaX: number };
  draggingY: { deltaY: number };
  dragX: { deltaX: number };
  dragY: { deltaY: number };
  dragCancel: { deltaX: number; deltaY: number };
  dragXcancel: { deltaX: number; deltaY: number };
  dragYcancel: { deltaX: number; deltaY: number };
}> {
  private _state: CommandPaletteState = new CommandPaletteState(this, ""); // Initialize with default state
  public get state(): CommandPaletteState {
    return this._state;
  }
  public set state(value: CommandPaletteState) {
    this.emit("update", value);
    this._state = value;
  }
  private categories: CategoryLoader<unknown>[] = [];
  private hiddenCategories: CategoryLoader<unknown>[] = []; // Hidden categories
  private containerEl: HTMLElement | null = null;
  private containerComponent: UIComponent<"div"> | null = null;

  private paletteEl!: HTMLElement;
  private searchInput?: TextInput; // Search input element
  private contentEl!: HTMLElement;

  private commandItems: CommandItem<unknown>[] = [];
  private selectedIndex = -1;
  private stateController: PaletteStateController<CommandPaletteState>;
  private headerEl!: HTMLDivElement;
  private maxResults: number = 100; // Maximum results to show
  //private CategoryNavigator: CategoryNavigator<>;
  private contentOverview!: HTMLDivElement;

  inputMode: inputMode = "search"; // Default input type
  columns: boolean = true; // Whether to display in columns
  paletteContentContainer!: HTMLDivElement;

  constructor(private app: App) {
    super(app);
    this.stateController = new PaletteStateController<CommandPaletteState>(
      () => this.state,
      state => (this.state = state),
    );
    this.addHiddenPalette(() => new CategoryNavigator(this), "navigator");
    this.addHiddenPalette(() => new PromptCategory(this), "prompt");
    this.on("keydown", this.handleKey);
    this.on("historypop", this.handleBack);
    this.on("dragX", e => {
      if (e.deltaX > 0) this.display({ topCategory: "category-navigator" });
    });
    this.on("draggingX", e => {
      if (e.deltaX > 0)
        this.contentEl.style.transform = `scale(${1 - Math.min(Math.abs(e.deltaX) / 1000, 0.1)})`;
    });
    this.on("dragXcancel", () => {
      this.contentEl.style.transform = "";
    });
  }

  menu() {
    this.update({ topCategory: "category-navigator" }).open();
  }

  private saveStateHistory(): this {
    this.app.historyPush();
    return this;
  }

  useState<T>(initialValue: T): PaletteState<T> {
    return this.stateController.useState(initialValue);
  }

  prompt(text: string): Promise<string | null> {
    return this.getPromptCategory()?.prompt(text) ?? Promise.resolve(null);
  }

  confirm(text: string): Promise<boolean> {
    return this.getPromptCategory()?.confirm(text) ?? Promise.resolve(false);
  }

  private getPromptCategory(): PromptCategory | undefined {
    const promptCategory = this.getCategory("prompt")?.getPalette(this);
    if (promptCategory instanceof PromptCategory) return promptCategory;
  }

  get length(): number {
    return this.commandItems.length;
  }

  get topCategory(): CategoryLoader<unknown> | undefined {
    return this.getCategory(this.state.topCategory) || this.categories[0];
  }

  get palettes(): CategoryLoader<unknown>[] {
    return this.categories; // Exclude the ListOfPalettes category
  }

  get selCMD(): CommandItem<unknown> | null {
    return this.commandItems[this.selectedIndex] || null; // Return the currently selected command item or null if none
  }

  // Add category (class constructor or instance)
  addPalette(load: CategoryLoaderFunc<unknown>, id: string): this {
    this.categories.push(new CategoryLoader(load, id));
    return this;
  }

  addPalettes(...categories: { load: CategoryLoaderFunc<unknown>; id: string }[]): this {
    categories.forEach(category => this.addPalette(category.load, category.id));
    return this;
  }

  removePalette(load: CategoryLoaderFunc<unknown>, id: string): void {
    this.categories = this.categories.filter(cat => cat.id !== id || cat.getPalette !== load);
  }

  addHiddenPalette(load: CategoryLoaderFunc<unknown>, id: string): this {
    this.hiddenCategories.push(new CategoryLoader(load, id));
    return this;
  }

  addHiddenPalettes(...categories: { load: CategoryLoaderFunc<unknown>; id: string }[]): this {
    categories.forEach(category => this.addHiddenPalette(category.load, category.id));
    return this;
  }

  removeHiddenPalette(load: CategoryLoaderFunc<unknown>, id: string): void {
    this.hiddenCategories = this.hiddenCategories.filter(cat => cat.id !== id || cat.getPalette !== load);
  }

  // Open and initialize palette UI
  onopen() {
    if (this.app.ctarget !== this) this.app.pushTarget(this as ETarget);
    this.stateController.clearContexts();
    this.display();
  }

  opencategory(category: string) {
    /* this.hiddenCategories.find(cat => cat.constructor === category) || this._addHiddenPalette(category); */
    this.update({ topCategory: category }).open();
  }

  update(context: Partial<CommandPaletteState> = {}) {
    this.state = this.stateController.update(context);
    this.emit("update", this.state);
    return this;
  }

  display(context: Partial<CommandPaletteState> = {}, shouldSaveHistory = true) {
    if (this.app.ctarget !== this) this.app.pushTarget(this as ETarget);
    this.emit("display", this.state);
    this.update(context);
    if (shouldSaveHistory) this.saveStateHistory();
    this.stateController.pushCurrentContext();
    this.inputMode = "search";
    this.checkclose();

    // Trigger data fetching for categories
    this.categories.forEach(cat => cat.getPalette(this).tryTrigger(this.state));
    this.hiddenCategories.forEach(cat => cat.getPalette(this).tryTrigger(this.state));

    const container = new UIComponent(this.app.contentEl, "div").addClass("command-palette");
    this.containerComponent = container;
    this.containerEl = container.element;
    this.handleMobileResize();
    this.hideKeyboardOnScroll(container);

    this.paletteEl = container.createChild("div", { cls: "palette" });
    this.headerEl = this.paletteEl.createEl("div", { cls: "palette-header" });

    new IconActionComponent(this.headerEl)
      .setAction(ChevronLeft, "Back to previous context")
      .on("click", () => {
        this.handleBack();
      });

    /* if (!this.columns)
      new Button(this.headerEl)
        .setIcon(TableOfContents)
        .setTooltip("List of Palettes")
        .on("click", () => {
          return this.display({ topCategory: CategoryNavigator } );
        }); */

    new IconActionComponent(this.headerEl)
      .setAction(this.state.expanded ? ChevronsDownUp : ChevronsUpDown, "Toggle expanded view")
      .next(btn =>
        btn.on("click", () => {
          this.state.expanded = !this.state.expanded;
          this.paletteContentContainer.classList.toggle("expanded", this.state.expanded);
          btn.setAction(this.state.expanded ? ChevronsDownUp : ChevronsUpDown, "Toggle expanded view");
        }),
      );

    new IconActionComponent(this.headerEl).setAction(X, "Close Palette").on("click", () => {
      this.close();
    });

    this.searchInput = new TextInput(this.paletteEl)
      .addClass("palette-search")
      .setPlaceholder(
        `Search ${this.state.topCategory ? this.topCategory?.getPalette(this).title : "all"}...`,
      )

      .setType("search", this.inputMode)
      .on("input", (e: string) => {
        this.state.query = e;
        this.state.maxResults = this.maxResults;
        this.render();
      });

    this.paletteContentContainer = this.paletteEl.createEl("div", { cls: "palette-content" }, el => {
      this.contentOverview = el.createEl("div", {
        cls: "palette-content-over",
      });
      this.contentEl = el.createEl("div", { cls: "palette-content-main" });
      el.classList.toggle("expanded", this.state.expanded);
    });

    this.state.query = ""; //  Reset query on open
    this.render(); // initial load
    this.searchInput.element.focus();
  }

  hideKeyboardOnScroll(container: UIComponent<"div">) {
    container.listen("touchmove", () => this.searchInput?.element.blur(), { passive: true });
  }

  private handleScroll = () => {
    window.requestAnimationFrame(() => {
      if (this.state.maxResults < 1000) {
        const currentselection = this.selectedIndex;
        this.update({ maxResults: 1000 }).render().selectIndex(currentselection, true); // Restore selection after rendering
        if (this.commandItems.length > this.state.maxResults)
          new CommandItem(this.contentEl, null, this.topCategory!.getPalette(this))
            .setTitle("Are you kidding me?")
            .setDescription("Seriously, you want to load more results?") // Just a joke;
            .setHidden(false)
            .on("click", () =>
              this.update({ maxResults: 40000 }).render().selectIndex(currentselection, true),
            );
      }
    });
  };

  private handleMobileResize = (): void => {
    // For mobile keyboard handling
    const visual = window.visualViewport;
    const ctr = this.containerEl;
    if (visual && ctr) {
      const viewportHeight = visual.height;
      ctr.style.height = `calc(${viewportHeight}px - 2em)`;
      visual.addEventListener("resize", this.handleMobileResize, {
        once: true,
      });
    }
  };

  private handleKey = (e: { key: string }) => {
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
        this.ActivateContextFromCommand(this.commandItems[this.selectedIndex]);
        break;
      case "ArrowLeft":
      case "Shift+Tab":
        const previous = this.stateController.popPreviousContext();
        if (!previous) return;
        this.display(previous, false); // Open previous context
        break;
    }
  };

  private ActivateContextFromCommand(command: CommandItem<unknown>) {
    if (command.contextMenuAllowed) this.display(command.toState(this.state));
  }

  handleBack = () => {
    const previous = this.stateController.popPreviousContext();
    if (previous) {
      this.display(previous, false); // Display previous context
    } else {
      this.close(); // Close if no previous context
    }
  };

  setValue(value: string, select = false) {
    this.searchInput?.setValue(value);
    if (select) this.searchInput?.element.select();

    this.state.query = value;
    this.state.maxResults = this.maxResults;
    this.render();
  }

  private checkclose() {
    if (this.containerComponent) {
      this.containerComponent.remove();
      this.containerComponent = null;
      this.containerEl = null;
    }
  }

  onclose() {
    if (this.app.ctarget === this) this.app.popTarget();
    if (this.containerComponent) {
      this.containerComponent.remove();
      this.containerComponent = null;
      this.containerEl = null;
    }
    this.state = this.state.update({
      query: "",
      maxResults: 100,
      topCategory: "",
    });
    this.stateController.clearContexts();
  }

  // Filter and show commands based on query
  private render() {
    if (!this.containerEl) return this;

    const { contentEl, contentOverview, state } = this;
    contentEl.empty();
    contentOverview.empty();
    contentEl.scroll(0, 0); // Scroll to top
    contentOverview.scroll(0, 0); // Scroll to top
    contentEl.removeEventListener("scroll", this.handleScroll);
    contentEl.addEventListener("scroll", this.handleScroll, {
      passive: true,
      once: true,
    });
    this.commandItems = [];
    this.selectedIndex = 0;

    contentOverview.style.display = this.columns ? "block" : "";
    if (this.columns) {
      const Navigator = this.getCategory("navigator")!.getPalette(this);

      Navigator.setUp(state);
      const commands = Navigator.trygetCommands(state.query);
      if (commands.length > 0) {
        const catEl = contentOverview.createEl("div", { cls: "category" });
        catEl.createEl("div", { text: Navigator.title, cls: "category-title" }, el =>
          el.addEventListener("click", e => {
            e.stopPropagation();
            this.display({ topCategory: "navigator" });
          }),
        );
        commands.forEach(command => {
          const cmdindex = this.commandItems.length;
          const itemEl = new CommandItem(catEl, command, Navigator)
            .on("click", () => Navigator.tryexecute(command, itemEl.toState))
            .on("mousemove", () => this.selectIndex(cmdindex))
            .on("context", () => this.ActivateContextFromCommand(this.commandItems[cmdindex]));
          itemEl.toState = Navigator.tryrender(command, itemEl);
          this.commandItems.push(itemEl);
        });
      }
      this.selectedIndex = this.commandItems.length; // Reset selection index
    }

    this.categoriesToShow
      .map(cat => ({ cat: cat.getPalette(this), id: cat.id }))
      .forEach(({ cat, id }) => {
        if (this.commandItems.length > state.maxResults) return;
        cat.setUp(state);
        cat.extraCMD?.setUp(state);
        const commands = cat.trygetCommands(state.query);
        const extras = cat.extraCMD?.trygetCommands(state.query) || [];
        if (commands.length === 0 && extras.length === 0 && state.topCategory !== id) return;
        const catEl = contentEl.createEl("div", { cls: "category" });
        catEl.createEl("div", { text: cat.title, cls: "category-title" }, el =>
          el.addEventListener("click", e => {
            e.stopPropagation();
            this.display({ topCategory: id });
          }),
        );
        if (commands.length === 0 && extras.length === 0) {
          new Item(catEl)
            .setName("No results found")
            .setDescription(this.state.query ? "Try somthing else." : "Type to search...")
            .setHidden(false);
        }

        for (const command of commands) {
          if (this.commandItems.length > state.maxResults) return;
          const cmdindex = this.commandItems.length;
          const itemEl = new CommandItem(catEl, command, cat)
            .on("click", () => cat.tryexecute(command, itemEl.toState))
            .on("mousemove", () => this.selectIndex(cmdindex))
            .on("context", () => this.ActivateContextFromCommand(this.commandItems[cmdindex]));
          itemEl.toState = cat.tryrender(command, itemEl);
          this.commandItems.push(itemEl);
        }

        if (cat.extraCMD)
          extras.forEach((command, i) => {
            if (this.commandItems.length > state.maxResults) return;
            const cmdindex = this.commandItems.length;
            const itemEl = new CommandItem(catEl, command, cat.extraCMD!)
              .on("click", () => cat.extraCMD?.tryexecute(command, itemEl.toState))
              .on("mousemove", () => this.selectIndex(cmdindex))
              .on("context", () => this.ActivateContextFromCommand(this.commandItems[cmdindex]));
            itemEl.toState = cat.extraCMD?.tryrender(command, itemEl) || (state => state.update({}));
            this.commandItems.push(itemEl);
            void (
              i === 0 &&
              (itemEl.el.style.borderTopStyle = "none") &&
              (itemEl.el.style.marginTop = "1em")
            );
          });
      });
    this.updateSelection();
    return this; // Return this for chaining
  }

  get categoriesToShow(): CategoryLoader<unknown>[] {
    const { topCategory } = this.state;
    const top = this.topCategory;
    const siblings = top?.getPalette(this).siblings;
    // If SiblingCategories is set (even if empty)
    if (topCategory && siblings)
      return [top, ...siblings.map(catfn => this.getCategory(catfn.id))].filter(
        Boolean,
      ) as CategoryLoader<unknown>[];
    if (topCategory && top) return [top, ...this.categories.filter(cat => cat !== top)];
    return this.categories;
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

  // Keyboard navigation
  private moveSelection(delta: number) {
    const maxIndex = this.commandItems.length - 1;
    this.selectIndex(Math.min(Math.max(this.selectedIndex + delta, 0), maxIndex), true);
  }

  private selectIndex(index: number, scroll = false) {
    this.selectedIndex = index;
    this.updateSelection(scroll);
  }

  private updateSelection(scroll = false) {
    this.commandItems.forEach((item, idx) =>
      item.el.classList.toggle("selected", idx === this.selectedIndex),
    );
    if (scroll)
      this.selCMD?.el.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "smooth",
      });
  }

  private activateSelected() {
    this.selCMD?.el.click(); // Trigger click on the selected item
  }
}

/**
 * Represents the state of a command palette, including the current query,
 * the maximum number of results to display, and the currently selected top category.
 *
 * @typeParam  - The type of the application instance.
 */
export class CommandPaletteState {
  maxResults: number = 100; // Maximum results to show
  expanded: boolean = true; // Whether the palette items are expanded
  constructor(
    public palette: UnifiedCommandPalette,
    public query: string = "",
    public topCategory: string = "",
  ) {}
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
 * @property {Highlighter} highlighter - The highlighter instance for query highlighting.
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
  title!: string; // Title for the category, can be used in UI
  protected commands: T[] = [];
  highlighter!: Highlighter; // Highlighter for the category
  hili!: Highlighter["highlight"]; // Function to highlight text
  query!: string;
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

  setUp(state: CommandPaletteState): this {
    this.highlighter = new Highlighter([
      {
        regEXP: new RegExp(`(${escapeRegExp(state.query) || "this will never match"})`, "ig"),
        cls: "highlighted-query",
      },
      { regEXP: /\n/g, elTag: "br" },
    ]);
    this.hili = this.highlighter.highlight.bind(this.highlighter);
    this.query = state.query;
    return this;
  }
  abstract onTrigger(state: CommandPaletteState): void;
  abstract getCommands(query: string): T[];
  abstract renderCommand(
    command: T,
    el: CommandItem<T>,
  ): Partial<CommandPaletteState> | ((state: CommandPaletteState) => CommandPaletteState);
  abstract executeCommand(command: T): void;
  onForward?: (state: CommandPaletteState) => CommandPaletteState; // Optional function to modify state when navigating forward

  onInit?(): void; // Called when the category is initialized

  tryTrigger(state: CommandPaletteState): this {
    this.title = this.name;
    try {
      this.extraCMD?.resetCommands();
      this.onTrigger(state);
      this.extraCMD?.setUp(state);
      this.extraCMD?.onTrigger(state);
    } catch (e) {
      this.console.error(`Error in ${this.constructor.name}.onTrigger`, e);
    }
    return this;
  }

  trygetCommands(query: string): T[] {
    try {
      return this.getCommands(query);
    } catch (e) {
      this.console.error(`Error in ${this.constructor.name}.getCommands`, e);
      return [];
    }
  }

  tryrender(command: T, el: CommandItem<T>): (state: CommandPaletteState) => CommandPaletteState {
    try {
      const result = this.renderCommand(command, el);
      return typeof result === "function" ? result : state => state.update(result);
    } catch (e) {
      this.console.error(`Error in ${this.constructor.name}.renderCommand`, e);
    }
    return state => state.update({});
  }

  tryexecute(command: T, toState: (state: CommandPaletteState) => CommandPaletteState): this {
    this.commandPalette.state = toState(this.commandPalette.state);
    try {
      this.executeCommand(command);
    } catch (e) {
      this.console.error(`Error in ${this.constructor.name}.executeCommand`, e);
    }
    return this;
  }

  getcompatible<T>(query: string, array: T[], ...criteria: Array<(item: T) => string>): T[] {
    if (!query) return array;

    const lowerQuery = query.toLowerCase();
    const matchedIndices = new Set<number>();

    return criteria
      .map(cb =>
        array.filter((item, index) => {
          return (
            !matchedIndices.has(index) &&
            cb(item).toLowerCase().includes(lowerQuery) &&
            (matchedIndices.add(index), true) // Add index to matched set
          );
        }),
      )
      .flat();
  }

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
  toState: (state: CommandPaletteState) => CommandPaletteState;

  constructor(
    parent: HTMLElement,
    public command: T,
    private PaletteCat: CommandCategory<T>,
  ) {
    super(parent);
    this.highlight(PaletteCat.highlighter);
    this.toState = () => this.PaletteCat.commandPalette.state.update({});
  }

  addctx() {
    this.addIconButton(btn => {
      btn
        .setIcon(ChevronRight)
        .setTooltip("Open context menu")
        .on("click", e => {
          e.stopPropagation(); // Prevent triggering the main click
          this.emit("context", e); // Emit context menu event
        });
    });
    this.allowsContextMenu = true;
    return this;
  }

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
    this.names = this.commandPalette.palettes;
  }
  getCommands(query: string): CategoryLoader<unknown>[] {
    return this.getcompatible(query, this.names, category => category.getPalette(this.commandPalette).name);
  }
  renderCommand(
    command: CategoryLoader<unknown>,
    Item: CommandItem<CategoryLoader<unknown>>,
  ): Partial<CommandPaletteState> {
    Item.setTitle(command.getPalette(this.commandPalette).name).setDescription(
      command.getPalette(this.commandPalette).description,
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
    this.currentTopCategory = this.commandPalette.state.topCategory; // Save current top category
    this.commandPalette.display({ topCategory: "prompt" });
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
    const query = this.commandPalette.state.query;
    this.cleanup(); // Cleanup on cancel
    if (command === "Ok") {
      this.cb(query);
    } else if (command === "Cancel") {
      this.cb(null);
    }
  }

  cleanup() {
    this.commands = []; // Clear commands on cleanup
    this.commandPalette.off("close", this.invokeCallbackOnClose); // Remove event listener
    if (!this.wasopen)
      this.commandPalette.close(); // Close palette if it was not open before
    else this.commandPalette.display({ topCategory: this.currentTopCategory }); // Restore previous context
  }
}

export class CMDCategory extends CommandCategory<CMD> {
  name: string = "";
  description: string = "";
  protected commands: CMD[] = [];
  resetCommands() {
    this.commands = [];
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onTrigger(_state: CommandPaletteState) {
    return;
  }
  getCommands(query: string): CMD[] {
    return this.getcompatible(query, this.commands, a => a.name);
  }
  renderCommand(command: CMD, el: CommandItem<CMD>): Partial<CommandPaletteState> {
    return command.render(command, el);
  }
  executeCommand(command: CMD): void {
    command.click(command);
  }
  addCMD(command: CMD): CMDCategory {
    this.commands.push(command);
    return this;
  }
}
