import { ChevronRight, ChevronsDownUp, ChevronsUpDown, IconNode, Library, X } from "lucide";
import { App, Highlighter } from "./App";
import "./CommandPalette.css";
import levenshtein from "js-levenshtein";

type inputMode = "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url";

/**
 * Abstract base class for implementing a Command Palette UI component.
 *
 * The CommandPalette provides a searchable, navigable interface for executing commands,
 * switching contexts, and managing categories of commands within an application.
 *
 * @template AppType - The application type, extending the base App class.
 *
 * @remarks
 * - Handles UI rendering, keyboard navigation, category management, and context stack.
 * - Supports dynamic command filtering, submenus, and mobile viewport adjustments.
 * - Designed to be extended for specific application needs.
 *
 * @typeParam AppType - The application type, must extend App.
 *
 * @property state - The current state of the command palette.
 * @property isOpen - Indicates whether the palette is currently open.
 * @property inputMode - The current input mode for the search field.
 * @property length - The number of command items currently available.
 *
 * @constructor
 * @param app - The application instance.
 *
 * @method addPalette - Adds a new command category (palette) to the palette.
 * @method open - Opens the command palette with an optional context.
 * @method close - Closes the command palette and resets state.
 * @method handleBack - Navigates back in the context stack or closes the palette.
 *
 * @protected
 * @method display - Renders the palette UI for a given context.
 * @method render - Filters and displays commands based on the current query and context.
 * @method moveSelection - Moves the keyboard selection up or down.
 * @method selectIndex - Selects a command item by index.
 * @method updateSelection - Updates the UI to reflect the current selection.
 * @method activateSelected - Executes the currently selected command.
 *
 * @private
 * @method handleScroll - Handles scroll events for loading more results.
 * @method handleOutsideClick - Handles clicks outside the palette to close it.
 * @method handleMobileResize - Adjusts the palette for mobile viewport changes.
 * @method gosubmenu - Navigates to a submenu for a command item.
 * @method checkclose - Cleans up and removes the palette from the DOM.
 *
 * @example
 * // Example usage in an application:
 * class MyCommandPalette extends CommandPalette<MyApp> {
 *   // Implement abstract members and add custom palettes
 * }
 */
export abstract class CommandPalette<AppType extends App> {
  abstract state: CommandPaletteState<AppType>; // State of the command palette
  private categories: CommandPaletteCategory<any, AppType>[] = [];
  private containerEl: HTMLElement | null = null;

  private paletteEl!: HTMLElement;
  private searchInputEl!: HTMLInputElement;
  private contentEl!: HTMLElement;

  private commandItems: CommandPaletteItem<any, AppType>[] = [];
  private selectedIndex = -1;
  private selectedEl: HTMLElement;
  private contexts: CommandPaletteState<AppType>[] = []; // Stack of contexts for back navigation
  private defaultContext: any;
  inputMode: inputMode = "search"; // Default input type
  private headerEl: HTMLDivElement;
  private maxResults: number = 100; // Maximum results to show
  isOpen: boolean = false;
  get length(): number {
    return this.commandItems.length;
  }

  constructor(private app: AppType) {
    this.app.console.log("CommandPalette initialized");
    this.addPalette(ListOfPalettes); // Add default category for listing all palettes
  }

  get palettes(): CommandPaletteCategory<any, AppType>[] {
    return this.categories.slice(1); // Exclude the ListOfPalettes category
  }

  // Add category (class constructor or instance)
  addPalette<T extends CommandPaletteCategory<any, AppType>>(
    category: new (app: AppType, palette: CommandPalette<AppType>) => T | T
  ) {
    const instance = typeof category === "function" ? new category(this.app, this) : category;
    this.categories.push(instance);
    return this;
  }

  addPalettereturns<T extends CommandPaletteCategory<any, AppType>>(
    category: new (app: AppType, palette: CommandPalette<AppType>) => T | T
  ) {
    const instance = typeof category === "function" ? new category(this.app, this) : category;
    this.categories.push(instance);
    return instance;
  }

  // Open and initialize palette UI
  open(context: Partial<CommandPaletteState<AppType>> = {}) {
    this.app.console.log("Opening Command Palette with context:", context);
    this.contexts = [];
    this.defaultContext = context;
    this.isOpen = true;
    this.display(context);
  }

  display(context: Partial<CommandPaletteState<AppType>> = {}) {
    this.state = this.state.update(context);
    this.app.historyPush({
      name: "Command Palette",
    });
    this.contexts.push(this.state);
    this.inputMode = "search";
    this.checkclose();

    // Trigger data fetching for categories
    this.categories.forEach(cat => cat.tryTrigger(this.state));

    this.containerEl = this.app.contentEl.createEl("div", { cls: "command-palette" });
    this.handleMobileResize();

    this.paletteEl = this.containerEl.createEl("div", { cls: "palette" });
    this.headerEl = this.paletteEl.createEl("div", { cls: "palette-header" });

    this.headerEl.createEl("button", {}, el => {
      el.setIcon(Library);
      el.addEventListener("click", e => {
        e.stopPropagation(); // Prevent bubbling to document
        this.display({ _topCategory: "" }); // Show the list at the top level
      });
    });

    this.headerEl.createEl("button", {}, el => {
      el.setIcon(this.state.expanded ? ChevronsDownUp : ChevronsUpDown);
      el.addEventListener("click", e => {
        e.stopPropagation(); // Prevent bubbling to document
        this.state.expanded = !this.state.expanded;
        this.contentEl.classList.toggle("expanded", this.state.expanded);
        el.empty();
        el.setIcon(this.state.expanded ? ChevronsDownUp : ChevronsUpDown);
      });
    });

    this.headerEl.createEl("button", {}, el => {
      el.addEventListener("click", e => {
        e.stopPropagation();
        this.close();
      });
      return el.setIcon(X);
    });

    this.searchInputEl = this.paletteEl.createEl(
      "input",
      {
        placeholder: "Search commands...",
        type: "search",
        cls: "palette-search",
      },
      el => {
        el.inputMode = this.inputMode;

        el.addEventListener("input", () => {
          this.state.query = el.value;
          this.state.maxResults = this.maxResults;
          this.render();
        });

        // Keyboard navigation
        el.addEventListener("keydown", e => {
          e.stopPropagation(); // Prevent bubbling to document
          const key =
            (e.metaKey ? "Meta+" : "") + // Meta is the command key on macOS, Windows key on Windows, and Super key on Linux
            (e.ctrlKey ? "Ctrl+" : "") +
            (e.altKey ? "Alt+" : "") +
            (e.shiftKey ? "Shift+" : "") +
            e.key;
          switch (key) {
            case "ArrowDown":
              e.preventDefault();
              this.moveSelection(1);
              break;
            case "ArrowUp":
              e.preventDefault();
              this.moveSelection(-1);
              break;
            case "Enter":
              e.preventDefault();
              this.activateSelected();
              break;
            case "Escape":
              e.preventDefault();
              this.close();
              break;
            case "ArrowRight":
            case "Tab":
              e.preventDefault();
              this.gosubmenu(this.commandItems[this.selectedIndex]);
              break;
            case "ArrowLeft":
            case "Shift+Tab":
              e.preventDefault();
              this.contexts.pop();
              this.display(this.contexts.pop() || this.defaultContext); // Open previous context
              break;
          }
        });
      }
    );
    this.contentEl = this.paletteEl.createEl("div", { cls: "palette-content" }, el => {
      el.classList.toggle("expanded", this.state.expanded);
    });

    this.state.query = ""; //  Reset query on open
    this.render(); // initial load
    this.searchInputEl.focus();

    // Outside click closes palette
    document.addEventListener("click", this.handleOutsideClick);
  }

  private handleScroll = () => {
    window.requestAnimationFrame(() => {
      if (this.state.maxResults < 1000) {
        this.state.maxResults = 1000; // Load more results
        this.render();
      }
    });
  };

  private handleOutsideClick = (e: MouseEvent) => {
    if (this.containerEl && !this.containerEl.contains(e.target as Node)) this.close();
    else this.searchInputEl.focus();
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

  private gosubmenu(command: CommandPaletteItem<any, AppType>) {
    this.display(command.toState);
  }

  handleBack = () => {
    if (this.contexts.length > 1) {
      this.contexts.pop(); // Remove current context
      this.display(this.contexts.pop() || this.defaultContext); // Display previous context
    } else {
      this.close(); // Close if no previous context
    }
  };

  private checkclose() {
    if (this.containerEl) {
      this.containerEl.remove();
      this.containerEl = null;
    }
    document.removeEventListener("click", this.handleOutsideClick);
  }

  close() {
    if (this.containerEl) {
      this.containerEl.remove();
      this.containerEl = null;
    }
    this.state = this.state.update({ query: "", maxResults: 100, _topCategory: "" });
    this.contexts = [];
    this.isOpen = false;
    document.removeEventListener("click", this.handleOutsideClick);
  }

  // Filter and show commands based on query
  private render() {
    if (!this.containerEl) return;

    const { contentEl, state } = this;
    contentEl.empty();
    contentEl.scroll(0, 0); // Scroll to top
    contentEl.removeEventListener("scroll", this.handleScroll);
    contentEl.addEventListener("scroll", this.handleScroll, {
      passive: true,
      once: true,
    });
    this.commandItems = [];
    this.selectedIndex = 0;
    const categoriesToShow = state.topCategory
      ? [state.topCategory, ...this.categories.filter(cat => cat !== state.topCategory)]
      : this.categories;

    categoriesToShow.forEach((cat, index) => {
      if (this.commandItems.length > state.maxResults) return;
      cat.setUp(state);
      const commands = cat.trygetCommands(state.query);
      const catEl = contentEl.createEl("div", { cls: "category" });
      if (commands.length !== 0 || state.topCategory === cat)
        catEl.createEl("div", { text: cat.title, cls: "category-title" }, el =>
          el.addEventListener("click", e => {
            e.stopPropagation();
            this.display({ _topCategory: cat.constructor.name });
          })
        );

      for (const command of commands) {
        if (this.commandItems.length > state.maxResults) return;
        const cmdindex = this.commandItems.length;
        const itemEl = new CommandPaletteItem(this.app, catEl, command, cat)
          .onClick(() => cat.tryexecute(command, itemEl.toState))
          .onMouseEnter(() => this.selectIndex(cmdindex))
          .onTouchStart(() => this.selectIndex(cmdindex))
          .onSubClick(() => this.gosubmenu(this.commandItems[cmdindex]));
        itemEl.toState = state.update(cat.tryrender(command, itemEl));
        this.commandItems.push(itemEl);
      }
    });
    this.updateSelection();
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
    this.commandItems.forEach((item, idx) => {
      item.el.classList.toggle("selected", idx === this.selectedIndex);
    });
    this.selectedEl = this.commandItems[this.selectedIndex]?.el || this.selectedEl;
    if (scroll) {
      this.selectedEl.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }
  }

  private activateSelected() {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.commandItems.length)
      this.selectedEl.click(); // Trigger click on the selected item
  }
}

/**
 * Represents the state of a command palette, including the current query,
 * the maximum number of results to display, and the currently selected top category.
 *
 * @typeParam AppType - The type of the application instance.
 */
export class CommandPaletteState<AppType extends App> {
  maxResults: number = 100; // Maximum results to show
  expanded: boolean = false; // Whether the palette items are expanded
  topCategory: CommandPaletteCategory<any, App> | null = null; // Top category to display, if any
  constructor(public app: App, public query: string = "", public _topCategory: string = "") {}
  update(partial: Partial<CommandPaletteState<AppType>> = {}): CommandPaletteState<AppType> {
    return Object.assign(Object.create(this), this, partial).updateTopCategory();
  }
  updateTopCategory() {
    this.topCategory = this._topCategory ? this.app.getPaletteByName(this._topCategory) : null;
    return this;
  }
}

/**
 * Abstract base class representing a category within a command palette.
 *
 * This class defines the structure and behavior for command palette categories,
 * including command management, UI integration, highlighting, and error handling.
 * Subclasses must implement abstract methods to provide category-specific logic.
 *
 * @typeParam T - The type representing a command in this category.
 * @typeParam AppType - The application type, extending the base `App`.
 *
 * @property name - The unique name of the category (to be implemented by subclass).
 * @property title - The display title for the category, used in the UI.
 * @property icon - The icon representing the category (to be implemented by subclass).
 * @property highlighter - The highlighter instance used for query highlighting.
 * @property hili - The highlight function bound to the highlighter.
 * @property query - The current query string for filtering commands.
 * @property app - The application instance associated with this category.
 *
 * @constructor
 * @param app - The application instance.
 *
 * @method setUp - Initializes the category with the current command palette state and sets up highlighting.
 * @method onTrigger - Abstract method to handle when the category is triggered.
 * @method getCommands - Abstract method to retrieve commands matching a query.
 * @method renderCommand - Abstract method to render a command in the UI.
 * @method executeCommand - Abstract method to execute a command.
 * @method tryTrigger - Safely triggers the category, catching and logging errors.
 * @method trygetCommands - Safely retrieves commands, catching and logging errors.
 * @method tryrender - Safely renders a command, catching and logging errors.
 * @method tryexecute - Safely executes a command and updates state, catching and logging errors.
 * @method getcompatible - Filters an array of items by query using provided criteria functions.
 * @method getcompatibleWithLevenshtein - Filters and sorts items by similarity to the query using Levenshtein distance.
 */
export abstract class CommandPaletteCategory<T, AppType extends App> {
  abstract readonly name: string;
  title: string; // Title for the category, can be used in UI
  protected _commands: T[] = [];
  highlighter: Highlighter; // Highlighter for the category
  hili: Highlighter["highlight"]; // Function to highlight text
  query: string;

  constructor(public app: AppType) {}

  setUp(state: CommandPaletteState<AppType>): this {
    this.highlighter = new Highlighter([
      {
        regEXP: new RegExp(`(${state.query || "this will never match"})`, "ig"),
        cls: "highlighted-query",
      },
    ]);
    this.hili = this.highlighter.highlight.bind(this.highlighter);
    this.query = state.query;
    return this;
  }
  abstract onTrigger(state: CommandPaletteState<AppType>): void;
  abstract getCommands(query: string): T[];
  abstract renderCommand(
    command: T,
    el: CommandPaletteItem<T, AppType>
  ): Partial<CommandPaletteState<AppType>>;
  abstract executeCommand(command: T): void;
  tryTrigger(context: CommandPaletteState<AppType>): this {
    this.title = this.name;
    try {
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
  tryrender(command: T, el: CommandPaletteItem<T, AppType>): Partial<CommandPaletteState<AppType>> {
    try {
      return this.renderCommand(command, el);
    } catch (e) {
      this.app.console.error(`Error in ${this.constructor.name}.renderCommand`, e);
    }
    return {};
  }
  tryexecute(command: T, toState: CommandPaletteState<AppType>): this {
    this.app.commandPalette.state = toState;
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
  getcompatibleWithLevenshtein<T>(
    query: string,
    array: T[],
    ...criteria: ((item: T) => string)[]
  ): T[] {
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
}

/**
 * Represents an item in the command palette UI.
 *
 * @template T - The type of the command associated with this item.
 * @template AppType - The type of the application, extending `App`.
 *
 * This class is responsible for rendering and managing a single command palette item,
 * including its title, description, subsearch indicator, and event handlers for user interaction.
 *
 * @property el - The root HTML element for the command item.
 * @property infoEl - The container element for the title and description.
 * @property titleEl - The element displaying the command's title.
 * @property descriptionEl - The element displaying the command's description.
 * @property subEl - The element indicating the presence of a subsearch.
 * @property hasSubsearch - Whether this item has a subsearch option.
 * @property toState - The state transition object for the command palette.
 * @property app - The application instance.
 * @property command - The command data associated with this item.
 * @property PaletteCat - The command palette category for this item.
 *
 * @constructor
 * @param app - The application instance.
 * @param parent - The parent HTML element to which this item will be appended.
 * @param command - The command data associated with this item.
 * @param PaletteCat - The command palette category for this item.
 *
 * @method setSubsearch - Sets whether the item has a subsearch and updates the UI.
 * @method setTitle - Sets the title of the command item, with optional highlighting.
 * @method setDescription - Sets the description of the command item, with optional highlighting.
 * @method setHidden - Shows or hides the description element.
 * @method onClick - Registers a click event handler for the item.
 * @method onMouseEnter - Registers a mousemove event handler for the item.
 * @method onTouchStart - Registers a touchstart event handler for the item.
 * @method onSubClick - Registers a click event handler for the subsearch element.
 */
export class CommandPaletteItem<T, AppType extends App> {
  el: HTMLElement;
  private infoEl: HTMLElement;
  private titleEl: HTMLElement;
  private descriptionEl: HTMLElement;
  private subEl: HTMLElement;
  private hasSubsearch: boolean = false;
  toState: CommandPaletteState<AppType>;

  constructor(
    private app: AppType,
    parent: HTMLElement,
    public command: T,
    private PaletteCat: CommandPaletteCategory<T, any>
  ) {
    this.toState = this.app.commandPalette.state.update({});
    parent.createEl("div", { cls: "command-item" }, itemEl => {
      this.el = itemEl;
      this.infoEl = itemEl.createEl("div", { cls: "command-item-info" }, infoEl => {
        this.titleEl = infoEl.createEl("div", { cls: "command-title" });
        this.descriptionEl = infoEl.createEl("div", { cls: ["command-description", "hidden"] });
      });
      this.subEl = itemEl.createEl("div", { cls: "command-subsearch" }, subEl => {
        subEl.style.display = this.hasSubsearch ? "flex" : "none";
        subEl.setIcon(ChevronRight);
      });
    });
  }
  setSubsearch(hasSubsearch: boolean) {
    this.hasSubsearch = hasSubsearch;
    this.subEl.style.display = hasSubsearch ? "flex" : "none";
    return this;
  }
  setTitle(title: string | DocumentFragment) {
    this.titleEl.replaceChildren(typeof title === "string" ? this.PaletteCat.hili(title) : title);
    return this;
  }
  setDescription(text: string | DocumentFragment) {
    this.descriptionEl.replaceChildren(
      typeof text === "string" ? this.PaletteCat.hili(text) : text
    );
    return this;
  }
  setHidden(hide: boolean) {
    this.descriptionEl.classList.toggle("hidden", hide);
  }
  onClick(callback: (e?: MouseEvent) => void) {
    this.el.addEventListener("click", e => {
      e.stopPropagation(); // Prevent triggering the main click
      callback(e);
    });
    return this;
  }
  onMouseEnter(callback: (e?: MouseEvent) => void) {
    this.el.addEventListener("mousemove", callback);
    return this;
  }
  onTouchStart(callback: (e?: TouchEvent) => void) {
    this.el.addEventListener("touchstart", callback);
    return this;
  }
  onSubClick(callback: (e?: MouseEvent) => void) {
    this.subEl?.addEventListener("click", e => {
      e.stopPropagation(); // Prevent triggering the main click
      callback(e);
    });
    return this;
  }
}

class ListOfPalettes<AppType extends App> extends CommandPaletteCategory<string, AppType> {
  readonly name = "Quick Access";
  list: string[] = [];
  names: { [x: string]: CommandPaletteCategory<any, App> };

  onTrigger(context: CommandPaletteState<AppType>): void {
    this.list = this.app.commandPalette.palettes.map(category => category.constructor.name);
    this.names = this.app.commandPalette.palettes.reduce((acc, category) => {
      acc[category.constructor.name] = category;
      return acc;
    }, {});
  }
  getCommands(query: string): string[] {
    return this.getcompatible(query, this.list, category => category);
  }
  renderCommand(
    command: string,
    Item: CommandPaletteItem<string, AppType>
  ): Partial<CommandPaletteState<AppType>> {
    Item.setTitle(this.names[command].name.toString().toTitleCase()).setSubsearch(false);
    //Item.
    return { _topCategory: this.names[command].constructor.name };
  }
  executeCommand(command: string): void {
    this.app.commandPalette.display();
  }
}

class Command<AppType extends App> {
  constructor(
    public name: string,
    public description: string,
    public action: (ctx: CommandContext<AppType>) => void,
    public prerender: (
      ctx: CommandContext<AppType>
    ) => Partial<CommandPaletteState<AppType>> = () => ({})
  ) {}
}

class CommandContext<AppType extends App> {
  command: Command<AppType>;
  item?: CommandPaletteItem<Command<AppType>, AppType>;
  app: AppType;
  context: CommandPaletteState<AppType>;
}

export class RealCommandPaletteCategory<AppType extends App> extends CommandPaletteCategory<
  Command<AppType>,
  AppType
> {
  readonly name: string = "Real Commands";
  commands: Command<AppType>[] = [];
  bktitle: string;

  onTrigger(context: CommandPaletteState<AppType>): void {
    this.title = this.bktitle;
  }

  getCommands(query: string): Command<AppType>[] {
    return this.getcompatible(
      query,
      this.commands,
      cmd => cmd.name,
      cmd => cmd.description
    );
  }

  renderCommand(
    command: Command<AppType>,
    item: CommandPaletteItem<Command<AppType>, AppType>
  ): Partial<CommandPaletteState<AppType>> {
    try {
      const state = command.prerender({
        command,
        item,
        app: this.app,
        context: this.app.commandPalette.state,
      });
      item.setTitle(command.name).setDescription(command.description).setSubsearch(false);
      return state;
    } catch (e) {
      this.app.console.error(`Error rendering command "${command.name}":`, e);
      return {};
    }
  }

  executeCommand(command: Command<AppType>): void {
    command.action({ command, app: this.app, context: this.app.commandPalette.state });
  }

  addCommand({ name, description, action, prerender }: Command<AppType>) {
    this.commands.push(new Command(name, description, action, prerender));
    return this;
  }

  setTitle(title: string): this {
    this.bktitle = title;
    return this;
  }
}
