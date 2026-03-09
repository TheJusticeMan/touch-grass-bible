// Workspace.ts

import "./Workspace.css";
import { UIComponent } from "./Components";
import { ETarget } from "./Event";

function createDetachedComponent<T extends keyof HTMLElementTagNameMap>(tagName: T): UIComponent<T> {
  return new UIComponent(document.createDocumentFragment(), tagName);
}

class WorkspaceTabButton extends UIComponent<"button"> {
  constructor(tabId: string, title: string, onClick: () => void, unresolved: boolean = false) {
    super(document.createDocumentFragment(), "button");
    this.element.type = "button";
    this.addClass("panel-tab");
    this.element.textContent = title;
    this.element.dataset.viewId = tabId;
    this.setUnresolved(unresolved);
    this.element.addEventListener("click", onClick);
  }

  setActive(active: boolean): this {
    this.element.classList.toggle("is-active", active);
    return this;
  }

  setUnresolved(unresolved: boolean): this {
    this.element.classList.toggle("is-unresolved", unresolved);
    return this;
  }
}

class WorkspacePlaceholder extends UIComponent<"div"> {
  constructor(tabId: string) {
    super(document.createDocumentFragment(), "div");
    this.addClass("view", "view-unresolved");
    this.element.dataset.viewId = tabId;
  }

  setActive(active: boolean): this {
    this.element.classList.toggle("is-active", active);
    return this;
  }
}

class WorkspacePanelContainer extends UIComponent<"div"> {
  constructor(panelId: string) {
    super(document.createDocumentFragment(), "div");
    this.addClass("panel");
    this.element.dataset.panelId = panelId;
  }

  setMode(mode: PanelMode): this {
    this.element.classList.toggle("panel-mode-views", mode === "views");
    this.element.classList.toggle("panel-mode-panels", mode === "panels");
    return this;
  }
}

class WorkspacePanelTabs extends UIComponent<"div"> {
  constructor() {
    super(document.createDocumentFragment(), "div");
    this.addClass("panel-tabs");
  }

  setHidden(hidden: boolean): this {
    this.element.classList.toggle("is-hidden", hidden);
    return this;
  }
}

class WorkspacePanelContent extends UIComponent<"div"> {
  constructor() {
    super(document.createDocumentFragment(), "div");
    this.addClass("panel-content");
  }

  setSplitDirection(splitDirection: SplitDirection): this {
    this.element.classList.toggle("horizontal", splitDirection === "horizontal");
    this.element.classList.toggle("vertical", splitDirection === "vertical");
    return this;
  }
}

export type SplitDirection = "horizontal" | "vertical";
export type PanelMode = "views" | "panels";

export type WorkspaceLayout = {
  version: 1;
  rootPanel: SerializedPanel;
};

export type SerializedPanel = {
  id: string;
  splitDirection: SplitDirection;
  mode: PanelMode;
  activeViewId?: string;
  views?: SerializedPanelView[];
  children?: SerializedPanelChild[];
};

export type SerializedPanelView = {
  id: string;
  title: string;
};

export type SerializedPanelChild = {
  size: number;
  panel: SerializedPanel;
};

type ViewFactory = (panel: Panel) => View;

type WorkspaceEvents = {
  "layout-change": void;
};

type ViewEvents = {
  attach: void;
  detach: void;
  activate: void;
  deactivate: void;
  open: void;
  close: void;
};

/**
 * A singleton managing the workspace, including open views and active state.
 * It handles layout arrangement, resizing, and inter-view interactions
 * such as communication and drag-and-drop.
 *
 * This is not specific to my bible app, but a general workspace manager for any application with multiple views.
 * It provides a flexible and extensible framework for managing complex UI layouts and interactions.
 *
 * Ideas from Obsidian's workspace management, but adapted for a more general use case.
 */

export class Workspace extends ETarget<WorkspaceEvents> {
  private RegisteredViews: Map<string, ViewFactory> = new Map();
  rootPanel: Panel;
  private _activeView: View | null = null;
  private panelCounter = 0;
  private suppressLayoutEvents = false;

  constructor() {
    super();
    this.rootPanel = this.createPanel("panels", "horizontal", "root");
  }

  get activeView(): View | null {
    return this._activeView;
  }

  createPanel(mode: PanelMode = "views", splitDirection: SplitDirection = "horizontal", id?: string): Panel {
    const panelId = id ?? `panel-${++this.panelCounter}`;
    return new Panel(this, panelId, mode, splitDirection);
  }

  createDefaultLayout(): WorkspaceLayout {
    return {
      version: 1,
      rootPanel: {
        id: "root",
        mode: "panels",
        splitDirection: "horizontal",
        children: [],
      },
    };
  }

  private markLayoutChanged() {
    if (!this.suppressLayoutEvents) {
      this.emit("layout-change", undefined);
    }
  }

  setActiveView(view: View | null) {
    this._activeView = view;
    this.markLayoutChanged();
  }

  registerView(id: string, view: ViewFactory) {
    this.RegisteredViews.set(id, view);
    this.rootPanel.hydrateViewsById(id, view);
    this._activeView = this.rootPanel.findActiveView();
    this.markLayoutChanged();
  }

  unregisterView(id: string) {
    this.RegisteredViews.delete(id);
    this.rootPanel.unloadViewsById(id);
    this._activeView = this.rootPanel.findActiveView();
    this.markLayoutChanged();
  }

  openView(id: string, panel: Panel, options: { title?: string; activate?: boolean } = {}): View | null {
    const viewFactory = this.RegisteredViews.get(id);
    if (!viewFactory) {
      panel.addUnresolvedView(id, options.title ?? id, options.activate ?? true);
      return null;
    }
    const view = viewFactory(panel);
    panel.addView(id, view, options.title ?? id, options.activate ?? true);
    return view;
  }

  serializeLayout(): WorkspaceLayout {
    return {
      version: 1,
      rootPanel: this.rootPanel.serialize(),
    };
  }

  restoreLayout(layout: WorkspaceLayout): boolean {
    if (!this.isValidLayout(layout)) {
      return false;
    }

    this.suppressLayoutEvents = true;
    try {
      this.rootPanel.destroy();
      this.rootPanel = this.deserializePanel(layout.rootPanel);
      this._activeView = this.rootPanel.findActiveView();
    } catch (error) {
      console.warn("Failed to restore workspace layout", error);
      this.rootPanel = this.createPanel("panels", "horizontal", "root");
      this._activeView = null;
      this.suppressLayoutEvents = false;
      this.markLayoutChanged();
      return false;
    }

    this.suppressLayoutEvents = false;
    this.markLayoutChanged();
    return true;
  }

  private deserializePanel(serialized: SerializedPanel): Panel {
    const panel = this.createPanel(serialized.mode, serialized.splitDirection, serialized.id);
    if (serialized.mode === "views") {
      panel.setMode("views");
      serialized.views?.forEach(savedView => {
        this.openView(savedView.id, panel, {
          title: savedView.title,
          activate: false,
        });
      });
      if (serialized.activeViewId) {
        panel.setActiveViewById(serialized.activeViewId);
      }
    } else {
      panel.setMode("panels");
      serialized.children?.forEach(({ size, panel: childPanel }) => {
        const child = this.deserializePanel(childPanel);
        panel.addPanel(child, size);
      });
    }
    return panel;
  }

  private isValidLayout(layout: WorkspaceLayout): boolean {
    if (!layout || layout.version !== 1 || !layout.rootPanel) {
      return false;
    }
    return this.isValidSerializedPanel(layout.rootPanel);
  }

  private isValidSerializedPanel(panel: SerializedPanel): boolean {
    if (!panel.id || (panel.mode !== "views" && panel.mode !== "panels")) {
      return false;
    }
    if (panel.splitDirection !== "horizontal" && panel.splitDirection !== "vertical") {
      return false;
    }
    if (panel.mode === "views") {
      if (panel.children && panel.children.length > 0) return false;
      if (panel.views && !panel.views.every(view => !!view.id && !!view.title)) return false;
      return true;
    }
    if (panel.views && panel.views.length > 0) return false;
    return (panel.children ?? []).every(child => child.size > 0 && this.isValidSerializedPanel(child.panel));
  }

  onPanelMutated() {
    this.markLayoutChanged();
  }

  activateView(viewId: string): boolean {
    return this.rootPanel.activateViewByViewId(viewId);
  }
}

export class Panel {
  private containerComponent: WorkspacePanelContainer;
  private tabBarComponent: WorkspacePanelTabs;
  private contentComponent: WorkspacePanelContent;
  containerEl: HTMLDivElement;
  tabBarEl: HTMLDivElement;
  contentEl: HTMLDivElement;
  childPanels: Array<{ panel: Panel; size: number }> = [];
  views: PanelView[] = [];
  activeViewId: string | null = null;
  parent: Panel | null = null;

  constructor(
    public workspace: Workspace,
    readonly id: string,
    private mode: PanelMode = "views",
    private splitDirection: SplitDirection = "horizontal",
  ) {
    this.containerComponent = new WorkspacePanelContainer(id);
    this.tabBarComponent = new WorkspacePanelTabs();
    this.contentComponent = new WorkspacePanelContent();
    this.containerEl = this.containerComponent.element;
    this.tabBarEl = this.tabBarComponent.element;
    this.contentEl = this.contentComponent.element;
    this.containerEl.append(this.tabBarEl, this.contentEl);
    this.applyModeClasses();
    this.applySplitDirection();
  }

  getMode(): PanelMode {
    return this.mode;
  }

  getSplitDirection(): SplitDirection {
    return this.splitDirection;
  }

  setMode(mode: PanelMode): this {
    if (mode === this.mode) return this;
    if (mode === "views" && this.childPanels.length > 0) {
      throw new Error("Cannot switch panel to view mode while it has child panels");
    }
    if (mode === "panels" && this.views.length > 0) {
      throw new Error("Cannot switch panel to panel mode while it has views");
    }
    this.mode = mode;
    this.applyModeClasses();
    this.workspace.onPanelMutated();
    return this;
  }

  setSplitDirection(splitDirection: SplitDirection): this {
    this.splitDirection = splitDirection;
    this.applySplitDirection();
    this.workspace.onPanelMutated();
    return this;
  }

  addPanel(panel: Panel, size: number = 1): this {
    if (this.mode !== "panels") {
      throw new Error("Panel is in view mode and cannot accept child panels");
    }
    if (this.views.length > 0) {
      throw new Error("A panel cannot have child panels and views at the same time");
    }
    panel.parent = this;
    this.childPanels.push({ panel, size: Math.max(0.1, size) });
    this.contentEl.appendChild(panel.containerEl);
    this.layoutChildPanelSizes();
    this.workspace.onPanelMutated();
    return this;
  }

  setChildSize(panelId: string, size: number): this {
    const child = this.childPanels.find(entry => entry.panel.id === panelId);
    if (!child) return this;
    child.size = Math.max(0.1, size);
    this.layoutChildPanelSizes();
    this.workspace.onPanelMutated();
    return this;
  }

  removePanel(panelId: string): this {
    const index = this.childPanels.findIndex(entry => entry.panel.id === panelId);
    if (index < 0) return this;
    const [child] = this.childPanels.splice(index, 1);
    child.panel.parent = null;
    child.panel.containerEl.remove();
    child.panel.destroy();
    this.layoutChildPanelSizes();
    this.workspace.onPanelMutated();
    return this;
  }

  addView(id: string, view: View, title: string = id, activate: boolean = true): this {
    if (this.mode !== "views") {
      throw new Error("Panel is in panel mode and cannot accept views");
    }
    if (this.childPanels.length > 0) {
      throw new Error("A panel cannot have views and child panels at the same time");
    }
    const tabId = `${id}-${this.views.length + 1}`;
    const tabComponent = new WorkspaceTabButton(tabId, title, () => this.setActiveViewById(tabId));
    const tabButton = tabComponent.element;
    this.tabBarEl.appendChild(tabButton);

    view.containerEl.dataset.viewId = tabId;
    this.contentEl.appendChild(view.containerEl);
    view.attach();

    this.views.push({ id, tabId, title, view, tabButton, tabComponent });
    view.initializeTitle(title);
    if (activate || !this.activeViewId) {
      this.setActiveViewById(tabId);
    } else {
      view.containerEl.classList.remove("is-active");
    }
    this.workspace.onPanelMutated();
    return this;
  }

  removeViewByTabId(tabId: string): this {
    const index = this.views.findIndex(panelView => panelView.tabId === tabId);
    if (index < 0) return this;
    const [panelView] = this.views.splice(index, 1);
    panelView.view?.detach();
    panelView.view?.containerEl.remove();
    panelView.placeholderComponent?.remove();
    panelView.placeholderEl?.remove();
    panelView.tabComponent.remove();
    if (this.activeViewId === tabId) {
      const next = this.views.at(Math.max(index - 1, 0)) ?? this.views[0];
      this.activeViewId = null;
      this.setActiveViewById(next?.tabId ?? null);
    }
    this.workspace.onPanelMutated();
    return this;
  }

  setActiveViewById(tabId: string | null): this {
    this.activeViewId = tabId;
    let nextActive: View | null = null;
    this.views.forEach(panelView => {
      const isActive = panelView.tabId === tabId;
      panelView.tabComponent.setActive(isActive);
      panelView.view?.containerEl.classList.toggle("is-active", isActive);
      panelView.placeholderComponent?.setActive(isActive);
      if (isActive && panelView.view) {
        panelView.view.activate();
        nextActive = panelView.view;
      } else {
        panelView.view?.deactivate();
      }
    });
    this.workspace.setActiveView(nextActive);
    this.workspace.onPanelMutated();
    return this;
  }

  activateViewByViewId(viewId: string): boolean {
    if (this.mode === "views") {
      const found = this.views.find(view => view.id === viewId);
      if (!found) return false;
      this.setActiveViewById(found.tabId);
      return true;
    }
    for (const child of this.childPanels) {
      if (child.panel.activateViewByViewId(viewId)) return true;
    }
    return false;
  }

  getViews(): Array<{ id: string; tabId: string; title: string; view: View }> {
    return this.views
      .filter(panelView => !!panelView.view)
      .map(panelView => ({
        id: panelView.id,
        tabId: panelView.tabId,
        title: panelView.title,
        view: panelView.view as View,
      }));
  }

  findActiveView(): View | null {
    if (this.mode === "views") {
      const active = this.views.find(view => view.tabId === this.activeViewId);
      return active?.view || null;
    }
    for (const child of this.childPanels) {
      const childActive = child.panel.findActiveView();
      if (childActive) {
        return childActive;
      }
    }
    return null;
  }

  serialize(): SerializedPanel {
    if (this.mode === "views") {
      return {
        id: this.id,
        splitDirection: this.splitDirection,
        mode: "views",
        activeViewId: this.activeViewId ?? undefined,
        views: this.views.map(panelView => ({
          id: panelView.id,
          title: panelView.title,
        })),
      };
    }
    return {
      id: this.id,
      splitDirection: this.splitDirection,
      mode: "panels",
      children: this.childPanels.map(({ panel, size }) => ({
        size,
        panel: panel.serialize(),
      })),
    };
  }

  destroy(): void {
    this.childPanels.forEach(({ panel }) => panel.destroy());
    this.childPanels = [];
    this.views.forEach(panelView => {
      panelView.view?.detach();
      panelView.view?.containerEl.remove();
      panelView.placeholderEl?.remove();
      panelView.tabButton.remove();
    });
    this.views = [];
    this.contentEl.innerHTML = "";
    this.tabBarEl.innerHTML = "";
    this.activeViewId = null;
    this.containerEl.remove();
  }

  private applyModeClasses() {
    this.containerComponent.setMode(this.mode);
    this.tabBarComponent.setHidden(this.mode !== "views");
  }

  private applySplitDirection() {
    this.contentComponent.setSplitDirection(this.splitDirection);
    this.layoutChildPanelSizes();
  }

  private layoutChildPanelSizes() {
    if (this.mode !== "panels") return;
    this.childPanels.forEach(({ panel, size }) => {
      panel.containerEl.style.flexGrow = String(size);
      panel.containerEl.style.flexBasis = "0";
      panel.containerEl.style.minWidth = "0";
      panel.containerEl.style.minHeight = "0";
    });
  }

  addUnresolvedView(id: string, title: string = id, activate: boolean = true): this {
    if (this.mode !== "views") {
      throw new Error("Panel is in panel mode and cannot accept views");
    }
    if (this.childPanels.length > 0) {
      throw new Error("A panel cannot have views and child panels at the same time");
    }

    const tabId = `${id}-${this.views.length + 1}`;
    const tabComponent = new WorkspaceTabButton(tabId, title, () => this.setActiveViewById(tabId), true);
    const tabButton = tabComponent.element;
    this.tabBarEl.appendChild(tabButton);

    const placeholderComponent = new WorkspacePlaceholder(tabId);
    const placeholderEl = placeholderComponent.element;
    this.contentEl.appendChild(placeholderEl);

    this.views.push({
      id,
      tabId,
      title,
      view: null,
      tabButton,
      tabComponent,
      placeholderEl,
      placeholderComponent,
    });
    if (activate || !this.activeViewId) {
      this.setActiveViewById(tabId);
    } else {
      placeholderComponent.setActive(false);
    }
    this.workspace.onPanelMutated();
    return this;
  }

  hydrateViewsById(viewId: string, factory: (panel: Panel) => View): this {
    if (this.mode === "views") {
      this.views
        .filter(panelView => panelView.id === viewId && !panelView.view)
        .forEach(panelView => {
          const view = factory(this);
          view.initializeTitle(panelView.title);
          view.containerEl.dataset.viewId = panelView.tabId;
          panelView.placeholderEl?.replaceWith(view.containerEl);
          panelView.placeholderEl = undefined;
          panelView.placeholderComponent = undefined;
          panelView.tabComponent.setUnresolved(false);
          panelView.view = view;
          view.attach();
          if (panelView.tabId === this.activeViewId) {
            view.activate();
            view.containerEl.classList.add("is-active");
          } else {
            view.containerEl.classList.remove("is-active");
          }
        });
      return this;
    }
    this.childPanels.forEach(({ panel }) => panel.hydrateViewsById(viewId, factory));
    return this;
  }

  unloadViewsById(viewId: string): this {
    if (this.mode === "views") {
      this.views
        .filter(panelView => panelView.id === viewId && !!panelView.view)
        .forEach(panelView => {
          const unresolvedComponent = new WorkspacePlaceholder(panelView.tabId);
          const unresolvedEl = unresolvedComponent.element;
          panelView.view?.deactivate();
          panelView.view?.detach();
          panelView.view?.containerEl.replaceWith(unresolvedEl);
          panelView.view = null;
          panelView.placeholderEl = unresolvedEl;
          panelView.placeholderComponent = unresolvedComponent;
          panelView.tabComponent.setUnresolved(true);
        });
      return this;
    }
    this.childPanels.forEach(({ panel }) => panel.unloadViewsById(viewId));
    return this;
  }

  updateViewTitle(view: View, title: string): this {
    const panelView = this.views.find(v => v.view === view);
    if (!panelView || panelView.title === title) return this;

    panelView.title = title;
    panelView.tabButton.textContent = title;
    this.workspace.onPanelMutated();
    return this;
  }
}

type PanelView = {
  id: string;
  tabId: string;
  title: string;
  view: View | null;
  tabButton: HTMLButtonElement;
  tabComponent: WorkspaceTabButton;
  placeholderEl?: HTMLDivElement;
  placeholderComponent?: WorkspacePlaceholder;
};

/**
 * Represents a view within a panel container.
 * Manages the DOM element and rendering for a specific view section.
 */
export class View extends ETarget<ViewEvents> {
  private attached = false;
  private _title = "";
  containerEl: HTMLDivElement;

  constructor(public panel: Panel) {
    super();
    this.containerEl = createDetachedComponent("div").addClass("view").element;
  }

  onAttach(): void {
    // Intended for subclasses
  }

  onDetach(): void {
    // Intended for subclasses
  }

  onActivate(): void {
    // Intended for subclasses
  }

  onDeactivate(): void {
    // Intended for subclasses
  }

  attach() {
    if (this.attached) return;
    this.attached = true;
    this.onAttach();
    this.emit("attach", undefined);
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    this.onDetach();
    this.emit("detach", undefined);
  }

  activate() {
    this.onActivate();
    this.emit("activate", undefined);
  }

  deactivate() {
    this.onDeactivate();
    this.emit("deactivate", undefined);
  }

  get title(): string {
    return this._title;
  }

  set title(value: string) {
    if (value === this._title) return;
    this._title = value;
    this.panel.updateViewTitle(this, value);
  }

  initializeTitle(title: string): void {
    this._title = title;
  }

  // Methods for rendering, updating content, etc.
}
