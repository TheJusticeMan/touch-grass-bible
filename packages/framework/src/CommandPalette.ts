import { IconNode } from "lucide";

import { ChevronLeft, ChevronRight, ChevronsDownUp, ChevronsUpDown, X } from "lucide";
import van, { ChildDom, State } from "vanjs-core";
import { App } from "./App";
import "./CommandPalette.css";
import { escapeRegExp } from "./escapeRegExp";
import { touchDragger } from "./Event";
import { highlight, HighlightRule } from "./highlighter";
import { renderIcon } from "./Icons";
import { PaletteSettingsController } from "./PaletteSettingsController";
import { Platform } from "./Platform";
import { toggle } from "./UIComponents";
import { stateMapping, View } from "./Workspace";

const { button, div, input, br, span } = van.tags;

/**
 * Represents a single executable command or action item within the palette.
 */
export type CommandItem = {
  /** Stable identity, unique within its category, for items that may be reordered asynchronously. */
  key?: string;
  /** The primary label for the command. */
  title: string;
  /** A brief explanation of what the command does. */
  description: string;
  /** * Callback executed when the command is selected.
   * @returns {boolean} Whether the palette should close after execution.
   */
  click?: () => boolean;
  /** Callback executed to trigger alternative context or secondary actions. */
  context?: () => Partial<CommandPaletteState>;
  /** Additional DOM elements to render alongside the item. */
  extras?: ChildDom;
  /** Determines if the command item description should be visually hidden in the non-focused non-expanded state. */
  hidden?: boolean;
};

/** Non-selectable async status shown with a command category. */
export type CommandCategoryStatus = {
  state: "idle" | "loading" | "success" | "error";
  message: string;
};

/** Result of a latest-wins async category operation. */
export type AsyncCommandResult<T> =
  { status: "success"; value: T } | { status: "error"; error: unknown } | { status: "stale" };

/** User-facing messages for a latest-wins async category operation. */
export type AsyncCommandMessages<T> = {
  loadingMessage: string;
  successMessage?: (value: T) => string;
  errorMessage?: (error: unknown) => string;
};

/**
 * Categorized group of palette items ready for rendering.
 */
type PaletteWithItems = {
  /** Unique identifier for the palette category. */
  id: string;
  /** The display title of the palette category. */
  title: ChildDom;
  /** The description of the palette category. */
  description: ChildDom;
  /** Primary commands belonging to this palette. */
  items: CommandItem[];
  /** Secondary or supplementary commands rendered after primary items. */
  extras: CommandItem[];
  /** Non-selectable async status for this category. */
  status: CommandCategoryStatus;
};

type IndexedPaletteItem = { key: string; item: CommandItem };

/**
 * Global state object for managing the command palette's UI and filtering.
 */
export type CommandPaletteState = {
  /** Whether the palette's internal groups are fully expanded. */
  expanded: boolean;
  /** The current search query string. */
  query: string;
  /** The ID of the currently focused or pinned top-level category. */
  topCategory: string;
  /** Maximum number of items to render to prevent DOM lag. */
  maxItems: number;
};

/** Defines the behavior mode of the prompt category. */
type PromptMode = "prompt" | "confirm";

/**
 * A wrapper for command categories that lazily evaluates and instantiates
 * the category only when requested, optimizing initial load times.
 * * @template T The type of underlying items this category manages.
 */
class LoadableCommandCategory<T = unknown> {
  /** Cached category instance created on first access. */
  _category?: CommandCategory<T>;

  /** Reactive flag used to surface lazy-loading state in the UI. */
  isloaded = van.state(false);

  /**
   * @param cfn Factory function to generate the category instance.
   * @param id The unique identifier for this loadable category.
   * @param state The global command palette state mapping.
   */
  constructor(
    private cfn: (args: { id: string; state: stateMapping<CommandPaletteState> }) => CommandCategory<T>,
    public id: string,
    private state: stateMapping<CommandPaletteState>,
  ) {}

  /**
   * Retrieves the underlying category instance, instantiating it on demand.
   *
   * The first access runs the factory callback and flips {@link isloaded} so
   * the palette can present a stable name and description afterward.
   */
  get category() {
    if (!this._category) {
      this._category = this.cfn({ id: this.id, state: this.state });
      this.isloaded.val = true;
    }
    return this._category;
  }

  /**
   * Human-readable category name.
   *
   * Before the category is loaded, this falls back to a title-cased version of
   * the id so the navigator can still render something meaningful.
   */
  get name() {
    if (!this.isloaded.val)
      return this.id
        .toLowerCase()
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, char => char.toUpperCase());

    return this.category.title.val;
  }

  /**
   * Human-readable category description.
   *
   * When the category has not been instantiated yet, return a short hint so
   * the navigator can still show context without eager construction.
   */
  get description() {
    if (!this.isloaded.val) return `Load "${this.name}" to see more details`;

    return this.category.description.val;
  }

  dispose(): void {
    this._category?.dispose();
  }
}

/**
 * The core Command Palette view controller.
 * Handles registering palettes, user input, DOM generation, and palette rendering.
 */
export class CommandPalette extends View<CommandPaletteState> {
  /** Stable workspace view id used for the floating command palette. */
  public viewTypeId: string = "command-palette";
  /** Keep a stable singleton instance so reopening preserves existing reactivity graph. */
  public isSingleton = true;
  /** Persisted palette settings adapter for category order and visibility. */
  private readonly settingsController: PaletteSettingsController<LoadableCommandCategory>;
  /** User-visible categories. */
  private readonly registeredPalettes: State<LoadableCommandCategory[]> = van.state([]);
  /** Hidden categories that can still be reached by id or search. */
  private readonly registeredHiddenPalettes: State<LoadableCommandCategory[]> = van.state([]);
  /** Prompt/confirm pseudo-category used by the palette prompt flow. */
  private readonly promptPalette: PromptCategory;
  /** Hidden registry of executable commands exposed by the app. */
  readonly commands: Commands;
  /** Current selected index across the rendered command items. */
  selectedIndex = van.state(0);
  private selectedItemKey = van.state<string | null>(null);
  private flatItems!: State<IndexedPaletteItem[]>;
  /** Categories that should appear in the small overview rail. */
  overviewPalettes = van.derive(() => (Platform.isWideScreen.val ? ["navigator"] : []));
  /** Palette groups rendered in the overview rail. */
  overviewItems: State<PaletteWithItems[]>;
  /** Palette groups rendered in the main category area. */
  regularItems: State<PaletteWithItems[]>;
  /** Currently hovered or selected command item. */
  hoverItem: State<CommandItem | null>;
  /** Number of items rendered in the overview rail. */
  overviewItemsCount: State<number>;
  /** Text highlighter for query matches inside rendered titles and descriptions. */
  highlighter: State<HighlightRule[]>;
  /** Tracks whether pointer interactions should suppress search focus. */
  private isFocusedSearchInput = true;

  /**
   * @param app The main application instance.
   */
  constructor(public readonly app: App) {
    super("", { expanded: true, query: "", topCategory: "", maxItems: 15 });
    this.settingsController = new PaletteSettingsController(
      this.app,
      this.registeredPalettes,
      this.state.topCategory,
    );

    const palettesById = van.derive(() => new Map(this.allPalettes.map(palette => [palette.id, palette])));
    const overviewPalettesById = van.derive(() => new Set(this.overviewPalettes.val));

    this.overviewItems = van.derive(() =>
      this.buildPaletteGroups(
        this.overviewPalettes.val
          .map(id => palettesById.val.get(id))
          .filter((palette): palette is LoadableCommandCategory => !!palette),
      ),
    );

    this.overviewItemsCount = van.derive(
      () => this.overviewItems.val.flatMap(group => this.getGroupItems(group)).length,
    );

    const topCategory = van.derive(() => this.findPaletteById(this.state.topCategory.val));

    this.regularItems = van.derive(() =>
      this.buildPaletteGroups(
        [
          topCategory.val,
          ...(topCategory.val?.category.siblings
            ? topCategory.val.category.siblings.map(id => palettesById.val.get(id)) || []
            : this.registeredPalettes.val.filter(
                p => !this.settingsController.isCategoryDisabled(p.id) && topCategory.val?.id !== p.id,
              )),
        ].filter(
          (palette): palette is LoadableCommandCategory =>
            !!palette && !overviewPalettesById.val.has(palette.id),
        ),
      ),
    );

    this.flatItems = van.derive(() => {
      const groups = [...this.overviewItems.val, ...this.regularItems.val];
      return groups.flatMap(group => {
        const occurrences = new Map<string, number>();
        return this.getGroupItems(group).map(item => {
          const baseKey =
            item.key === undefined
              ? JSON.stringify(["fallback", item.title, item.description])
              : JSON.stringify(["explicit", item.key]);
          const occurrence = occurrences.get(baseKey) || 0;
          occurrences.set(baseKey, occurrence + 1);
          return { key: JSON.stringify([group.id, baseKey, occurrence]), item };
        });
      });
    });

    van.derive(() => {
      const items = this.flatItems.val;
      const selectedKey = this.selectedItemKey.val;
      const selectedIndex = selectedKey ? items.findIndex(item => item.key === selectedKey) : -1;
      if (selectedIndex >= 0) {
        if (this.selectedIndex.val !== selectedIndex) this.selectedIndex.val = selectedIndex;
        return;
      }

      const fallbackIndex = items.length ? Math.min(this.overviewItemsCount.val, items.length - 1) : 0;
      if (this.selectedIndex.val !== fallbackIndex) this.selectedIndex.val = fallbackIndex;
      const fallbackKey = items[fallbackIndex]?.key ?? null;
      if (this.selectedItemKey.val !== fallbackKey) this.selectedItemKey.val = fallbackKey;
    });

    this.hoverItem = van.derive(() => this.flatItems.val[this.selectedIndex.val]?.item || null);

    // make sure it's in view
    van.derive(
      () => (
        this.selectedIndex.val,
        this.state.maxItems.val,
        window.requestAnimationFrame(
          () =>
            this.isCreated &&
            this.el?.querySelector(".selected")?.scrollIntoView({
              block: "nearest",
              inline: "nearest",
            }),
        )
      ),
    );

    van.derive(() => {
      void this.state.query.val;
      void this.state.topCategory.val;
      this.selectedItemKey.val = null;
      this.selectedIndex.val = this.overviewItemsCount.val;
      this.state.maxItems.val = 15;
    });

    van.derive(() => (this.state.topCategory.val, (this.state.query.val = "")));

    this.registerPalette({
      id: "navigator",
      cfn: () => new NavigatorCategory(this.state, this.registeredPalettes, this),
      hidden: true,
    });
    this.promptPalette = new PromptCategory(this.state, this);

    this.registerPalette({ id: "prompt", cfn: () => this.promptPalette, hidden: true });

    this.commands = new Commands(this.state);

    this.registerPalette({ id: "commands", cfn: () => this.commands, hidden: true });

    const trimmedQuery = van.derive(() => this.state.query.val.trim());

    this.highlighter = van.derive(() => [
      ...((trimmedQuery.val && [
        {
          // eslint-disable-next-line security/detect-non-literal-regexp
          regEXP: new RegExp(`(${escapeRegExp(trimmedQuery.val)})`, "ig"),
          callback: (match: string) => span({ class: "highlighted-query" }, match),
        },
      ]) ||
        []),
      { regEXP: /\n/g, callback: () => br() },
    ]);
  }

  /** Loads the persisted category order and disabled palette settings. */
  async initializeSettings(): Promise<void> {
    await this.settingsController.initializeSettings();
  }

  /** Focuses the search input whenever the view is mounted. */
  onMount(): void {
    this.isFocusedSearchInput = true;
    this.focus();
  }

  /** Whether the palette is currently visible as a floating view. */
  get isOpen(): boolean {
    return this.app.workspace.layout.floatingViews.children.val.some(view => view.val === this);
  }

  /**
   * Opens the palette with optional state overrides.
   *
   * If the palette is already open, the new state is merged into the current
   * view. If it is closed, the floating palette view is created first.
   *
   * @param context - Partial state to merge into the active palette session.
   */
  open(context: Partial<CommandPaletteState> = {}): this {
    const wasOpen = this.isOpen;

    if (!wasOpen) this.state.query.val = context.query || "";

    this.updateViewState(context);

    if (!wasOpen) this.app.workspace.layout.addFloatingView(this.viewTypeId, this.getState());

    return this;
  }

  /** Closes the palette and cancels any active prompt session. */
  close(): this {
    this.promptPalette.cancelPrompt();

    if (this.isOpen) {
      this.app.workspace.layout.removeViewInstance(this);
    }

    return this;
  }

  /** Convenience helper that opens the palette on the navigator category. */
  menu() {
    this.open({ topCategory: "navigator" });
    return this;
  }

  /**
   * Opens a prompt session and resolves with the user's text or null.
   *
   * The prompt is implemented using the palette itself, so callers can await a
   * value without needing a separate dialog surface.
   *
   * @param text - Message shown above the Ok/Cancel choices.
   * @returns Promise resolving to the entered text or null when cancelled.
   */
  prompt(text: string): Promise<string | null> {
    return this.promptPalette.prompt(text);
  }

  /**
   * Opens a confirmation session and resolves to a boolean result.
   *
   * This uses the same palette-based prompt flow as {@link prompt}, but the
   * returned value is normalized to `true` for Ok and `false` for Cancel.
   *
   * @param text - Message shown above the Ok/Cancel choices.
   * @returns Promise resolving to true when confirmed, false otherwise.
   */
  confirm(text: string): Promise<boolean> {
    return this.promptPalette.confirm(text);
  }

  private selectIndex(index: number): void {
    const items = this.flatItems.val;
    if (items.length === 0) {
      this.selectedItemKey.val = null;
      this.selectedIndex.val = 0;
      return;
    }

    const boundedIndex = Math.min(Math.max(0, index), items.length - 1);
    this.selectedItemKey.val = items[boundedIndex].key;
    this.selectedIndex.val = boundedIndex;
  }

  /** Handles keyboard meaning strings produced by the workspace key router. */
  handleKeyDown(event: KeyboardEvent, meaning: string): void {
    const isInputEmpty = this.state.query.val === "";
    const move = (delta: number) => this.selectIndex(this.selectedIndex.val + delta);
    const jump = (index: number) => this.selectIndex(index);
    const undo = () => this.undo() && this.saveState();

    const executeCurrent = () =>
      this.hoverItem.val?.click?.()
        ? this.close()
        : this.updateViewState(this.hoverItem.val?.context?.() || {});
    const executeSecondary = () => this.updateViewState(this.hoverItem.val?.context?.() || {});

    const numberMatch = /^(Alt|Meta|Ctrl)\+([1-9])$/.exec(meaning);
    if (numberMatch) {
      jump(Number(numberMatch[2]) - 1);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const meanings: Record<string, (() => void) | null> = {
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      PageDown: () => move(8),
      PageUp: () => move(-8),
      Home: () => jump(0),
      End: () => jump(this.flatItems.val.length - 1),
      "Meta+ArrowDown": () => move(8),
      "Meta+ArrowUp": () => move(-8),
      "Ctrl+ArrowDown": () => move(8),
      "Ctrl+ArrowUp": () => move(-8),
      ArrowRight: isInputEmpty ? executeSecondary : null,
      ArrowLeft: isInputEmpty ? undo : null,
      Enter: executeCurrent,
      "Meta+Enter": executeSecondary,
      "Ctrl+Enter": executeSecondary,
      Tab: executeSecondary,
      "Shift+Tab": undo,
      Escape: () => (this.state.query.val ? (this.state.query.val = "") : this.close()),
      Backspace: isInputEmpty && !event.repeat ? undo : null,
    };

    if (meanings[meaning]) {
      event.preventDefault();
      event.stopPropagation();
      meanings[meaning]();
    }
  }

  /**
   * Registers a new command category with lazy instantiation.
   *
   * Hidden categories are still searchable by id but excluded from the normal
   * overview rail. Visible categories participate in ordering and disabled
   * category settings.
   *
   * @param id - Stable id used for palette lookup and persisted order.
   * @param cfn - Factory that creates the category on first access.
   * @param hidden - When true, register the category outside the normal list.
   * @returns Wrapper for the lazily loaded category.
   */
  registerPalette<T>({
    id,
    cfn,
    hidden = false,
  }: {
    id: string;
    cfn: (args: { id: string; state: stateMapping<CommandPaletteState> }) => CommandCategory<T>;
    hidden?: boolean;
  }): LoadableCommandCategory<T> {
    const palette = new LoadableCommandCategory(cfn, id, this.state) as LoadableCommandCategory;
    if (hidden) {
      this.registeredHiddenPalettes.val = [...this.registeredHiddenPalettes.val, palette];
    } else {
      this.registeredPalettes.val = [...this.registeredPalettes.val, palette];
      this.settingsController.applyCategoryOrder();
    }
    return palette as LoadableCommandCategory<T>;
  }

  /** Removes a category from both the visible and hidden registries. */
  unregisterPalette(id: string) {
    const visible = this.registeredPalettes.val;
    const hidden = this.registeredHiddenPalettes.val;
    for (const palette of [...visible, ...hidden].filter(palette => palette.id === id)) {
      try {
        palette.dispose();
      } catch (error) {
        this.app.console.error(`[CommandPalette] Failed to dispose category ${id}`, error);
      }
    }
    this.registeredPalettes.val = visible.filter(palette => palette.id !== id);
    this.registeredHiddenPalettes.val = hidden.filter(palette => palette.id !== id);
  }

  /** Whether a category id is currently disabled in user settings. */
  isCategoryDisabled(id: string): boolean {
    return this.settingsController.isCategoryDisabled(id);
  }

  /** Replaces the persisted disabled-category list. */
  setDisabledPalettes(ids: string[]): void {
    this.settingsController.setDisabledPalettes(ids);
  }

  /** Disables a category if it is currently registered and enabled. */
  disableCategory(id: string): void {
    this.settingsController.disableCategory(id);
  }

  /** Re-enables a previously disabled category. */
  enableCategory(id: string): void {
    this.settingsController.enableCategory(id);
  }

  /** Returns a copy of the persisted disabled-category ids. */
  getDisabledPalettes(): string[] {
    return this.settingsController.getDisabledPalettes();
  }

  /** Replaces the persisted visible-category order. */
  setCategoryOrder(order: string[]): void {
    this.settingsController.setCategoryOrder(order);
  }

  /** Returns a copy of the persisted category order. */
  getCategoryOrder(): string[] {
    return this.settingsController.getCategoryOrder();
  }

  /** Returns the live search input element if the palette has mounted. */
  get searchInput(): HTMLInputElement | undefined {
    return (this.el?.querySelector(".palette-search") as HTMLInputElement) ?? undefined;
  }

  /** Focuses the search input when pointer interactions have not suppressed it. */
  focus(): void {
    if (!this.isFocusedSearchInput) return;
    this.searchInput?.focus();
  }

  private get allPalettes(): LoadableCommandCategory[] {
    return [...this.registeredPalettes.val, ...this.registeredHiddenPalettes.val].filter(
      p => !this.settingsController.isCategoryDisabled(p.id),
    );
  }

  private findPaletteById(id: string): LoadableCommandCategory | undefined {
    return this.allPalettes.find(palette => palette.id === id);
  }

  private getGroupItems(group: PaletteWithItems): CommandItem[] {
    return [...group.items, ...group.extras];
  }

  /**
   * Filters extra items based on the current palette search query.
   * @param items Array of command items to filter.
   * @returns Array of command items matching the query.
   */
  private filterExtras(items: CommandItem[]): CommandItem[] {
    const query = this.state.query.val.trim().toLowerCase();
    if (!query) return items;

    return items.filter(item => {
      const title = item.title.toLowerCase();
      const description = item.description.toLowerCase();
      return title.includes(query) || description.includes(query);
    });
  }

  private buildPaletteGroups(palettes: LoadableCommandCategory[]): PaletteWithItems[] {
    let numberRendered = 0;
    const groups: PaletteWithItems[] = [];

    for (const palette of palettes) {
      palette.category.previousItemCount = numberRendered;

      const paletteItems =
        tryit(() => palette.category.getItems(), `Error getting palette items for ${palette.id}`) || [];
      const paletteExtras = this.filterExtras(palette.category.extras.val);
      const totalCount = paletteItems.length + paletteExtras.length;
      const baseGroup = {
        id: palette.id,
        title: palette.category.title,
        description: palette.category.description,
        status: palette.category.asyncStatus.val,
      };

      if (numberRendered + totalCount >= this.state.maxItems.val) {
        const remaining = this.state.maxItems.val - numberRendered;
        const shownItems = paletteItems.slice(0, remaining);
        const shownExtras = paletteExtras.slice(0, Math.max(remaining - shownItems.length, 0));

        groups.push({
          ...baseGroup,
          items: shownItems.map(item => palette.category.renderItem(item)),
          extras: shownExtras,
        });
        break;
      }

      groups.push({
        ...baseGroup,
        items: paletteItems.map(item => palette.category.renderItem(item)),
        extras: paletteExtras,
      });
      numberRendered += totalCount;
    }

    return groups;
  }

  private renderCategoryGroup(
    group: PaletteWithItems,
    itemStartIndex: number,
    renderItem: (index: number, item: CommandItem, isExtra?: boolean) => HTMLDivElement,
  ): { element: HTMLDivElement; nextIndex: number } {
    let index = itemStartIndex;
    const groupItems = this.getGroupItems(group);

    const element = div(
      { class: "category" },
      div({ class: "category-title", onclick: () => (this.state.topCategory.val = group.id) }, group.title),
      ...groupItems.map(item => renderItem(index++, item, group.extras.includes(item))),
      group.status.message
        ? div(
            {
              class: `category-status category-status-${group.status.state}`,
              role: "status",
              "aria-live": "polite",
            },
            group.status.message,
          )
        : null,
    );

    return { element, nextIndex: index };
  }

  /** Chooses the search placeholder text based on the active category. */
  private getSearchPlaceholder(): string {
    if (this.state.topCategory.val === "prompt") {
      return this.promptPalette.mode === "prompt"
        ? this.promptPalette.message.val || "Enter a value..."
        : "Enter a value to confirm...";
    }

    if (this.state.topCategory.val) {
      const paletteName =
        this.findPaletteById(this.state.topCategory.val)?.name || this.state.topCategory.val;
      return `Search ${paletteName}...`;
    }

    return "Search...";
  }

  /** Blurs the search field after touch or pointer drag interactions. */
  private unfocusSearchInput = (): void => {
    this.searchInput?.blur();
    this.isFocusedSearchInput = false;
  };

  /**
   * Constructs the physical DOM nodes for the command palette view.
   * @returns The generated HTMLElement root of the command palette.
   */
  create(): HTMLElement {
    const renderItem = (index: number, item: CommandItem, isExtra = false): HTMLDivElement =>
      div(
        {
          class: () =>
            `${this.selectedIndex.val === index ? "command-item selected" : "command-item"}${
              isExtra ? " extras-item" : ""
            }`,
          onclick: () => item.click?.() && this.close(),
          onmouseenter: () => this.selectIndex(index),
        },
        div(
          { class: "command-item-info" },
          div({ class: "command-title" }, highlight(item.title, this.highlighter.val)),
          div(
            { class: item.hidden === false ? "command-description" : "command-description hidden" },
            highlight(item.description, this.highlighter.val),
          ),
        ),
        div(
          { class: "command-comp" },
          item.extras || null,
          item.context
            ? div(
                {
                  class: "icon-button",
                  title: "Open context menu",
                  onclick: e => (e.stopPropagation(), this.updateViewState(item.context?.() || {})),
                },
                renderIcon(ChevronRight),
              )
            : null,
        ),
      );

    return div(
      {
        class: "palette",
        ...touchDragger({
          ondraggingx: this.unfocusSearchInput,
          ondraggingy: this.unfocusSearchInput,
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
          {
            class: "icon-action",
            title: "Back to previous context",
            onclick: () => {
              if (!this.undo()) this.close();
              else this.saveState();
            },
          },
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
            onclick: () => this.app.workspace.layout.removeViewInstance(this),
          },
          renderIcon(X),
        ),
      ),
      input({
        placeholder: () => this.getSearchPlaceholder(),
        type: "search",
        class: "palette-search",
        value: this.state.query,
        oninput: e => (this.state.query.val = (e.target as HTMLInputElement).value),
        onfocus: () => (this.isFocusedSearchInput = true),
      }),
      div(
        { class: () => (this.state.expanded.val ? "palette-content expanded" : "palette-content") },
        () => {
          let i = 0;
          return div(
            { class: "palette-content-over" },
            ...this.overviewItems.val.map(group => {
              const { element, nextIndex } = this.renderCategoryGroup(group, i, renderItem);
              i = nextIndex;
              return element;
            }),
          );
        },
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
              group.status.message ||
              group.id === this.state.topCategory.val
                ? (() => {
                    const { element, nextIndex } = this.renderCategoryGroup(group, i, renderItem);
                    i = nextIndex;
                    return element;
                  })()
                : null,
            ),
          );
        },
      ),
    );
  }
}

/**
 * Base abstract class dictating the structure and behavior of a command palette category.
 * * @template T The type of item data specific to this category.
 */
export abstract class CommandCategory<T> {
  /** The reactive source array for all raw items in the category. */
  abstract allItems: State<T[]>;
  /** Array of accessor functions used to evaluate search queries against an item. */
  abstract criteria: Array<(item: T) => string>;
  /** Converts raw item data `T` into a standard `CommandItem` for rendering. */
  abstract renderItem(item: T): CommandItem;

  /** Number of items already rendered before this category, used for slicing results. */
  previousItemCount: number = 0;
  /** Reactive title shown in the palette header. */
  title: State<string>;
  /** Reactive description shown in the palette header. */
  description: State<string>;
  /** Optional commands rendered after the main item list. */
  extras: State<CommandItem[]> = van.state([]);
  /** Reactive, non-selectable status for async work in this category. */
  asyncStatus = van.state<CommandCategoryStatus>({ state: "idle", message: "" });
  /** Optional sibling categories rendered alongside the current category. */
  readonly siblings?: string[];

  private asyncRequestId = 0;
  private activeAsyncController?: AbortController;

  /**
   * @param state The global command palette state mapped for reactivity.
   * @param title Display title for the category.
   * @param description Display description for the category.
   */
  constructor(
    public state: stateMapping<CommandPaletteState>,
    title: string,
    description: string = "",
  ) {
    this.title = van.state(title);
    this.description = van.state(description);
  }

  /**
   * Runs a latest-wins async operation, aborting its predecessor and applying the
   * result only if this request is still current. Loader code should pass the
   * supplied signal to cancellable requests.
   */
  protected runAsyncLatest<T>(
    loader: (signal: AbortSignal) => Promise<T>,
    messages: AsyncCommandMessages<T>,
    applyResult?: (value: T) => void,
  ): Promise<AsyncCommandResult<T>> {
    const requestId = ++this.asyncRequestId;
    this.activeAsyncController?.abort();
    const controller = new AbortController();
    this.activeAsyncController = controller;
    this.asyncStatus.val = { state: "loading", message: messages.loadingMessage };

    return this.finishAsyncRequest(requestId, controller, loader, messages, applyResult);
  }

  private async finishAsyncRequest<T>(
    requestId: number,
    controller: AbortController,
    loader: (signal: AbortSignal) => Promise<T>,
    messages: AsyncCommandMessages<T>,
    applyResult?: (value: T) => void,
  ): Promise<AsyncCommandResult<T>> {
    try {
      const value = await loader(controller.signal);
      if (requestId !== this.asyncRequestId) return { status: "stale" };

      applyResult?.(value);
      const message = messages.successMessage?.(value) || "";
      this.asyncStatus.val = message ? { state: "success", message } : { state: "idle", message: "" };
      return { status: "success", value };
    } catch (error) {
      if (requestId !== this.asyncRequestId) return { status: "stale" };

      const message =
        messages.errorMessage?.(error) || (error instanceof Error ? error.message : String(error));
      this.asyncStatus.val = { state: "error", message };
      return { status: "error", error };
    } finally {
      if (requestId === this.asyncRequestId) this.activeAsyncController = undefined;
    }
  }

  /** Invalidates a running operation so its eventual result cannot be applied. */
  protected invalidateAsync(status: CommandCategoryStatus = { state: "idle", message: "" }): void {
    this.asyncRequestId += 1;
    this.activeAsyncController?.abort();
    this.activeAsyncController = undefined;
    this.asyncStatus.val = status;
  }

  /** Cancels pending work and releases category-specific resources. */
  dispose(): void {
    try {
      this.onDispose();
    } finally {
      this.invalidateAsync();
    }
  }

  /** Hook for categories that own timers or other disposable resources. */
  protected onDispose(): void {}

  /** Loads and applies an item list only if this remains the newest request. */
  protected loadItemsLatest(
    loader: (signal: AbortSignal) => Promise<T[]>,
    messages: AsyncCommandMessages<T[]>,
  ): Promise<AsyncCommandResult<T[]>> {
    return this.runAsyncLatest(loader, messages, items => {
      this.allItems.val = items;
    });
  }

  /**
   * Filters and returns category items that match the current search query.
   *
   * Matching is case-insensitive and de-duplicates items across criteria in the
   * order they are discovered.
   */
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
            (matchedIndices.add(index), true),
        ),
      )
      .flat()
      .slice(0, this.state.maxItems.val - this.previousItemCount);
  }

  /** Merges a partial state update into the shared command palette state. */
  updateViewState(newState: Partial<CommandPaletteState>): void {
    for (const key in newState) {
      const stateEntry = this.state[key as keyof CommandPaletteState];
      if (!stateEntry) continue;
      stateEntry.val = newState[key as keyof CommandPaletteState] as typeof stateEntry.val;
    }
  }
}

/**
 * Built-in category for navigating between other loaded categories.
 */
class NavigatorCategory extends CommandCategory<LoadableCommandCategory> {
  /** Visible categories exposed to the navigator. */
  allItems: State<LoadableCommandCategory[]>;
  criteria: Array<(item: LoadableCommandCategory) => string> = [item => item.name, item => item.description];

  constructor(
    state: stateMapping<CommandPaletteState>,
    palettes: State<LoadableCommandCategory[]>,
    private readonly palette: CommandPalette,
  ) {
    super(state, "Navigator", "Navigate through the application");
    this.allItems = van.derive(() =>
      palettes.val.filter(palette => (palette.isloaded.val, palette.id !== "navigator")),
    );
  }

  /** Renders a category entry that jumps to the selected palette. */
  renderItem(item: LoadableCommandCategory): CommandItem {
    const disabled = this.palette.isCategoryDisabled(item.id);

    return {
      title: item.name,
      description: item.description,
      click: () => ((this.state.topCategory.val = item.id), false),
      extras: toggle({
        checked: !disabled,
        onclick: (e: Event, state) => {
          e.stopPropagation();
          void (state.val ? this.palette.enableCategory(item.id) : this.palette.disableCategory(item.id));
        },
      }),
    };
  }
}

/**
 * Built-in category for handling arbitrary user text prompts and boolean confirmations.
 */
class PromptCategory extends CommandCategory<string> {
  /** Prompt text shown in the palette header. */
  message = van.state("");

  private session: {
    mode: PromptMode;
    previousQuery: string;
    previousTopCategory: string;
    resolve: (value: string | null) => void;
    wasOpen: boolean;
  } | null = null;

  siblings = [];

  allItems = van.state(["Ok", "Cancel"]);
  criteria: Array<(item: string) => string> = [item => item];

  constructor(
    state: stateMapping<CommandPaletteState>,
    private readonly palette: CommandPalette,
  ) {
    super(state, "Prompt", "Prompt for user input");
  }

  get mode(): PromptMode {
    return this.session?.mode ?? "prompt";
  }

  /** Starts a free-text prompt session. */
  prompt(text: string): Promise<string | null> {
    return new Promise(resolve => this.startPromptSession(text, "prompt", resolve));
  }

  /** Starts a confirmation session that resolves to a boolean. */
  confirm(text: string): Promise<boolean> {
    return new Promise(resolve => this.startPromptSession(text, "confirm", value => resolve(value !== null)));
  }

  /**
   * Captures the current palette state, switches into prompt mode, and stores
   * the resolver for later completion.
   */
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

  /** Restores the prior palette state and resolves the pending prompt. */
  private finishPrompt(value: string | null): void {
    const session = this.session;
    if (!session) return;

    this.session = null;
    this.message.val = "";

    if (!session.wasOpen) {
      this.palette.close();
    }

    this.updateViewState({
      query: session.previousQuery,
      topCategory: session.previousTopCategory,
    });

    session.resolve(value);
  }

  /** Cancels an active prompt session without returning input. */
  cancelPrompt(): void {
    this.finishPrompt(null);
  }

  /** Updates the prompt header text and returns the fixed Ok/Cancel items. */
  getItems(): string[] {
    this.title.val = this.mode === "confirm" ? "Confirm" : "Prompt";
    this.description.val = this.message.val;
    return this.allItems.val;
  }

  /** Renders the Ok/Cancel choice items for prompt mode. */
  renderItem(item: string): CommandItem {
    return {
      title: item,
      description:
        item === "Ok"
          ? this.message.val
          : this.mode === "confirm"
            ? "Dismiss this confirmation"
            : "Cancel without saving input",
      click: () => (
        this.finishPrompt(item === "Ok" ? (this.mode === "prompt" ? this.state.query.val : "") : null),
        false
      ),
    };
  }
}

export type Command = {
  /** Stable command id used for registration and gesture lookups. */
  id: string;
  /** Human-readable label shown in the command palette. */
  name: string;
  /** Supporting text shown beneath the command label. */
  description: string;
  /** Lucide icon rendered for the command. */
  icon: IconNode;
  /** Optional command execution callback. */
  callback?: () => void;
  /** Optional check callback used by toggle-style commands. */
  checkCallback?: (checking: boolean) => boolean | void;
};

/** Hidden category that exposes the app's registered command list. */
export class Commands extends CommandCategory<Command> {
  private _commands: Map<string, Command>;
  /** Reactive array mirrored from the internal command map. */
  readonly commands = van.state<Command[]>([]);
  allItems = this.commands;
  criteria = [(item: Command) => item.name, (item: Command) => item.description];

  constructor(public state: stateMapping<CommandPaletteState>) {
    super(state, "Commands", "Run commands");
    this._commands = new Map();
  }

  /** Renders a command row with its icon and execution behavior. */
  renderItem(item: Command): CommandItem {
    return {
      title: item.name,
      description: item.description,
      click: () => (this.execute(item.id), false),
      extras: renderIcon(item.icon),
    };
  }

  /** Registers or replaces a command by id. */
  add(command: Command) {
    if (this._commands.has(command.id))
      console.warn(`Command with id "${command.id}" already exists. It will be overwritten.`);

    this._commands.set(command.id, command);
    this.commands.val = Array.from(this._commands.values());
  }

  /** Removes a command from the registry. */
  delete(id: string) {
    this._commands.delete(id);
    this.commands.val = Array.from(this._commands.values());
  }

  /** Retrieves a command by id. */
  get(id: string): Command | undefined {
    return this._commands.get(id);
  }

  /** Whether a command exists in the registry. */
  has(id: string): boolean {
    return this._commands.has(id);
  }

  /** Checks whether a command is available before execution. */
  available(id: string): boolean {
    const command = this._commands.get(id);
    if (!command) return false;
    if (command.checkCallback) return !!command.checkCallback(true);
    return true;
  }

  /** Executes a command by id, honoring optional toggle-style callbacks. */
  execute(id: string) {
    const command = this._commands.get(id);
    if (command) {
      if (command.checkCallback) void (command.checkCallback(true) && command.checkCallback(false));
      else command.callback?.();
    } else {
      console.warn(`Command with id "${id}" not found.`);
    }
  }
}

/** Safely runs a callback and converts thrown errors into null. */
function tryit<T>(call: () => T, message: string = "An error occurred"): T | null {
  try {
    return call();
  } catch (error) {
    console.error(message, error);
    return null;
  }
}
