import { ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, X } from "lucide";
import van, { ChildDom, State } from "vanjs-core";
import { renderIcon } from "./Icons";
import { stateMapping, View } from "./Workspace";
import { App } from "./App";
import { highlight, HighlightRule } from "./highlighter";
import { escapeRegExp } from "./escapeRegExp";
import { touchDragger } from "./Event";
import { PaletteSettingsController } from "./PaletteSettingsController";
import "./CommandPalette.css";

const { button, div, input, br, span } = van.tags;

export type CommandItem = {
  title: string;
  description: string;
  click?: () => boolean;
  context?: () => void;
  extras?: ChildDom;
  hidden?: boolean;
};

type PaletteWithItems = {
  id: string;
  title: ChildDom;
  description: ChildDom;
  items: CommandItem[];
  extras: CommandItem[];
};

export type CommandPaletteState = {
  expanded: boolean;
  query: string;
  topCategory: string;
  maxItems: number;
};

type PromptMode = "prompt" | "confirm";

class LoadableCommandCategory<T = unknown> {
  _category?: CommandCategory<T>;

  constructor(
    private cfn: (args: { id: string; state: stateMapping<CommandPaletteState> }) => CommandCategory<T>,
    public id: string,
    private state: stateMapping<CommandPaletteState>,
  ) {}

  get category() {
    return this._category || (this._category = this.cfn({ id: this.id, state: this.state }));
  }

  get isLoaded() {
    return !!this._category;
  }

  get name() {
    if (!this.isLoaded)
      return this.id
        .toLowerCase()
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, char => char.toUpperCase());

    return this.category.title.val;
  }

  get description() {
    if (!this.isLoaded) return `Load "${this.name}" to see more details`;

    return this.category.description.val;
  }
}

export class CommandPaletteV2 extends View<CommandPaletteState> {
  private readonly settingsController: PaletteSettingsController<LoadableCommandCategory>;
  private isFocusedSearchInput = true;

  get searchInput(): HTMLInputElement | undefined {
    return (this.el?.querySelector(".palette-search") as HTMLInputElement) ?? undefined;
  }

  focus(): void {
    if (!this.isFocusedSearchInput) return;
    this.searchInput?.focus();
  }

  onMount(): void {
    this.isFocusedSearchInput = true;
    this.focus();
  }

  async initializeSettings(): Promise<void> {
    await this.settingsController.initializeSettings();
  }
  public viewTypeId: string = "command-palette";
  private readonly registeredPalettes: State<LoadableCommandCategory[]> = van.state([]);
  private readonly registeredHiddenPalettes: State<LoadableCommandCategory[]> = van.state([]);
  private readonly promptPalette: LoadableCommandCategory<string>;
  private _promptCategory?: PromptCategory;

  selectedIndex = van.state(0);
  overviewPalettes = van.state(["navigator"]);

  overviewItems: State<PaletteWithItems[]>;

  regularItems: State<PaletteWithItems[]>;

  hoverItem: State<CommandItem | null>;
  overviewItemsCount: State<number>;
  highlighter: State<HighlightRule[]>;

  private filterExtras(items: CommandItem[]): CommandItem[] {
    const query = this.state.query.val.trim().toLowerCase();
    if (!query) return items;

    return items.filter(item => {
      const title = item.title.toLowerCase();
      const description = item.description.toLowerCase();
      return title.includes(query) || description.includes(query);
    });
  }

  private get visiblePalettes(): LoadableCommandCategory[] {
    return this.registeredPalettes.val.filter(p => !this.settingsController.isCategoryDisabled(p.id));
  }

  private get promptCategory(): PromptCategory {
    if (!this._promptCategory) {
      this._promptCategory = this.promptPalette.category as PromptCategory;
    }
    return this._promptCategory;
  }

  constructor(public readonly app: App) {
    super("", { expanded: true, query: "", topCategory: "", maxItems: 15 });
    this.settingsController = new PaletteSettingsController(
      this.app,
      this.registeredPalettes,
      this.state.topCategory,
    );

    this.overviewItems = van.derive(() => {
      let numberRendered = 0;

      const items: PaletteWithItems[] = [];

      for (const paletteId of this.overviewPalettes.val) {
        const palette = [...this.registeredPalettes.val, ...this.registeredHiddenPalettes.val].find(
          p => p.id === paletteId,
        );
        if (palette) {
          palette.category.previousItemCount = numberRendered;
          const paletteItems = palette.category.getItems();
          const paletteExtras = this.filterExtras(palette.category.extras.val);
          const totalCount = paletteItems.length + paletteExtras.length;

          if (numberRendered + totalCount >= this.state.maxItems.val) {
            const remaining = this.state.maxItems.val - numberRendered;
            const shownItems = paletteItems.slice(0, remaining);
            const shownExtras = paletteExtras.slice(0, Math.max(remaining - shownItems.length, 0));
            items.push({
              id: palette.id,
              title: palette.category.title,
              description: palette.category.description,
              items: shownItems.map(item => palette.category.renderItem(item)),
              extras: shownExtras,
            });
            break;
          } else {
            items.push({
              id: palette.id,
              title: palette.category.title,
              description: palette.category.description,
              items: paletteItems.map(item => palette.category.renderItem(item)),
              extras: paletteExtras,
            });
            numberRendered += totalCount;
          }
        }
      }

      return items;
    });

    this.overviewItemsCount = van.derive(
      () => this.overviewItems.val.flatMap(group => [...group.items, ...group.extras]).length,
    );

    this.regularItems = van.derive(() => {
      let numberRendered = 0;

      const items: PaletteWithItems[] = [];

      const topCategory =
        this.visiblePalettes.find(p => p.id === this.state.topCategory.val) ||
        this.registeredHiddenPalettes.val.find(p => p.id === this.state.topCategory.val);

      const showingCategories = topCategory
        ? [
            topCategory,
            ...this.visiblePalettes.filter(
              p => p.id !== topCategory.id && !this.overviewPalettes.val.includes(p.id),
            ),
          ]
        : this.visiblePalettes.filter(p => !this.overviewPalettes.val.includes(p.id));

      for (const palette of showingCategories) {
        palette.category.previousItemCount = numberRendered;

        const paletteItems = palette.category.getItems();
        const paletteExtras = this.filterExtras(palette.category.extras.val);
        const totalCount = paletteItems.length + paletteExtras.length;

        if (numberRendered + totalCount >= this.state.maxItems.val) {
          const remaining = this.state.maxItems.val - numberRendered;
          const shownItems = paletteItems.slice(0, remaining);
          const shownExtras = paletteExtras.slice(0, Math.max(remaining - shownItems.length, 0));
          items.push({
            id: palette.id,
            title: palette.category.title,
            description: palette.category.description,
            items: shownItems.map(item => palette.category.renderItem(item)),
            extras: shownExtras,
          });
          break;
        } else {
          items.push({
            id: palette.id,
            title: palette.category.title,
            description: palette.category.description,
            items: paletteItems.map(item => palette.category.renderItem(item)),
            extras: paletteExtras,
          });
          numberRendered += totalCount;
        }
      }

      return items;
    });

    this.hoverItem = van.derive(
      () =>
        [...this.overviewItems.val, ...this.regularItems.val].flatMap(group => [
          ...group.items,
          ...group.extras,
        ])[this.selectedIndex.val] || null,
    );

    van.derive(() => {
      void this.state.query.val; // depend on query changes to reset selected index
      void this.state.topCategory.val; // depend on category changes to reset selected index
      this.selectedIndex.val = this.overviewItemsCount.val;
      this.state.maxItems.val = 15;
    });

    van.derive(() => {
      void this.state.topCategory.val;
      this.state.query.val = "";
    });
    this.registerPalette("navigator", () => new NavigatorCategory(this.state, this.registeredPalettes), true);
    this.promptPalette = this.registerPalette(
      "prompt",
      ({ state }) => new PromptCategory(state, this),
      true,
    ) as LoadableCommandCategory<string>;

    this.highlighter = van.derive(() => {
      const query = this.state.query.val.trim();

      return [
        // Only insert the query highlighter if query actually exists
        ...((query && [
          {
            // eslint-disable-next-line security/detect-non-literal-regexp
            regEXP: new RegExp(`(${escapeRegExp(query)})`, "ig"),
            callback: (match: string) => span({ class: "highlighted-query" }, match),
          },
        ]) ||
          []),
        { regEXP: /\n/g, callback: () => br() },
      ];
    });
  }

  registerPalette<T>(
    id: string,
    cfn: (args: { id: string; state: stateMapping<CommandPaletteState> }) => CommandCategory<T>,
    hidden = false,
  ): LoadableCommandCategory<T> {
    const palette = new LoadableCommandCategory(cfn, id, this.state) as LoadableCommandCategory;
    if (hidden) {
      this.registeredHiddenPalettes.val = [...this.registeredHiddenPalettes.val, palette];
    } else {
      this.registeredPalettes.val = [...this.registeredPalettes.val, palette];
      this.settingsController.applyCategoryOrder();
    }
    return palette as LoadableCommandCategory<T>;
  }

  unregisterPalette(id: string) {
    this.registeredPalettes.val = this.registeredPalettes.val.filter(p => p.id !== id);
    this.registeredHiddenPalettes.val = this.registeredHiddenPalettes.val.filter(p => p.id !== id);
  }

  isCategoryDisabled(id: string): boolean {
    return this.settingsController.isCategoryDisabled(id);
  }

  setDisabledPalettes(ids: string[]): void {
    this.settingsController.setDisabledPalettes(ids);
  }

  disableCategory(id: string): void {
    this.settingsController.disableCategory(id);
  }

  enableCategory(id: string): void {
    this.settingsController.enableCategory(id);
  }

  getDisabledPalettes(): string[] {
    return this.settingsController.getDisabledPalettes();
  }

  setCategoryOrder(order: string[]): void {
    this.settingsController.setCategoryOrder(order);
  }

  getCategoryOrder(): string[] {
    return this.settingsController.getCategoryOrder();
  }

  get isOpen(): boolean {
    return this.app.workspace.layoutController.floatingViews.children.val.some(view => view.val === this);
  }

  open(context: Partial<CommandPaletteState> = {}): this {
    const wasOpen = this.isOpen;

    if (!wasOpen && context.query === undefined) {
      this.state.query.val = "";
    }

    this.updateViewState(context);

    if (!wasOpen) {
      this.app.workspace.layoutController.addFloatingView(this.viewTypeId, this.getState());
    }

    return this;
  }

  close(): this {
    if (this.isOpen) {
      this.app.workspace.layoutController.removeViewInstance(this);
    }

    return this;
  }

  menu() {
    this.updateViewState({ topCategory: "navigator" });
    this.open();
    return this;
  }

  prompt(text: string): Promise<string | null> {
    return this.promptCategory.prompt(text);
  }

  confirm(text: string): Promise<boolean> {
    return this.promptCategory.confirm(text);
  }

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
        this.selectedIndex.val++;
        break;
      case "ArrowUp":
        this.selectedIndex.val--;
        break;
      case "Enter":
        void (this.hoverItem.val?.click?.() && this.close());
        break;
      case "ArrowRight":
      case "Tab":
        this.hoverItem.val?.context?.();
        break;
      case "ArrowLeft":
      case "Shift+Tab": {
        this.undo();
        break;
      }
      case "Escape":
        this.close();
        break;
    }
  }

  create(): HTMLElement {
    const renderItem = (index: number, item: CommandItem, isExtra = false): HTMLDivElement =>
      div(
        {
          class: () =>
            `${this.selectedIndex.val === index ? "command-item selected" : "command-item"}${
              isExtra ? " extras-item" : ""
            }`,
          onclick: () => item.click?.() && this.close(),
          onmouseenter: () => (this.selectedIndex.val = index),
        },
        div(
          { class: "command-item-info" },
          div({ class: "command-title" }, highlight(item.title, this.highlighter.val)),
          div(
            { class: item.hidden === false ? "command-description" : "command-description hidden" },
            highlight(item.description, this.highlighter.val),
          ),
        ),
        div({ class: "command-comp" }, item.extras || null),
      );

    return div(
      {
        class: "palette",
        ...touchDragger({
          ondraggingx: () => {
            this.searchInput?.blur();
            this.isFocusedSearchInput = false;
          },
          ondraggingy: () => {
            this.searchInput?.blur();
            this.isFocusedSearchInput = false;
          },
          ondragx: ({ deltaX }) => deltaX > 0 && this.menu(),
          stylesetter: ({ deltaX, isX }) =>
            isX
              ? `transform: scale(${1 - Math.min(Math.max(deltaX.val, 0) / 1000, this.state.topCategory.val === "navigator" ? 0 : 0.1)});`
              : "",
        }),
      },
      div(
        { class: "palette-header" },
        button(
          { class: "icon-action", title: "Back to previous context", onclick: () => {} },
          renderIcon(ChevronLeft),
        ),
        button(
          {
            class: "icon-action",
            title: "Toggle expanded view",
            onclick: () => (this.state.expanded.val = !this.state.expanded.val),
          },
          () => renderIcon(this.state.expanded.val ? ChevronsDownUp : ChevronsUpDown),
        ),
        button(
          {
            class: "icon-action",
            title: "Close Palette",
            onclick: () => this.app.workspace.layoutController.removeViewInstance(this),
          },
          renderIcon(X),
        ),
      ),
      input({
        placeholder: () =>
          this.state.topCategory.val === "prompt"
            ? this.promptCategory.mode === "prompt"
              ? this.promptCategory.message.val || "Enter a value..."
              : "Enter a value to confirm..."
            : this.state.topCategory.val
              ? `Search ${[...this.registeredPalettes.val, ...this.registeredHiddenPalettes.val].find(palette => palette.id === this.state.topCategory.val)?.name || this.state.topCategory.val}...`
              : "Search...",
        type: "search",
        class: "palette-search",
        value: this.state.query.rawVal,
        oninput: e => (this.state.query.val = (e.target as HTMLInputElement).value),
        onfocus: () => (this.isFocusedSearchInput = true),
      }),
      div(
        { class: () => (this.state.expanded.val ? "palette-content expanded" : "palette-content") },
        div(
          { class: "palette-content-inner" },
          () =>
            div(
              { class: "palette-content-over" },
              ...this.overviewItems.val.map(group => {
                let i = 0;
                return div(
                  { class: "category" },
                  div(
                    { class: "category-title", onclick: () => (this.state.topCategory.val = group.id) },
                    group.title,
                  ),
                  ...group.items.map(item => renderItem(i++, item)),
                  ...group.extras.map(item => renderItem(i++, item, true)),
                );
              }),
            ),
          () => {
            let i = this.overviewItemsCount.val;
            return div(
              {
                class: "palette-content-main",
                onscroll: () => {
                  window.requestAnimationFrame(
                    () => this.state.maxItems.val < 1000 && (this.state.maxItems.val = 1000),
                  );
                },
                onscrollend: (e: Event) => {
                  if ((e.currentTarget as HTMLElement).scrollTop === 0) {
                    this.isFocusedSearchInput = true;
                  }
                  this.focus();
                },
              },
              ...this.regularItems.val.map(group =>
                group.items.length !== 0 ||
                group.extras.length !== 0 ||
                group.id === this.state.topCategory.val
                  ? div(
                      { class: "category" },
                      div(
                        { class: "category-title", onclick: () => (this.state.topCategory.val = group.id) },
                        group.title,
                      ),
                      ...group.items.map(item => renderItem(i++, item)),
                      ...group.extras.map(item => renderItem(i++, item, true)),
                    )
                  : null,
              ),
            );
          },
        ),
      ),
    );
  }
}

export abstract class CommandCategory<T> {
  abstract allItems: State<T[]>;
  abstract criteria: Array<(item: T) => string>;
  abstract renderItem(item: T): CommandItem;
  previousItemCount: number = 0;
  title: State<string>;
  description: State<string>;
  extras: State<CommandItem[]> = van.state([]);
  constructor(
    public state: stateMapping<CommandPaletteState>,
    title: string,
    description: string = "",
  ) {
    this.title = van.state(title);
    this.description = van.state(description);
  }
  getItems(): T[] {
    const query = this.state.query.val.toLowerCase();
    if (!query) return this.allItems.val;

    const matchedIndices = new Set<number>();

    return this.criteria
      .map(cb =>
        this.allItems.val.filter(
          (item, index) =>
            !matchedIndices.has(index) &&
            cb(item).toLowerCase().includes(query) &&
            (matchedIndices.add(index), true), // Add index to matched set
        ),
      )
      .flat()
      .slice(0, this.state.maxItems.val - this.previousItemCount);
  }

  context(cb: () => Partial<CommandPaletteState>): { context: () => boolean; extras: ChildDom } {
    return {
      context: () => {
        this.updateViewState(cb());
        return false;
      },
      extras: div(
        {
          class: "icon-button",
          title: "Open context menu",
          onclick: e => (e.stopPropagation(), cb()),
        },
        renderIcon(ChevronRight),
      ),
    };
  }

  updateViewState(newState: Partial<CommandPaletteState>): void {
    for (const key in newState) {
      const stateEntry = this.state[key as keyof CommandPaletteState];
      if (!stateEntry) continue;
      stateEntry.val = newState[key as keyof CommandPaletteState] as typeof stateEntry.val;
    }
  }

  clearExtras(): this {
    this.extras.val = [];
    return this;
  }

  addExtra(item: CommandItem): this {
    this.extras.val = [...this.extras.val, item];
    return this;
  }

  addExtras(...items: CommandItem[]): this {
    this.extras.val = [...this.extras.val, ...items];
    return this;
  }

  setExtras(items: CommandItem[]): this {
    this.extras.val = [...items];
    return this;
  }

  deriveExtras(builder: () => CommandItem[]): this {
    van.derive(() => {
      this.extras.val = builder();
    });
    return this;
  }

  deriveExtraCMDs(
    builder: () => Array<{
      title: string;
      description: string;
      cb?: (item: CommandItem) => Partial<CommandItem> | void;
    }>,
  ): this {
    return this.deriveExtras(() =>
      builder().map(({ title, description, cb }) => {
        const item: CommandItem = { title, description };
        const result = cb ? cb(item) : undefined;
        const merged = result ? { ...item, ...result } : item;
        if (merged.click) {
          const click = merged.click;
          merged.click = () => click() === true;
        }
        return merged;
      }),
    );
  }

  addExtraCMD(
    title: string,
    description: string,
    cb: (item: CommandItem) => Partial<CommandItem> | void = () => {},
  ): this {
    const item: CommandItem = { title, description };
    const result = cb(item);
    const merged = result ? { ...item, ...result } : item;
    if (merged.click) {
      const click = merged.click;
      merged.click = () => click() === true;
    }
    this.addExtra(merged);
    return this;
  }
}

class NavigatorCategory extends CommandCategory<LoadableCommandCategory> {
  allItems: State<LoadableCommandCategory[]>;
  criteria: Array<(item: LoadableCommandCategory) => string> = [item => item.name, item => item.description];

  constructor(state: stateMapping<CommandPaletteState>, palettes: State<LoadableCommandCategory[]>) {
    super(state, "Navigator", "Navigate through the application");
    this.allItems = palettes;
  }

  renderItem(item: LoadableCommandCategory): CommandItem {
    return {
      title: item.name,
      description: item.description,
      click: () => ((this.state.topCategory.val = item.id), false),
    };
  }
}

class PromptCategory extends CommandCategory<string> {
  message = van.state("");

  private session: {
    mode: PromptMode;
    previousQuery: string;
    previousTopCategory: string;
    resolve: (value: string | null) => void;
    wasOpen: boolean;
  } | null = null;

  allItems = van.state(["Ok", "Cancel"]);
  criteria: Array<(item: string) => string> = [item => item];

  constructor(
    state: stateMapping<CommandPaletteState>,
    private readonly palette: CommandPaletteV2,
  ) {
    super(state, "Prompt", "Prompt for user input");
  }

  get mode(): PromptMode {
    return this.session?.mode ?? "prompt";
  }

  prompt(text: string): Promise<string | null> {
    return new Promise(resolve => this.startPromptSession(text, "prompt", resolve));
  }

  confirm(text: string): Promise<boolean> {
    return new Promise(resolve => this.startPromptSession(text, "confirm", value => resolve(value !== null)));
  }

  private startPromptSession(
    message: string,
    mode: PromptMode,
    resolve: (value: string | null) => void,
  ): void {
    this.session = {
      mode,
      previousQuery: this.state.query.val,
      previousTopCategory: this.state.topCategory.val,
      resolve,
      wasOpen: this.palette.isOpen,
    };
    this.message.val = message;
    this.palette.open({ query: "", topCategory: "prompt" });
  }

  private finishPrompt(value: string | null): void {
    const session = this.session;
    if (!session) return;

    this.session = null;
    this.message.val = "";

    if (session.wasOpen) {
      this.updateViewState({
        query: session.previousQuery,
        topCategory: session.previousTopCategory,
      });
    } else {
      this.palette.close();
      this.updateViewState({
        query: session.previousQuery,
        topCategory: session.previousTopCategory,
      });
    }

    session.resolve(value);
  }

  getItems(): string[] {
    this.title.val = this.mode === "confirm" ? "Confirm" : "Prompt";
    this.description.val = this.message.val;
    return this.allItems.val;
  }

  renderItem(item: string): CommandItem {
    return {
      title: item,
      description:
        item === "Ok"
          ? this.message.val
          : this.mode === "confirm"
            ? "Dismiss this confirmation"
            : "Cancel without saving input",
      click: () => {
        this.finishPrompt(item === "Ok" ? (this.mode === "prompt" ? this.state.query.val : "") : null);
        return false;
      },
    };
  }
}
