import { ChevronRight, IconNode, Library, X } from "lucide";
import { App, Highlighter } from "./App";
import "./CommandPalette.css";

export class CommandPaletteState<AppType extends App> {
  maxResults: number = 100; // Maximum results to show
  constructor(
    public app: App,
    public query: string = "",
    public topCategory: CommandPaletteCategory<any, App> | null = null
  ) {}
}

// Abstract base class for category of commands
export abstract class CommandPaletteCategory<T, AppType extends App> {
  abstract readonly name: string;
  title: string; // Title for the category, can be used in UI
  abstract icon: IconNode; // Icon for the category, can be used in UI
  protected _commands: T[] = [];
  highlighter: Highlighter; // Highlighter for the category
  hili: Highlighter["highlight"]; // Function to highlight text
  query: string;

  constructor(public app: AppType) {}

  setUp(state: CommandPaletteState<AppType>): this {
    //this.app.console.log(`Setting up category: ${this.title} with query: ${state.query}`);
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
  ): CommandPaletteState<AppType>; // fix
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
  tryrender(command: T, el: CommandPaletteItem<T, AppType>): CommandPaletteState<AppType> {
    try {
      return this.renderCommand(command, el);
    } catch (e) {
      this.app.console.error(`Error in ${this.constructor.name}.renderCommand`, e);
    }
    return new CommandPaletteState(this.app, "", this.app.commandPalette.state.topCategory);
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
  getcompatible<T>(query: string, array: T[], ...callback: ((item: T) => string)[]): T[] {
    if (!query) return array; // Return all items if no query
    const lcasequery = query.toLowerCase();
    const done: boolean[] = [];
    return callback
      .map(cb =>
        array.filter((item, index) => {
          if (done[index]) return false; // Skip if already matched
          done[index] = cb(item).toLowerCase().includes(lcasequery); // Mark as matched
          return done[index];
        })
      )
      .flatMap(item => item);
  }
  getPaletteByName(name: string): CommandPaletteCategory<any, AppType> | null {
    const category = this.app.commandPalette
      .getcategories()
      .find(cat => cat.constructor.name === name) as CommandPaletteCategory<any, AppType>;
    if (!category) {
      this.app.console.error(`Category "${name}" not found`);
      return null;
    }
    return category;
  }
}

export class CommandPaletteItem<T, AppType extends App> {
  el: HTMLElement;
  infoEl: HTMLElement;
  titleEl: HTMLElement;
  descriptionEl: HTMLElement;
  subEl: HTMLElement;
  hasSubsearch: boolean = false;
  toState: CommandPaletteState<AppType>;

  constructor(
    public app: AppType,
    parent: HTMLElement,
    public command: T,
    public PaletteCat: CommandPaletteCategory<T, any>
  ) {
    this.toState = new CommandPaletteState(this.app);
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

type inputMode = "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url";

// Main CommandPalette class
export abstract class CommandPalette<AppType extends App> {
  abstract state: CommandPaletteState<AppType>; // State of the command palette
  private categories: CommandPaletteCategory<any, AppType>[] = [];
  private containerEl: HTMLElement | null = null;

  private paletteEl!: HTMLElement;
  private searchInputEl!: HTMLInputElement;
  private contentEl!: HTMLElement;

  commandItems: CommandPaletteItem<any, AppType>[] = [];
  private selectedIndex = -1;
  selectedEl: HTMLElement;
  contexts: CommandPaletteState<AppType>[] = []; // Stack of contexts for back navigation
  defaultContext: any;
  inputMode: inputMode = "search"; // Default input type
  headerEl: HTMLDivElement;
  maxResults: number = 100; // Maximum results to show
  topButtons: HTMLButtonElement[] = [];
  isOpen: boolean = false;

  constructor(private app: AppType) {
    this.app.console.log("CommandPalette initialized");
    this.addPalette(ListOfPalettes); // Add default category for listing all palettes
  }

  getcategories(): CommandPaletteCategory<any, AppType>[] {
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

  // Open and initialize palette UI
  open(context: CommandPaletteState<AppType> = this.state) {
    this.app.console.log("Opening Command Palette with context:", context);
    this.state = context;
    this.contexts = [];
    this.defaultContext = context;
    this.isOpen = true;
    this.display(context);
  }

  display(context: CommandPaletteState<AppType> = this.state) {
    //this.app.console.log("Displaying Command Palette with context:", context);
    this.state = context;
    this.app.historyPush({
      name: "Command Palette",
      data: this.commandItems[this.selectedIndex]?.command,
    });
    this.contexts.push(context);
    this.inputMode = "search";
    this.checkclose();

    // Trigger data fetching for categories
    this.categories.forEach(cat => cat.tryTrigger(context));

    this.containerEl = this.app.contentEl.createEl("div", { cls: "command-palette" });
    this.handleMobileResize();

    this.paletteEl = this.containerEl.createEl("div", { cls: "palette" });
    this.headerEl = this.paletteEl.createEl("div", { cls: "palette-header" });

    // Render icons for each category
    this.categories.forEach((category, i) => {
      this.topButtons[i] = this.headerEl.createEl("button", {}, el => {
        el.setIcon(category.icon);
        el.addEventListener("click", () => {
          this.toggleCategory(category);
          this.headerEl.querySelectorAll("button").forEach(btn => {
            btn.classList.toggle("active", btn === el && this.state.topCategory === category);
          });
        });
      });
    });

    this.headerEl.createEl("button", { cls: "palette-back" }, el => {
      el.addEventListener("click", this.close.bind(this));
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
    this.contentEl = this.paletteEl.createEl("div", { cls: "palette-content" });
    this.state.query = ""; // Reset query
    this.render(); // initial load
    this.searchInputEl.focus();

    // Outside click closes palette
    document.addEventListener("click", this.handleOutsideClick);
  }

  private handleMobileResize(): void {
    // For mobile keyboard handling
    const visual = window.visualViewport;
    const ctr = this.containerEl;
    if (visual && ctr) {
      const viewportHeight = visual.height;
      ctr.style.cssText = `height: calc(${viewportHeight}px - 2em);`;
      visual.addEventListener("resize", this.handleMobileResize.bind(this), { once: true });
    }
  }

  gosubmenu(command: CommandPaletteItem<any, AppType>) {
    this.display(command.toState);
  }

  handleBack() {
    if (this.contexts.length > 1) {
      this.contexts.pop(); // Remove current context
      this.display(this.contexts.pop() || this.defaultContext); // Display previous context
    } else {
      this.close(); // Close if no previous context
    }
  }

  toggleCategory(category: CommandPaletteCategory<any, AppType>) {
    this.state.topCategory = this.state.topCategory === category ? null : category;

    this.render();
  }

  private handleOutsideClick = (e: MouseEvent) => {
    if (this.containerEl && !this.containerEl.contains(e.target as Node)) this.close();
    else this.searchInputEl.focus();
  };

  checkclose() {
    if (this.containerEl) {
      this.containerEl.remove();
      this.containerEl = null;
      document.removeEventListener("click", this.handleOutsideClick);
    }
  }

  close() {
    if (this.containerEl) {
      this.containerEl.remove();
      this.containerEl = null;
      document.removeEventListener("click", this.handleOutsideClick);
    }
    this.state.topCategory = null;
    this.contexts = [];
    this.isOpen = false;
  }

  // Filter and show commands based on query
  render() {
    if (!this.containerEl) return;

    this.contentEl.empty();
    this.commandItems = [];
    this.selectedIndex = 0;
    const categoriesToShow = this.state.topCategory
      ? [this.state.topCategory, ...this.categories.filter(cat => cat !== this.state.topCategory)]
      : this.categories;

    categoriesToShow.forEach((cat, index) => {
      if (this.commandItems.length > this.maxResults) return;
      cat.setUp(this.state);
      const commands = cat.trygetCommands(this.state.query);
      const cmdavailable = commands.length !== 0;
      if (cmdavailable || this.state.topCategory === cat)
        this.contentEl.createEl("div", { text: cat.title, cls: "category-title" }, el =>
          el.addEventListener("click", () =>
            this.toggleCategory(cat as CommandPaletteCategory<any, AppType>)
          )
        );
      this.topButtons[index].style.display = cmdavailable ? "flex" : "none";

      for (const command of commands) {
        if (this.commandItems.length > this.maxResults) return;
        const cmdindex = this.commandItems.length;
        const itemEl = new CommandPaletteItem(this.app, this.contentEl, command, cat)
          .onClick(() => cat.tryexecute(command, itemEl.toState))
          .onMouseEnter(() => this.selectIndex(cmdindex))
          .onTouchStart(() => this.selectIndex(cmdindex))
          .onSubClick(() => this.gosubmenu(this.commandItems[cmdindex]));
        itemEl.toState = cat.tryrender(command, itemEl);
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

class ListOfPalettes<AppType extends App> extends CommandPaletteCategory<string, AppType> {
  readonly name = "Quick Access";
  icon = Library; // Icon for the category, can be a string or an SVG element
  childtype: string = "";
  list: string[] = [];
  names: { [x: string]: CommandPaletteCategory<any, App> };

  onTrigger(context: CommandPaletteState<AppType>): void {
    this.list = this.app.commandPalette.getcategories().map(category => category.constructor.name);
    this.names = this.app.commandPalette.getcategories().reduce((acc, category) => {
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
  ): CommandPaletteState<AppType> {
    Item.setTitle(this.names[command].name.toString().toTitleCase()).setSubsearch(false);
    return { ...this.app.commandPalette.state, topCategory: this.names[command] };
    //.subEl.setIcon(this.names[command]?.icon || ChevronRight).style.display = "flex";
  }
  executeCommand(command: string): void {
    this.app.commandPalette.display();
  }
}
