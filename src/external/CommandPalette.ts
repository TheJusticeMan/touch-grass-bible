import levenshtein from "js-levenshtein";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Library, X } from "lucide";
import { App, Highlighter } from "./App";
import "./CommandPalette.css";
import { ETarget } from "./Event";
import { escapeRegExp } from "./escapeRegExp";
import { translation } from "../VerseRef";

type inputMode = "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url";

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
export abstract class UnifiedCommandPalette<AppType extends App> extends ETarget {
  abstract state: CommandPaletteState<AppType>; // State of the command palette
  private categories: CommandCategory<any, AppType>[] = [];
  private containerEl: HTMLElement | null = null;

  private paletteEl!: HTMLElement;
  private searchInputEl!: HTMLInputElement;
  private contentEl!: HTMLElement;

  private commandItems: CommandItem<any, AppType>[] = [];
  private selectedIndex = -1;
  private contexts: CommandPaletteState<AppType>[] = []; // Stack of contexts for back navigation
  inputMode: inputMode = "search"; // Default input type
  private headerEl: HTMLDivElement;
  private maxResults: number = 100; // Maximum results to show
  isOpen: boolean = false;
  constructor(private app: AppType) {
    super();
    this.app.console.log("CommandPalette initialized");
    this.addPalette(CategoryNavigator); // Add default category for listing all palettes
    this.on("keydown", this.handleKey);
    this.on("historypop", this.handleBack);
  }

  prompt(text: string): Promise<string | null> {
    let resolveFn: (value: string | null) => void;
    const resOnClose = () => resolveFn(null);
    const promptPromise = new Promise<string | null>(resolve => {
      resolveFn = resolve;
    });
    this.categories.push(
      new PromptCategory(this.app, (text: string | null) => {
        resolveFn(text);
        this.categories.pop(); // Remove the prompt category after resolving
        this.off("close", resOnClose); // Remove the close handler
        this.close(); // Close the palette after resolving
      })
    );
    this.display({ query: text, topCategory: PromptCategory });
    this.on("close", resOnClose); // Ensure the prompt category is removed on close
    return promptPromise;
  }

  confirm(text: string): Promise<boolean> {
    return this.prompt(text).then(result => result !== null);
  }

  get length(): number {
    return this.commandItems.length;
  }

  get topCategory(): CommandCategory<any, AppType> {
    return this.categories.find(cat => cat.constructor === this.state.topCategory) || this.categories[0];
  }

  get palettes(): CommandCategory<any, AppType>[] {
    return this.categories.slice(1); // Exclude the ListOfPalettes category
  }

  get selCMD(): CommandItem<any, AppType> | null {
    return this.commandItems[this.selectedIndex] || null; // Return the currently selected command item or null if none
  }

  // Add category (class constructor or instance)
  addPalette<T extends CommandCategory<any, AppType>>(
    category: new (app: AppType, palette: UnifiedCommandPalette<AppType>) => T | T
  ) {
    const instance = typeof category === "function" ? new category(this.app, this) : category;
    this.categories.push(instance);
    return this;
  }

  addPalettereturns<T extends CommandCategory<any, AppType>>(
    category: new (app: AppType, palette: UnifiedCommandPalette<AppType>) => T | T
  ) {
    const instance = typeof category === "function" ? new category(this.app, this) : category;
    this.categories.push(instance);
    return instance;
  }

  // Open and initialize palette UI
  open(context: Partial<CommandPaletteState<AppType>> = {}) {
    this.emit("open", context);
    this.contexts = [];
    this.isOpen = true;
    this.display(context);
  }

  display(context: Partial<CommandPaletteState<AppType>> = {}) {
    this.state = this.state.update(context);
    this.emit("display", this.state);
    this.app.historyPush();
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
        this.display({ topCategory: null }); // Show the list at the top level
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
        placeholder: `Search ${this.state.topCategory ? this.topCategory.title : "all"}...`,
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
        const currentselection = this.selectedIndex;
        this.render();
        this.selectIndex(currentselection, true); // Restore selection after rendering
        if (this.commandItems.length > this.state.maxResults)
          new CommandItem(this.app, this.contentEl, null, this.topCategory)
            .setTitle("Are you kidding me?")
            .setDescription("Seriously, you want to load more results?") // Just a joke;
            .setHidden(false)
            .onClick(() => {
              this.state.maxResults = 100000;
              this.render();
            });
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
      case "Escape":
        this.close();
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

  private ActivateContextFromCommand(command: CommandItem<any, AppType>) {
    if (command.contextMenuAllowed) this.display(command.toState);
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
    this.searchInputEl.value = value;
    if (select) this.searchInputEl.select();

    this.state.query = value;
    this.state.maxResults = this.maxResults;
    this.render();
  }

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
    this.state = this.state.update({ query: "", maxResults: 100, topCategory: null });
    this.contexts = [];
    this.isOpen = false;
    document.removeEventListener("click", this.handleOutsideClick);
    this.emit("close", this.state);
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
      ? [this.topCategory, ...this.categories.filter(cat => cat.constructor !== state.topCategory)]
      : this.categories;

    categoriesToShow.forEach((cat, index) => {
      if (this.commandItems.length > state.maxResults) return;
      cat.setUp(state);
      const commands = cat.trygetCommands(state.query);
      const catEl = contentEl.createEl("div", { cls: "category" });
      if (commands.length !== 0 || state.topCategory === cat.constructor)
        catEl.createEl("div", { text: cat.title, cls: "category-title" }, el =>
          el.addEventListener("click", e => {
            e.stopPropagation();
            this.display({ topCategory: cat.constructor });
          })
        );

      for (const command of commands) {
        if (this.commandItems.length > state.maxResults) return;
        const cmdindex = this.commandItems.length;
        const itemEl = new CommandItem(this.app, catEl, command, cat)
          .onClick(() => cat.tryexecute(command, itemEl.toState))
          .onMouseEnter(() => this.selectIndex(cmdindex))
          .onContextMenu(() => this.ActivateContextFromCommand(this.commandItems[cmdindex]));
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
export class CommandPaletteState<AppType extends App> extends ETarget {
  maxResults: number = 100; // Maximum results to show
  expanded: boolean = false; // Whether the palette items are expanded
  defaultTranslation: translation = "KJV"; // Default translation for Bible references
  constructor(public app: App, public query: string = "", public topCategory: Function | null = null) {
    super();
  }
  update(partial: Partial<CommandPaletteState<AppType>> = {}): CommandPaletteState<AppType> {
    this.emit("update", partial);
    return Object.assign(Object.create(this), this, partial);
  }
}

/**
 * Abstract base class representing a category of commands for a command palette.
 *
 * @template T - The type of command handled by this category.
 * @template AppType - The type of the application context, extending `App`.
 *
 * @property {string} name - The unique name of the command category.
 * @property {string} title - The display title for the category, used in the UI.
 * @property {T[]} _commands - The list of commands in this category.
 * @property {Highlighter} highlighter - The highlighter instance used for highlighting query matches.
 * @property {Highlighter["highlight"]} hili - The highlight function bound to the highlighter.
 * @property {string} query - The current query string for filtering commands.
 * @property {AppType} app - The application context.
 *
 * @constructor
 * @param {AppType} app - The application context.
 *
 * @method setUp - Initializes the category with the current command palette state and sets up highlighting.
 * @method onTrigger - Abstract method called when the category is triggered.
 * @method getCommands - Abstract method to retrieve commands matching a query.
 * @method renderCommand - Abstract method to render a command item.
 * @method executeCommand - Abstract method to execute a command.
 * @method tryTrigger - Safely triggers the category, catching and logging errors.
 * @method trygetCommands - Safely retrieves commands, catching and logging errors.
 * @method tryrender - Safely renders a command, catching and logging errors.
 * @method tryexecute - Safely executes a command, catching and logging errors.
 * @method getcompatible - Filters an array of items by query using provided criteria functions.
 * @method getcompatibleWithLevenshtein - Filters an array of items by query using Levenshtein distance for fuzzy matching.
 */
export abstract class CommandCategory<T, AppType extends App> {
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
        regEXP: new RegExp(`(${escapeRegExp(state.query) || "this will never match"})`, "ig"),
        cls: "highlighted-query",
      },
      { regEXP: /\n/g, elTag: "br" },
    ]);
    this.hili = this.highlighter.highlight.bind(this.highlighter);
    this.query = state.query;
    return this;
  }
  abstract onTrigger(state: CommandPaletteState<AppType>): void;
  abstract getCommands(query: string): T[];
  abstract renderCommand(command: T, el: CommandItem<T, AppType>): Partial<CommandPaletteState<AppType>>;
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
  tryrender(command: T, el: CommandItem<T, AppType>): Partial<CommandPaletteState<AppType>> {
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
 *   .setTitle("My Command")
 *   .setDescription("Does something useful")
 *   .setContextMenuVisibility(true)
 *   .onClick(() => { /* handle click *\/ });
 * ```
 *
 * @see CommandCategory
 * @see CommandPaletteState
 */
export class CommandItem<T, AppType extends App> {
  el: HTMLElement;
  private infoEl: HTMLElement;
  private titleEl: HTMLElement;
  private descriptionEl: HTMLElement;
  private contextMenuLauncher: HTMLElement;
  private allowsContextMenu: boolean = false;
  toState: CommandPaletteState<AppType>; // for context menu and state management

  constructor(
    private app: AppType,
    parent: HTMLElement,
    public command: T,
    private PaletteCat: CommandCategory<T, any>
  ) {
    this.toState = this.app.commandPalette.state.update({});
    parent.createEl("div", { cls: "command-item" }, itemEl => {
      this.el = itemEl;
      this.infoEl = itemEl.createEl("div", { cls: "command-item-info" }, infoEl => {
        this.titleEl = infoEl.createEl("div", { cls: "command-title" });
        this.descriptionEl = infoEl.createEl("div", { cls: ["command-description", "hidden"] });
      });
      this.contextMenuLauncher = itemEl.createEl(
        "div",
        { cls: "command-submenu-button" },
        contextMenuElement => {
          contextMenuElement.style.display = this.allowsContextMenu ? "flex" : "none";
          contextMenuElement.setIcon(ChevronRight);
        }
      );
    });
  }
  setContextMenuVisibility(allowsContextMenu: boolean) {
    this.allowsContextMenu = allowsContextMenu;
    this.contextMenuLauncher.style.display = allowsContextMenu ? "flex" : "none";
    return this;
  }
  get contextMenuAllowed() {
    return this.allowsContextMenu;
  }
  setTitle(title: string | DocumentFragment) {
    this.titleEl.replaceChildren(typeof title === "string" ? this.PaletteCat.hili(title) : title);
    return this;
  }
  setDescription(text: string | DocumentFragment) {
    this.descriptionEl.replaceChildren(typeof text === "string" ? this.PaletteCat.hili(text) : text);
    return this;
  }
  setHidden(hide: boolean) {
    this.descriptionEl.classList.toggle("hidden", hide);
    return this;
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
  onContextMenu(callback: (e?: MouseEvent) => void) {
    this.contextMenuLauncher?.addEventListener("click", e => {
      e.stopPropagation(); // Prevent triggering the main click
      callback(e);
    });
    return this;
  }
}

class CategoryNavigator<AppType extends App> extends CommandCategory<CommandCategory<any, App>, AppType> {
  readonly name = "Quick Access";
  names: CommandCategory<any, App>[];

  onTrigger(context: CommandPaletteState<AppType>): void {
    this.names = this.app.commandPalette.palettes;
  }
  getCommands(query: string): CommandCategory<any, App>[] {
    return this.getcompatible(query, this.names, category => category.name);
  }
  renderCommand(
    command: CommandCategory<any, App>,
    Item: CommandItem<CommandCategory<any, App>, AppType>
  ): Partial<CommandPaletteState<AppType>> {
    Item.setTitle(command.name).setContextMenuVisibility(false);
    return { topCategory: command.constructor };
  }
  executeCommand(command: CommandCategory<any, App>): void {
    this.app.commandPalette.display();
  }
}

export class Command<AppType extends App> {
  public context: CommandPaletteState<AppType> | null = null; // Context for the command execution
  constructor(
    public app: AppType,
    public name: string,
    public description: string,
    public action: (ctx: Command<AppType>) => void = ctx => {},
    public render: (
      command: Command<AppType>,
      item: CommandItem<Command<AppType>, AppType>
    ) => Partial<CommandPaletteState<AppType>> = (command, item) => {
      item.setTitle(command.name).setDescription(command.description).setContextMenuVisibility(false);
      return {};
    },
    public onTrigger = () => {},
    public getCommand: ((quary: string) => boolean) | null = null // Optional method to get the command instance
  ) {}
}

export class DefaultCommandCategory<AppType extends App> extends CommandCategory<Command<AppType>, AppType> {
  readonly name: string = "Commands";
  commands: Command<AppType>[] = [];

  onTrigger(context: CommandPaletteState<AppType>): void {
    this.commands.forEach(cmd => {
      try {
        cmd.onTrigger();
      } catch (e) {
        this.app.console.error(`Error in command "${cmd.name}":`, e);
      }
    });
  }

  getCommands(query: string): Command<AppType>[] {
    const commands: Command<AppType>[] = [];
    for (const cmd of this.commands) {
      cmd.context = this.app.commandPalette.state;
      if (cmd.getCommand) cmd.getCommand(query) ? commands.push(cmd) : "";
      else if (cmd.name.toLowerCase().includes(query.toLowerCase())) commands.push(cmd);
    }
    return commands;
  }

  renderCommand(
    command: Command<AppType>,
    item: CommandItem<Command<AppType>, AppType>
  ): Partial<CommandPaletteState<AppType>> {
    try {
      item.setTitle(command.name).setDescription(command.description);
      return command.render(command, item);
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

  addCommand({ name, description, action, render, onTrigger, getCommand }: Partial<Command<AppType>>) {
    const temp = new Command<AppType>(this.app, "Error", "Error this command is not defined properly");
    this.commands.push(
      new Command(
        this.app,
        name || temp.name,
        description || temp.description,
        action || temp.action,
        render || temp.render,
        onTrigger || temp.onTrigger,
        getCommand || temp.getCommand
      )
    );
    return this;
  }

  addCommands(commands: Partial<Command<AppType>>[]) {
    commands.forEach(cmd => this.addCommand(cmd));
    return this;
  }
}

class PromptCategory<AppType extends App> extends CommandCategory<string, AppType> {
  readonly name = "Prompt";
  private prompt: string = "";

  constructor(public app: AppType, private cb: (prompt: string | null) => void = () => {}) {
    super(app);
  }

  onTrigger(context: CommandPaletteState<AppType>): void {
    this.prompt = context.query;
  }

  getCommands(query: string): string[] {
    return [this.prompt, "Ok", "Cancel"];
  }

  renderCommand(command: string, Item: CommandItem<string, AppType>): Partial<CommandPaletteState<AppType>> {
    Item.setTitle(command).setContextMenuVisibility(false);
    return { topCategory: null };
  }

  executeCommand(command: string): void {
    if (command === "Ok") {
      this.app.console.log("Prompt accepted:", this.prompt);
      this.cb(this.prompt);
    } else if (command === "Cancel") {
      this.app.console.log("Prompt cancelled");
      this.cb(null);
    }
  }
}
