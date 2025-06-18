import levenshtein from "js-levenshtein";
import { ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, TableOfContents, X } from "lucide";
import { App, Openable } from "./App";
import { Highlighter } from "./highlighter";
import "./CommandPalette.css";
import { Button, inputMode, Item, Menu, TextInput } from "./Components";
import { ETarget } from "./Event";
import { StateClass } from "./State";
import { escapeRegExp } from "./escapeRegExp";
import { SettingsClass } from "./settings";

/**
 * Abstract base class for a unified command palette UI component.
 *
 * The `UnifiedCommandPalette` provides a flexible, extensible command palette interface
 * for applications, supporting categories, keyboard navigation, context stacks, and
 * dynamic command filtering. It manages the UI lifecycle, user input, and command execution.
 *
 * @typeParam AppType - The application type, extending `App`, that this palette is bound to.
 *
 * @template AppType
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
export class UnifiedCommandPalette<
  AppType extends App,
  stateType extends CommandPaletteState = CommandPaletteState
> extends Openable<
  AppType,
  {
    open: void;
    display: stateType;
    close: void;
    update: stateType;
    keydown: { key: string };
    historypop: stateType;
    [key: string]: any; // Allow additional events
  }
> {
  private _state: stateType; // State of the command palette
  public get state(): stateType {
    return this._state;
  }
  public set state(value: stateType) {
    this.emit("update", value);
    this._state = value;
  }
  private categories: CommandCategory<any, AppType>[] = [];
  private hiddenCategories: CommandCategory<any, AppType>[] = []; // Hidden categories
  private containerEl: HTMLElement | null = null;

  private paletteEl!: HTMLElement;
  private searchInput: TextInput; // Search input element
  private contentEl!: HTMLElement;

  private commandItems: CommandItem<any>[] = [];
  private selectedIndex = -1;
  private contexts: stateType[] = []; // Stack of contexts for back navigation
  private headerEl: HTMLDivElement;
  private maxResults: number = 100; // Maximum results to show
  //private CategoryNavigator: CategoryNavigator<AppType>;
  private contentOverview: HTMLDivElement;

  inputMode: inputMode = "search"; // Default input type
  columns: boolean = true; // Whether to display in columns
  c: HTMLDivElement;

  constructor(private app: AppType) {
    super(app);
    this.app.console.log("CommandPalette initialized");
    this.on("keydown", this.handleKey);
    this.on("historypop", this.handleBack);
  }

  prompt(text: string): Promise<string | null> {
    return this.getCategory(PromptCategory).prompt(text);
  }

  confirm(text: string): Promise<boolean> {
    return this.getCategory(PromptCategory).confirm(text);
  }

  get length(): number {
    return this.commandItems.length;
  }

  get topCategory(): CommandCategory<any, AppType> {
    return this.state.topCategory ? this.getCategory(this.state.topCategory) : this.categories[0];
  }

  get palettes(): CommandCategory<any, AppType>[] {
    return this.categories; // Exclude the ListOfPalettes category
  }

  get selCMD(): CommandItem<any> | null {
    return this.commandItems[this.selectedIndex] || null; // Return the currently selected command item or null if none
  }

  // Add category (class constructor or instance)
  addPalette<T extends CommandCategory<any, AppType>>(
    category: new (app: AppType, palette: UnifiedCommandPalette<AppType, any>) => T | T
  ) {
    const instance = typeof category === "function" ? new category(this.app, this) : category;
    this.categories.push(instance);
    return this;
  }

  addPalettes(
    ...categories: (new (app: AppType, palette: UnifiedCommandPalette<AppType, any>) =>
      | CommandCategory<any, AppType>
      | CommandCategory<any, AppType>)[]
  ): this {
    categories.forEach(category => this.addPalette(category));
    return this;
  }

  addHiddenPalette<T extends CommandCategory<any, AppType>>(
    category: new (app: AppType, palette: UnifiedCommandPalette<AppType, any>) => T | T
  ) {
    const instance = typeof category === "function" ? new category(this.app, this) : category;
    this.hiddenCategories.push(instance);
    return this;
  }

  addHiddenPalettes(
    ...categories: (new (app: AppType, palette: UnifiedCommandPalette<AppType, any>) =>
      | CommandCategory<any, AppType>
      | CommandCategory<any, AppType>)[]
  ): this {
    categories.forEach(category => this.addHiddenPalette(category));
    return this;
  }

  _addHiddenPalette<T extends CommandCategory<any, AppType>>(
    category: new (app: AppType, palette: UnifiedCommandPalette<AppType, any>) => T | T
  ): CommandCategory<any, AppType> {
    const instance = typeof category === "function" ? new category(this.app, this) : category;
    this.hiddenCategories.push(instance);
    return instance;
  }

  // Open and initialize palette UI
  onopen() {
    if (this.app.ctarget !== this) this.app.pushTarget(this);
    this.contexts = [];
    this.display();
  }

  update<stateType extends CommandPaletteState>(context: Partial<stateType> = {}) {
    this.state = this.state.update(context as any);
    this.emit("update", this.state);
    return this;
  }

  display(context: Partial<stateType> = {}) {
    if (this.app.ctarget !== this) this.app.pushTarget(this);
    this.emit("display", this.state);
    this.update(context);
    this.app.historyPush();
    this.contexts.push(this.state);
    this.inputMode = "search";
    this.checkclose();

    // Trigger data fetching for categories
    this.categories.forEach(cat => cat.tryTrigger(this.state));
    this.hiddenCategories.forEach(cat => cat.tryTrigger(this.state));

    this.containerEl = this.app.contentEl.createEl("div", { cls: "command-palette" });
    this.handleMobileResize();

    this.paletteEl = this.containerEl.createEl("div", { cls: "palette" });
    this.headerEl = this.paletteEl.createEl("div", { cls: "palette-header" });

    new Button(this.headerEl)
      .setIcon(ChevronLeft)
      .setTooltip("Back to previous context")
      .on("click", () => {
        this.handleBack();
      });

    if (!this.columns)
      new Button(this.headerEl)
        .setIcon(TableOfContents)
        .setTooltip("List of Palettes")
        .on("click", () => {
          return this.display({ topCategory: CategoryNavigator } as any);
        });

    new Button(this.headerEl)
      .setIcon(this.state.expanded ? ChevronsDownUp : ChevronsUpDown)
      .setTooltip("Toggle expanded view")
      .next(btn =>
        btn.on("click", () => {
          this.state.expanded = !this.state.expanded;
          this.c.classList.toggle("expanded", this.state.expanded);
          btn.setIcon(this.state.expanded ? ChevronsDownUp : ChevronsUpDown);
        })
      );

    new Button(this.headerEl)
      .setIcon(X)
      .setTooltip("Close Palette")
      .on("click", () => {
        this.close();
      });

    this.searchInput = new TextInput(this.paletteEl)
      .addClass("palette-search")
      .setPlaceholder(`Search ${this.state.topCategory ? this.topCategory.title : "all"}...`)
      .setType("search", this.inputMode)
      .on("input", (e: string) => {
        this.state.query = e;
        this.state.maxResults = this.maxResults;
        this.render();
      });

    this.c = this.paletteEl.createEl("div", { cls: "palette-content" }, el => {
      this.contentOverview = el.createEl("div", { cls: "palette-content-over" });
      this.contentEl = el.createEl("div", { cls: "palette-content-main" });
      el.classList.toggle("expanded", this.state.expanded);
    });

    this.state.query = ""; //  Reset query on open
    this.render(); // initial load
    this.searchInput.element.focus();
  }

  private handleScroll = () => {
    window.requestAnimationFrame(() => {
      if (this.state.maxResults < 1000) {
        const currentselection = this.selectedIndex;
        this.update({ maxResults: 1000 }).render().selectIndex(currentselection, true); // Restore selection after rendering
        if (this.commandItems.length > this.state.maxResults)
          new CommandItem(this.contentEl, null, this.topCategory)
            .setTitle("Are you kidding me?")
            .setDescription("Seriously, you want to load more results?") // Just a joke;
            .setHidden(false)
            .on("click", () =>
              this.update({ maxResults: 100000 }).render().selectIndex(currentselection, true)
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
      ctr.style.cssText = `height: calc(${viewportHeight}px - 2em);`;
      visual.addEventListener("resize", this.handleMobileResize, { once: true });
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
        this.contexts.pop();
        this.display(this.contexts.pop()); // Open previous context
        break;
    }
  };

  private ActivateContextFromCommand(command: CommandItem<any>) {
    if (command.contextMenuAllowed) this.display(command.toState as typeof this._state);
  }

  handleBack = () => {
    if (this.contexts.length > 1) {
      this.contexts.pop(); // Remove current context
      this.display(this.contexts.pop()); // Display previous context
    } else {
      this.close(); // Close if no previous context
    }
  };

  setValue(value: string, select = false) {
    this.searchInput.setValue(value);
    if (select) this.searchInput.element.select();

    this.state.query = value;
    this.state.maxResults = this.maxResults;
    this.render();
  }

  private checkclose() {
    if (this.containerEl) {
      this.containerEl.remove();
      this.containerEl = null;
    }
  }

  onclose() {
    if (this.app.ctarget === this) this.app.popTarget();
    if (this.containerEl) {
      this.containerEl.remove();
      this.containerEl = null;
    }
    this.state = this.state.update({ query: "", maxResults: 100, topCategory: null } as any);
    this.contexts = [];
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
      const Navigator = this.getCategory(CategoryNavigator);
      Navigator.setUp(state);
      const commands = Navigator.trygetCommands(state.query);
      if (commands.length > 0) {
        const catEl = contentOverview.createEl("div", { cls: "category" });
        catEl.createEl("div", { text: Navigator.title, cls: "category-title" }, el =>
          el.addEventListener("click", e => {
            e.stopPropagation();
            this.display({ topCategory: CategoryNavigator } as any);
          })
        );
        commands.forEach(command => {
          const cmdindex = this.commandItems.length;
          const itemEl = new CommandItem(catEl, command, Navigator)
            .on("click", () => Navigator.tryexecute(command, itemEl.toState))
            .on("mousemove", () => this.selectIndex(cmdindex))
            .on("context", () => this.ActivateContextFromCommand(this.commandItems[cmdindex]));
          itemEl.toState = state.update(Navigator.tryrender(command, itemEl) as any);
          this.commandItems.push(itemEl);
        });
      }
      this.selectedIndex = this.commandItems.length; // Reset selection index
    }

    this.categoriesToShow.forEach((cat, index) => {
      if (this.commandItems.length > state.maxResults) return;
      cat.setUp(state);
      const commands = cat.trygetCommands(state.query);
      const extras = cat.extraCMD?.trygetCommands(state.query) || [];
      if (commands.length === 0 && extras.length === 0 && state.topCategory !== cat.constructor) return;
      const catEl = contentEl.createEl("div", { cls: "category" });
      catEl.createEl("div", { text: cat.title, cls: "category-title" }, el =>
        el.addEventListener("click", e => {
          e.stopPropagation();
          this.display({ topCategory: cat.constructor as any } as any);
        })
      );

      for (const command of commands) {
        if (this.commandItems.length > state.maxResults) return;
        const cmdindex = this.commandItems.length;
        const itemEl = new CommandItem(catEl, command, cat)
          .on("click", () => cat.tryexecute(command, itemEl.toState))
          .on("mousemove", () => this.selectIndex(cmdindex))
          .on("context", () => this.ActivateContextFromCommand(this.commandItems[cmdindex]));
        itemEl.toState = state.update(cat.tryrender(command, itemEl) as any);
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
          itemEl.toState = state.update(cat.extraCMD?.tryrender(command, itemEl) || ({} as any));
          this.commandItems.push(itemEl);
          i === 0 && (itemEl.el.style.borderTopStyle = "none") && (itemEl.el.style.marginTop = "1em");
        });
    });
    this.updateSelection();
    return this; // Return this for chaining
  }

  get categoriesToShow(): CommandCategory<any, AppType>[] {
    const { topCategory } = this.state;
    const top = this.topCategory;
    // If SiblingCategories is set (even if empty)
    if (topCategory && top.siblings) return [top, ...top.siblings?.map(catfn => this.getCategory(catfn))];
    if (topCategory) return [top, ...this.categories.filter(cat => cat !== top)];
    return this.categories;
  }

  /**
   * Retrieves a command category instance by its constructor from the visible or hidden categories.
   * If the category is not found, it is created and added to the hidden categories.
   *
   * @param name - The constructor function of the command category to retrieve.
   * @returns The instance of the requested command category.
   */
  getCategory<T extends CommandCategory<any, AppType>>(
    name: new (app: AppType, palette: UnifiedCommandPalette<AppType, any>) => T
  ): T {
    return (this.categories.find(cat => cat.constructor === name) ||
      this.hiddenCategories.find(cat => cat.constructor === name) ||
      this._addHiddenPalette(name).tryTrigger(this.state)) as T; // Create and trigger if not found
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
      item.el.classList.toggle("selected", idx === this.selectedIndex)
    );
    if (scroll) this.selCMD?.el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }

  private activateSelected() {
    this.selCMD?.el.click(); // Trigger click on the selected item
  }
}

/**
 * Represents the state of a command palette, including the current query,
 * the maximum number of results to display, and the currently selected top category.
 *
 * @typeParam AppType - The type of the application instance.
 */
export class CommandPaletteState extends StateClass {
  maxResults: number = 100; // Maximum results to show
  expanded: boolean = false; // Whether the palette items are expanded
  constructor(
    public palette: UnifiedCommandPalette<any, any>,
    public query: string = "",
    public topCategory:
      | (new (app: any, palette: UnifiedCommandPalette<any, any>) => CommandCategory<any, any>)
      | null = null
  ) {
    super();
  }
}

class CommandCategoryState extends StateClass {}

/**
 * Abstract base class representing a category of commands for a command palette.
 *
 * @template T - The type representing individual commands in the category.
 * @template AppType - The application type, extending `App`, that this category operates on.
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
 * @property {DefaultCommandCategory<AppType>} [extraCMD] - Optional default command category for extra commands.
 * @property {string} query - The current query string for filtering commands.
 *
 * @constructor
 * @param {AppType} app - The application instance.
 * @param {UnifiedCommandPalette<AppType>} commandPalette - The command palette instance.
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
export abstract class CommandCategory<
  T,
  AppType extends App,
  SettingsType extends { [key: string]: any } = {}
> extends SettingsClass<SettingsType> {
  abstract readonly name: string;
  abstract readonly description: string; // Description for the category, can be used in UI
  //state: CommandCategoryState = new CommandCategoryState();
  title: string; // Title for the category, can be used in UI
  protected commands: T[] = [];
  highlighter: Highlighter; // Highlighter for the category
  hili: Highlighter["highlight"]; // Function to highlight text
  query: string;
  siblings?: (new (app: AppType, palette: UnifiedCommandPalette<AppType, any>) => CommandCategory<
    any,
    AppType
  >)[];
  // younger siblings
  private _extraCMD?: DefaultCommandCategory<AppType>;

  get extraCMD(): DefaultCommandCategory<AppType> | undefined {
    return this._extraCMD;
  }

  constructor(public app: AppType, public commandPalette: UnifiedCommandPalette<AppType, any>) {
    super(); // Initialize settings
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
  abstract renderCommand(command: T, el: CommandItem<T>): Partial<CommandPaletteState>;
  abstract executeCommand(command: T): void;

  onInit?(): void; // Called when the category is initialized

  tryTrigger(context: CommandPaletteState): this {
    this.title = this.name;
    try {
      if (this.extraCMD) {
        this.extraCMD.setUp(context);
        this.extraCMD.onTrigger(context);
      }
      this.onTrigger(context);
    } catch (e) {
      this.app.console.error(`Error in ${this.constructor.name}.onTrigger`, e);
    }
    return this;
  }

  trygetCommands(query: string): T[] {
    try {
      return this.getCommands(query);
    } catch (e) {
      this.app.console.error(`Error in ${this.constructor.name}.getCommands`, e);
      return [];
    }
  }

  tryrender(command: T, el: CommandItem<T>): Partial<CommandPaletteState> {
    try {
      return this.renderCommand(command, el);
    } catch (e) {
      this.app.console.error(`Error in ${this.constructor.name}.renderCommand`, e);
    }
    return {};
  }

  tryexecute(command: T, toState: CommandPaletteState): this {
    this.commandPalette.state = toState;
    try {
      this.executeCommand(command);
    } catch (e) {
      this.app.console.error(`Error in ${this.constructor.name}.executeCommand`, e);
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
        })
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
              : { d: levenshtein(lowerQuery, cb(item).toLowerCase()), item, index }
          )
          .filter(item => item.d < maxdiff) // Filter items within the max distance
          .sort((a, b) => a.d - b.d) // Sort by distance
          .map(item => (matchedIndices.add(item.index), item.item))
      )
      .flat();
  }

  addCommand(command: CommandReqired<AppType>): this {
    // Do not call this inside of DefaultCommandCategory it will cause infinite recursion
    if (!this.extraCMD) this._extraCMD = new DefaultCommandCategory<AppType>(this.app, this.commandPalette);
    this.extraCMD?._addCommand(command);
    return this;
  }

  addCommands(...commands: CommandReqired<AppType>[]): this {
    commands.forEach(command => this.addCommand(command));
    return this;
  }

  /**
   * Adds a new setting command to the command palette.
   *
   * This method allows you to incorporate a customizable setting into your application's command palette.
   * It accepts a callback function that receives a `CommandItem<Command<AppType>>` object,
   * which you can tailor by setting its properties and UI elements.
   * The flexibility of this approach supports dynamic and context-specific configuration of settings.
   *
   * @example
   * ```typescript
   * // Example: Adding a setting with a custom name, description, and a button
   * this.addSetting(setting => {
   *   setting
   *     .setName("Custom Setting")
   *     .setDescription("Description for the custom setting")
   *     .addButton(button => {
   *       button.setButtonText("Click Me").on("click", () => {
   *         // Perform some action when the button is clicked
   *       });
   *     });
   * });
   * ```
   *
   * @param cb - A callback function invoked with a `CommandItem<Command<AppType>>` object.
   *             Use this callback to configure the setting item's properties, such as name, description,
   *             and to add interactive UI components like buttons.
   *             The `CommandItem` provides methods including `setName`, `setDescription`, `addButton`, etc.
   * @returns The current instance (`this`) for method chaining, enabling fluent API style.
   */
  addSetting(cb: (setting: CommandItem<Command<AppType>>) => void): this {
    if (!this.extraCMD) this._extraCMD = new DefaultCommandCategory<AppType>(this.app, this.commandPalette);
    this.extraCMD?._addCommand({
      name: "",
      description: "",
      render: (command, item) => {
        cb(item);
        return {};
      },
    });
    return this;
  }

  /**
   * Adds multiple setting commands to the command palette.
   *
   * This method accepts a variable number of configuration functions, each of which
   * can customize a `CommandItem<Command<AppType>>`. It invokes the existing `addSetting`
   * method for each configuration, allowing batch addition of settings.
   *
   * @param settings - An array of callback functions, each accepting a `CommandItem<Command<AppType>>`.
   *                   These functions define individual settings by configuring properties such as name,
   *                   description, and UI elements.
   * @returns The current instance (`this`) to enable method chaining.
   *
   * @example
   * ```typescript
   * this.addSettings(
   *   setting => setting.setName("Setting One").setDescription("Description of Setting One"),
   *   setting => setting.setName("Setting Two").addButton(btn => btn.setButtonText("Click Me"))
   * );
   * ```
   */
  addSettings(...settings: Array<(setting: CommandItem<Command<AppType>>) => void>): this {
    if (!this.extraCMD) {
      this._extraCMD = new DefaultCommandCategory<AppType>(this.app, this.commandPalette);
    }
    settings.forEach(setting => this.addSetting(setting));
    return this;
  }
}

/**
 * Represents a UI item within a command palette, encapsulating its DOM elements,
 * state, and interaction logic.
 *
 * @template T - The type of the command represented by this item.
 * @template AppType - The type of the application, extending `App`.
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
  toState: CommandPaletteState;

  constructor(parent: HTMLElement, public command: T, private PaletteCat: CommandCategory<T, any>) {
    super(parent);
    this.highlight(PaletteCat.highlighter);
    this.toState = this.PaletteCat.commandPalette.state.update({});

    this.el.addEventListener("click", e => {
      e.stopPropagation(); // Prevent triggering the main click
      this.emit("click", e); // Emit click event
    });

    this.el.addEventListener("mousemove", e => {
      this.emit("mousemove", e); // Emit mouse move event
    });

    this.el.addEventListener("contextmenu", e => {
      e.stopPropagation(); // Prevent triggering the main click
      e.preventDefault(); // Prevent default context menu
      new Menu().next(menu => this.emit("contextmenu", e)).showAtMouseEvent(e); // Show custom context menu
      this.emit("contextmenu", e); // Emit context menu event
    });
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

class CategoryNavigator<AppType extends App> extends CommandCategory<CommandCategory<any, AppType>, AppType> {
  readonly name = "Quick access";
  readonly description = "List of all command categories";
  names: CommandCategory<any, AppType>[];

  onTrigger(context: CommandPaletteState): void {
    this.names = this.commandPalette.palettes;
  }
  getCommands(query: string): CommandCategory<any, AppType>[] {
    return this.getcompatible(query, this.names, category => category.name);
  }
  renderCommand(
    command: CommandCategory<any, AppType>,
    Item: CommandItem<CommandCategory<any, AppType>>
  ): Partial<CommandPaletteState> {
    Item.setTitle(command.name).setDescription(command.description);
    return { topCategory: command.constructor as any };
  }
  executeCommand(command: CommandCategory<any, AppType>): void {
    this.commandPalette.display();
  }
}

export class Command<AppType extends App> {
  public context: CommandPaletteState | null = null; // Context for the command execution
  constructor(
    public app: AppType,
    public name: string,
    public description: string,
    public action: (ctx: Command<AppType>) => void = ctx => {},
    public render: (
      command: Command<AppType>,
      item: CommandItem<Command<AppType>>
    ) => Partial<CommandPaletteState> = (command, item) => {
      item.setTitle(command.name).setDescription(command.description);
      return {};
    },
    public onTrigger = () => {},
    public getCommand?: (quary: string) => boolean // Optional method to get the command instance
  ) {}
}

export interface CommandReqired<AppType extends App> {
  name: string;
  description: string;
  action?: (ctx: Command<AppType>) => void;
  render?: (command: Command<AppType>, item: CommandItem<Command<AppType>>) => Partial<CommandPaletteState>;
  onTrigger?: () => void; // Optional method to trigger the command
  getCommand?: (quary: string) => boolean; // Optional method to get the command instance
}

export class DefaultCommandCategory<AppType extends App> extends CommandCategory<Command<AppType>, AppType> {
  readonly name: string = "Commands";
  readonly description: string =
    "Default command category for commands that do not fit into other categories";
  state: CommandPaletteState;

  onTrigger(context: CommandPaletteState): void {
    this.state = context;
    this.commands.forEach(cmd => {
      try {
        cmd.onTrigger();
      } catch (e) {
        this.app.console.error(`Error in command "${cmd.name}":`, e);
      }
    });
  }

  getCommands(query: string): Command<AppType>[] {
    this.commands.map(cmd => (cmd.context = this.state));
    return this.commands.filter(cmd =>
      cmd.getCommand ? cmd.getCommand(query) : cmd.name.toLowerCase().includes(query.toLowerCase())
    );
  }

  renderCommand(
    command: Command<AppType>,
    item: CommandItem<Command<AppType>>
  ): Partial<CommandPaletteState> {
    try {
      return command.render(command, item.setTitle(command.name).setDescription(command.description));
    } catch (e) {
      this.app.console.error(`Error rendering command "${command.name}":`, e);
      return {};
    }
  }

  executeCommand(command: Command<AppType>): void {
    try {
      command.action(command);
    } catch (e) {
      this.app.console.error(`Error executing command "${command.name}":`, e);
    }
  }

  _addCommand({ name, description, action, render, onTrigger, getCommand }: CommandReqired<AppType>) {
    const temp = new Command<AppType>(this.app, "Error", "Error this command is not defined properly");
    this.commands.push(new Command(this.app, name, description, action, render, onTrigger, getCommand));
    return this;
  }
}

class PromptCategory<AppType extends App> extends CommandCategory<string, AppType> {
  readonly name = "Prompt";
  readonly description = "Prompt for user input";
  private _prompt: string = "";
  siblings = [];
  cb: (prompt: string | null) => void;
  wasopen: boolean;
  currentTopCategory:
    | (new (app: AppType, palette: UnifiedCommandPalette<AppType, any>) => CommandCategory<any, AppType, {}>)
    | null;

  constructor(public app: AppType, UnifiedCommandPalette: UnifiedCommandPalette<AppType, any>) {
    super(app, UnifiedCommandPalette);
    UnifiedCommandPalette;
  }

  show(cb: (prompt: string | null) => void = () => {}, text: string): void {
    this.cb = cb;
    this._prompt = text;
    this.wasopen = this.commandPalette.isOpen;
    this.currentTopCategory = this.commandPalette.state.topCategory; // Save current top category
    this.commandPalette.display({ topCategory: PromptCategory });
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

  onTrigger(context: CommandPaletteState): void {}

  getCommands(query: string): string[] {
    return [this._prompt, "Ok", "Cancel"];
  }

  renderCommand(command: string, Item: CommandItem<string>): Partial<CommandPaletteState> {
    Item.setTitle(command);
    return { topCategory: this.currentTopCategory };
  }

  executeCommand(command: string): void {
    this.cleanup(); // Cleanup on cancel
    if (command === "Ok") {
      this.app.console.log("Prompt accepted:", this.commandPalette.state.query);
      this.cb(this.commandPalette.state.query);
    } else if (command === "Cancel") {
      this.app.console.log("Prompt cancelled");
      this.cb(null);
    }
  }

  cleanup() {
    this.commands = []; // Clear commands on cleanup
    this.commandPalette.off("close", this.invokeCallbackOnClose); // Remove event listener
    if (!this.wasopen) this.commandPalette.close(); // Close palette if it was not open before
    else this.commandPalette.display({ topCategory: this.currentTopCategory }); // Restore previous context
  }
}
