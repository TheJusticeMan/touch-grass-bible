import { ChevronLeft, ChevronsDownUp, ChevronsUpDown, X } from "lucide";
import van, { ChildDom, State } from "vanjs-core";
import { renderIcon } from "./Icons";
import { stateMapping, View } from "./Workspace";
import { App } from "./App";
import { highlight, HighlightRule } from "./highlighter";
import { escapeRegExp } from "./escapeRegExp";

const { button, div, input, br, span } = van.tags;

type CommandItem = {
  title: string;
  description: string;
  click?: () => void;
  context?: () => void;
  extras?: ChildDom;
  hidden?: boolean;
};

type PaletteWithItems = {
  title: ChildDom;
  description: ChildDom;
  items: CommandItem[];
};

export type CommandPaletteState = {
  expanded: boolean;
  query: string;
  topCategory: string;
  maxItems: number;
};

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
  public viewTypeId: string = "command-palette-v2";
  private readonly registeredPalettes: State<LoadableCommandCategory[]> = van.state([]);
  private readonly registeredHiddenPalettes: State<LoadableCommandCategory[]> = van.state([]);

  selectedIndex = van.state(0);
  overviewPalettes = van.state(["navigator"]);

  overviewItems: State<PaletteWithItems[]>;

  regularItems: State<PaletteWithItems[]>;

  hoverItem: State<CommandItem | null>;
  overviewItemsCount: State<number>;
  highlighter: State<HighlightRule[]>;

  constructor(public readonly app: App) {
    super("", { expanded: false, query: "", topCategory: "", maxItems: 100 });

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
          if (numberRendered + paletteItems.length >= this.state.maxItems.val) {
            const remaining = this.state.maxItems.val - numberRendered;
            items.push({
              title: palette.category.title,
              description: palette.category.description,
              items: paletteItems.slice(0, remaining).map(item => palette.category.renderItem(item)),
            });
            break;
          } else {
            items.push({
              title: palette.category.title,
              description: palette.category.description,
              items: paletteItems.map(item => palette.category.renderItem(item)),
            });
            numberRendered += paletteItems.length;
          }
        }
      }

      return items;
    });

    this.overviewItemsCount = van.derive(() => this.overviewItems.val.flatMap(group => group.items).length);

    this.regularItems = van.derive(() => {
      let numberRendered = 0;

      const items: PaletteWithItems[] = [];

      const topCategory =
        this.registeredPalettes.val.find(p => p.id === this.state.topCategory.val) ||
        this.registeredHiddenPalettes.val.find(p => p.id === this.state.topCategory.val);

      const showingCategories = topCategory
        ? [
            topCategory,
            ...this.registeredPalettes.val.filter(
              p => p.id !== topCategory.id && !this.overviewPalettes.val.includes(p.id),
            ),
          ]
        : this.registeredPalettes.val.filter(p => !this.overviewPalettes.val.includes(p.id));

      for (const palette of showingCategories) {
        palette.category.previousItemCount = numberRendered;

        const paletteItems = palette.category.getItems();
        if (numberRendered + paletteItems.length >= this.state.maxItems.val) {
          const remaining = this.state.maxItems.val - numberRendered;
          items.push({
            title: palette.category.title,
            description: palette.category.description,
            items: paletteItems.slice(0, remaining).map(item => palette.category.renderItem(item)),
          });
          break;
        } else {
          items.push({
            title: palette.category.title,
            description: palette.category.description,
            items: paletteItems.map(item => palette.category.renderItem(item)),
          });
          numberRendered += paletteItems.length;
        }
      }

      return items;
    });

    this.hoverItem = van.derive(
      () =>
        [...this.overviewItems.val, ...this.regularItems.val].flatMap(group => group.items)[
          this.selectedIndex.val
        ] || null,
    );

    this.registerPalette("navigator", () => new NavigatorCategory(this.state, this.registeredPalettes), true);

    for (let i = 1; i <= 200; i++) {
      this.registerPalette(
        `example${i}`,
        ({ state }) => new ExampleCategory(state, `Example Category ${i}`, `This is example category ${i}`),
      );
    }

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
  ) {
    const palette = new LoadableCommandCategory(cfn, id, this.state) as LoadableCommandCategory;
    if (hidden) {
      this.registeredHiddenPalettes.val = [...this.registeredHiddenPalettes.val, palette];
    } else {
      this.registeredPalettes.val = [...this.registeredPalettes.val, palette];
    }
  }

  unregisterPalette(id: string) {
    this.registeredPalettes.val = this.registeredPalettes.val.filter(p => p.id !== id);
    this.registeredHiddenPalettes.val = this.registeredHiddenPalettes.val.filter(p => p.id !== id);
  }

  create(): HTMLElement {
    const renderItem = (index: number, item: CommandItem): HTMLDivElement =>
      div(
        {
          class: () => (this.selectedIndex.val === index ? "command-item selected" : "command-item"),
          onclick: item.click || (() => {}),
          onmouseenter: () => (this.selectedIndex.val = index),
        },
        div(
          { class: "command-item-info" },
          div({ class: "command-title" }, highlight(item.title, this.highlighter.val)),
          div(
            { class: item.hidden ? "command-description hidden" : "command-description" },
            highlight(item.description, this.highlighter.val),
          ),
        ),
        div({ class: "command-comp" }, item.extras || null),
      );

    return div(
      { class: "palette", style: "height: calc(-2em + 947px);" },
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
        placeholder: "Search all...",
        type: "search",
        class: "palette-search",
        value: this.state.query.rawVal,
        oninput: e => (this.state.query.val = (e.target as HTMLInputElement).value),
      }),
      div(
        { class: "palette-content expanded" },
        div(
          { class: "palette-content-inner" },
          () =>
            div(
              { class: "palette-content-over" },
              ...this.overviewItems.val.map(group => {
                let i = 0;
                return div(
                  { class: "category" },
                  div({ class: "category-title" }, group.title),
                  ...group.items.map(item => renderItem(i++, item)),
                );
              }),
            ),
          () => {
            let i = this.overviewItemsCount.val;
            return div(
              { class: "palette-content-main" },
              ...this.regularItems.val.map(group =>
                div(
                  { class: "category" },
                  div({ class: "category-title" }, group.title),
                  ...group.items.map(item => renderItem(i++, item)),
                ),
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
      click: () => (this.state.topCategory.val = item.id),
    };
  }
}

class ExampleCategory extends CommandCategory<string> {
  allItems = van.state(["Apple", "Banana", "Cherry", "Date", "Elderberry"]);
  criteria: Array<(item: string) => string> = [item => item];

  renderItem(item: string): CommandItem {
    return {
      title: item,
      description: `This is a ${item}`,
      click: () => alert(`You clicked on ${item}`),
    };
  }
}
