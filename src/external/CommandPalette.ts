import { ChevronRight, IconNode, X } from "lucide";
import { App, Highlighter } from "./App";
import "./CommandPalette.css";

export class CommandPaletteContext {
  constructor(public name: string, public data: any, public childtype: string = "") {}
}

// Abstract base class for category of commands
export abstract class CommandPaletteCategory<T, AppType extends App> {
  abstract name: string;
  abstract icon: IconNode; // Icon for the category, can be used in UI
  abstract childtype: string;
  protected _commands: T[] = [];
  highlighter: Highlighter; // Highlighter for the category
  hili: Highlighter["highlight"]; // Function to highlight text
  query: string;

  constructor(public app: AppType, public palette: CommandPalette<AppType>) {}

  setUp(query: string) {
    this.highlighter = new Highlighter([
      {
        regEXP: new RegExp(`(${query || "this will never match"})`, "ig"),
        cls: "highlighted-query",
      },
    ]);
    this.hili = this.highlighter.highlight.bind(this.highlighter);
    this.query = query;
    return this;
  }
  abstract onTrigger(context?: any): void;
  abstract getCommands(query: string): T[];
  abstract renderCommand(command: T, el: CommandPaletteItem<T>): void;
  abstract executeCommand(command: T): void;
  tryTrigger(context?: any): this {
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
  tryrender(command: T, el: CommandPaletteItem<T>): this {
    try {
      this.renderCommand(command, el);
    } catch (e) {
      this.app.console.error(`Error in ${this.constructor.name}.renderCommand`, e);
    }
    return this;
  }
  tryexecute(command: T): this {
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
}

export class CommandPaletteItem<T> {
  el: HTMLElement;
  infoEl: HTMLElement;
  titleEl: HTMLElement;
  descriptionEl: HTMLElement;
  subEl: HTMLElement;
  hasSubsearch: boolean = false;

  constructor(
    parent: HTMLElement,
    public command: T,
    public palletCat: CommandPaletteCategory<T, any>
  ) {
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
    this.titleEl.replaceChildren(typeof title === "string" ? this.palletCat.hili(title) : title);
    return this;
  }
  setDescription(text: string | DocumentFragment) {
    this.descriptionEl.replaceChildren(typeof text === "string" ? this.palletCat.hili(text) : text);
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
export class CommandPalette<AppType extends App> {
  private categories: CommandPaletteCategory<any, AppType>[] = [];
  private containerEl: HTMLElement | null = null;

  private paletteEl!: HTMLElement;
  private searchInputEl!: HTMLInputElement;
  private contentEl!: HTMLElement;

  commandItems: CommandPaletteItem<any>[] = [];
  private selectedIndex = -1;
  selectedEl: HTMLElement;
  currentCategory: CommandPaletteCategory<any, AppType> | null = null;
  contexts: any[] = [];
  defaultContext: any;
  inputMode: inputMode = "search"; // Default input type
  headerEl: HTMLDivElement;
  maxResults: number = 100; // Maximum results to show
  topButtons: HTMLButtonElement[] = [];
  isOpen: boolean = false;

  constructor(private app: AppType) {
    this.app.console.log("CommandPalette initialized");
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
  open(context?: any) {
    this.contexts = [];
    this.defaultContext = context;
    this.isOpen = true;
    this.display(context);
  }

  display(context?: any) {
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
    this.paletteEl = this.containerEl.createEl("div", { cls: "palette" });
    this.headerEl = this.paletteEl.createEl("div", { cls: "palette-header" });

    // Render icons for each category
    this.categories.forEach((category, i) => {
      this.topButtons[i] = this.headerEl.createEl("button", {}, el => {
        el.setIcon(category.icon);
        el.addEventListener("click", () => {
          this.toggleCategory(category);
          this.headerEl.querySelectorAll("button").forEach(btn => {
            btn.classList.toggle("active", btn === el && this.currentCategory === category);
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
          this.update(el.value);
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

    this.update(""); // initial load
    this.searchInputEl.focus();

    // Outside click closes palette
    document.addEventListener("click", this.handleOutsideClick);
  }

  gosubmenu(command: CommandPaletteItem<any>) {
    this.setCategory(command.palletCat.childtype);
    this.display(command.command);
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
    this.currentCategory = this.currentCategory === category ? null : category;
    this.update(this.searchInputEl.value);
  }

  setCategory(name: string) {
    this.currentCategory = this.categories.find(cat => cat.constructor.name === name) || null;
  }

  private handleOutsideClick = (e: MouseEvent) => {
    console.log(
      "Outside click detected",
      e,
      this.containerEl,
      e.target,
      this.containerEl &&
        !this.containerEl.contains(e.target as Node) &&
        !this.contentEl.contains(e.target as Node)
    );
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
    this.contexts = [];
    this.isOpen = false;
  }

  // Filter and show commands based on query
  update(query: string) {
    if (!this.containerEl) return;

    this.contentEl.empty();
    this.commandItems = [];
    this.selectedIndex = 0;
    const categoriesToShow = this.currentCategory
      ? [this.currentCategory, ...this.categories.filter(cat => cat !== this.currentCategory)]
      : this.categories;

    categoriesToShow.forEach((cat, index) => {
      if (this.commandItems.length > this.maxResults) return;
      cat.setUp(query);
      const commands = cat.trygetCommands(query);
      const cmdavailable = commands.length !== 0;
      if (cmdavailable)
        this.contentEl.createEl("div", { text: cat.name, cls: "category-title" }, el =>
          el.addEventListener("click", () => this.toggleCategory(cat))
        );
      this.topButtons[index].style.display = cmdavailable ? "flex" : "none";

      for (const command of commands) {
        if (this.commandItems.length > this.maxResults) return;
        const cmdindex = this.commandItems.length;
        const itemEl = new CommandPaletteItem(this.contentEl, command, cat)
          .onClick(() => cat.tryexecute(command))
          .onMouseEnter(() => this.selectIndex(cmdindex))
          .onTouchStart(() => this.selectIndex(cmdindex))
          .onSubClick(() => this.gosubmenu(this.commandItems[cmdindex]));
        cat.tryrender(command, itemEl);
        this.commandItems.push(itemEl);
      }
    });
    this.updateSelection();
  }

  // Keyboard navigation
  private moveSelection(delta: number) {
    const maxIndex = this.commandItems.length - 1;
    this.selectIndex(Math.min(Math.max(this.selectedIndex + delta, 0), maxIndex));
  }

  private selectIndex(index: number) {
    this.selectedIndex = index;
    this.updateSelection();
  }

  private updateSelection() {
    this.commandItems.forEach((item, idx) => {
      item.el.classList.toggle("selected", idx === this.selectedIndex);
      if (idx === this.selectedIndex) {
        item.el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
        this.selectedEl = item.el; // Ensure selectedIndex is updated
      }
    });
  }

  private activateSelected() {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.commandItems.length)
      this.selectedEl.click(); // Trigger click on the selected item
  }
}
