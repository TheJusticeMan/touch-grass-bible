// Workspace.ts

import "./Workspace.css";
import { createElement, IconNode, Plus, X } from "lucide";
import { UIComponent } from "./Components";
import { ETarget } from "./Event";

function createDetachedComponent<T extends keyof HTMLElementTagNameMap>(tagName: T): UIComponent<T> {
  return new UIComponent(document.createDocumentFragment(), tagName);
}

class WorkspaceTabButton extends UIComponent<"button"> {
  private onClick: () => void;
  private onClose?: () => void;
  private iconEl: HTMLSpanElement;
  private labelEl: HTMLSpanElement;
  private closeEl: HTMLSpanElement;
  private closeIconEl: HTMLSpanElement;

  constructor(
    tabId: string,
    title: string,
    onClick: () => void,
    unresolved: boolean = false,
    onPointerDown?: (event: PointerEvent) => void,
    onClose?: () => void,
    icon: IconNode | null = null,
  ) {
    super(document.createDocumentFragment(), "button");
    this.onClick = onClick;
    this.onClose = onClose;
    this.element.type = "button";
    this.addClass("panel-tab");
    this.element.dataset.viewId = tabId;
    this.iconEl = document.createElement("span");
    this.iconEl.className = "panel-tab-icon";
    this.labelEl = document.createElement("span");
    this.labelEl.className = "panel-tab-label";
    this.closeEl = document.createElement("span");
    this.closeEl.className = "panel-tab-close";
    this.closeEl.setAttribute("role", "button");
    this.closeEl.setAttribute("aria-label", `Close ${title}`);
    this.closeIconEl = document.createElement("span");
    this.closeIconEl.className = "panel-tab-close-icon";
    this.closeIconEl.appendChild(createElement(X, { "stroke-width": 1.75 }));
    this.closeEl.appendChild(this.closeIconEl);
    this.element.append(this.iconEl, this.labelEl, this.closeEl);
    this.setTitle(title);
    this.setTabIcon(icon);
    this.setCloseable(!!onClose);
    this.setUnresolved(unresolved);
    this.element.addEventListener("click", event => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".panel-tab-close")) {
        return;
      }
      this.onClick();
    });
    this.closeEl.addEventListener("pointerdown", event => {
      event.stopPropagation();
    });
    this.closeEl.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      this.onClose?.();
    });
    if (onPointerDown) {
      this.element.addEventListener("pointerdown", event => {
        const target = event.target as HTMLElement | null;
        if (target?.closest(".panel-tab-close")) {
          return;
        }
        onPointerDown(event);
      });
    }
  }

  setTitle(title: string): this {
    this.labelEl.textContent = title;
    this.closeEl.setAttribute("aria-label", `Close ${title}`);
    return this;
  }

  setTabIcon(icon: IconNode | null): this {
    this.iconEl.replaceChildren();
    if (icon) {
      this.iconEl.appendChild(createElement(icon, { "stroke-width": 1.75 }));
    }
    this.iconEl.classList.toggle("is-hidden", !icon);
    return this;
  }

  setCloseable(closeable: boolean): this {
    this.closeEl.classList.toggle("is-hidden", !closeable);
    return this;
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

type SplitDirection = "horizontal" | "vertical";
type PanelMode = "views" | "panels";

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
  persistent?: boolean;
};

type SerializedPanelView = {
  id: string;
  title: string;
};

type SerializedPanelChild = {
  size: number;
  panel: SerializedPanel;
};

type PanelDropEdge = "left" | "right" | "top" | "bottom" | "center";

type DragDropState = {
  sourcePanel: Panel;
  tabId: string;
  pointerId: number;
  startX: number;
  startY: number;
  dragging: boolean;
  sourceTabButton: HTMLButtonElement;
  targetPanel: Panel | null;
  targetEdge: PanelDropEdge | null;
  targetInsertIndex: number | null;
  targetTabButton: HTMLButtonElement | null;
};

type DetachedPanelView = {
  id: string;
  title: string;
  icon: IconNode | null;
  view: View | null;
  placeholderEl?: HTMLDivElement;
  placeholderComponent?: WorkspacePlaceholder;
};

type ViewFactory = (panel: Panel) => View;

type RestoreLayoutFromStringOptions = {
  onInvalidJSON?: (error: unknown) => void;
  onRejectedLayout?: () => void;
};

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
  private _activePanel: Panel | null = null;
  private panelCounter = 0;
  private suppressLayoutEvents = false;
  private dragState: DragDropState | null = null;

  private readonly onDocumentPointerMove = (event: PointerEvent) => {
    this.handleTabPointerMove(event);
  };

  private readonly onDocumentPointerUp = (event: PointerEvent) => {
    this.handleTabPointerUp(event);
  };

  constructor() {
    super();
    this.rootPanel = this.createPanel("panels", "horizontal", "root");
  }

  createEmptyView(ViewClass: (panel: Panel) => View) {
    this.unregisterView("empty");
    this.registerView("empty", ViewClass);
    return this;
  }

  get activeView(): View | null {
    return this._activeView;
  }

  get activePanel(): Panel | null {
    return this._activePanel;
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
    if (view) {
      this.setActivePanel(view.panel);
    }
    this.markLayoutChanged();
  }

  setActivePanel(panel: Panel | null) {
    if (this._activePanel === panel) return;
    this._activePanel?.setFocused(false);
    this._activePanel = panel;
    this._activePanel?.setFocused(true);
  }

  registerView(id: string, view: ViewFactory) {
    this.RegisteredViews.set(id, view);
    this.rootPanel.hydrateViewsById(id, view);
    this._activeView = this.rootPanel.findActiveView();
    this.setActivePanel(this._activeView?.panel ?? this._activePanel);
    this.markLayoutChanged();
  }

  unregisterView(id: string) {
    this.RegisteredViews.delete(id);
    this.rootPanel.unloadViewsById(id);
    this._activeView = this.rootPanel.findActiveView();
    this.setActivePanel(this._activeView?.panel ?? this._activePanel);
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
      this.setActivePanel(this._activeView?.panel ?? null);
    } catch (error) {
      console.warn("Failed to restore workspace layout", error);
      this.rootPanel = this.createPanel("panels", "horizontal", "root");
      this._activeView = null;
      this.setActivePanel(null);
      this.suppressLayoutEvents = false;
      this.markLayoutChanged();
      return false;
    }

    this.suppressLayoutEvents = false;
    this.markLayoutChanged();
    return true;
  }

  restoreLayoutFromString(
    rawLayout: string,
    fallbackLayout: WorkspaceLayout,
    options: RestoreLayoutFromStringOptions = {},
  ): boolean {
    let parsedLayout: unknown;
    try {
      parsedLayout = JSON.parse(rawLayout);
    } catch (error) {
      options.onInvalidJSON?.(error);
      this.restoreLayout(fallbackLayout);
      return false;
    }

    const restored = this.restoreLayout(parsedLayout as WorkspaceLayout);
    if (!restored) {
      options.onRejectedLayout?.();
      this.restoreLayout(fallbackLayout);
    }
    return restored;
  }

  hasViewInLayout(viewId: string, panel: Panel = this.rootPanel): boolean {
    if (panel.getMode() === "views") {
      return panel.getViews().some((view: { id: string }) => view.id === viewId);
    }

    return panel.childPanels.some(child => this.hasViewInLayout(viewId, child.panel));
  }

  ensureViewInLayout(viewId: string, fallbackLayout: WorkspaceLayout): boolean {
    if (this.hasViewInLayout(viewId)) {
      return true;
    }
    this.restoreLayout(fallbackLayout);
    return false;
  }

  private deserializePanel(serialized: SerializedPanel): Panel {
    const panel = this.createPanel(serialized.mode, serialized.splitDirection, serialized.id);
    panel.setPersistent(!!serialized.persistent);
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
    if (panel.persistent !== undefined && typeof panel.persistent !== "boolean") {
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

  handleTabPointerDown(panel: Panel, tabId: string, event: PointerEvent): void {
    if (event.button !== 0 || this.dragState) return;
    const sourceTabButton = event.currentTarget as HTMLButtonElement | null;
    if (!sourceTabButton) return;
    this.dragState = {
      sourcePanel: panel,
      tabId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      sourceTabButton,
      targetPanel: null,
      targetEdge: null,
      targetInsertIndex: null,
      targetTabButton: null,
    };
    sourceTabButton.setPointerCapture(event.pointerId);
    document.addEventListener("pointermove", this.onDocumentPointerMove);
    document.addEventListener("pointerup", this.onDocumentPointerUp);
  }

  splitPanelForDrop(
    target: Panel,
    edge: Exclude<PanelDropEdge, "center">,
    incoming: DetachedPanelView,
  ): Panel {
    const splitDirection: SplitDirection = edge === "left" || edge === "right" ? "horizontal" : "vertical";
    const existingPanel = this.createPanel("views", splitDirection);
    target.moveAllViewsTo(existingPanel);

    const incomingPanel = this.createPanel("views", splitDirection);
    incomingPanel.insertDetachedView(incoming, 0, true);

    target.setModeSilent("panels");
    target.setSplitDirectionSilent(splitDirection);
    if (edge === "left" || edge === "top") {
      target.addPanelSilent(incomingPanel, 1);
      target.addPanelSilent(existingPanel, 1);
    } else {
      target.addPanelSilent(existingPanel, 1);
      target.addPanelSilent(incomingPanel, 1);
    }
    target.refreshLayoutDom();
    this.normalizeLayout(target);
    this.onPanelMutated();
    return incomingPanel;
  }

  normalizeLayout(startPanel: Panel): void {
    let current: Panel | null = startPanel;
    while (current) {
      current = this.normalizeOne(current);
    }
    this._activeView = this.rootPanel.findActiveView();
    this.setActivePanel(this._activeView?.panel ?? this._activePanel);
  }

  private normalizeOne(panel: Panel): Panel | null {
    if (panel.getMode() === "views") {
      if (panel.views.length > 0) {
        return panel.parent;
      }
      if (panel.isPersistent()) {
        panel.ensureFallbackView();
        return panel.parent;
      }
      if (!panel.parent) {
        return null;
      }
      const parent = panel.parent;
      parent.removePanelSilent(panel.id, true);
      parent.refreshLayoutDom();
      return parent;
    }

    if (panel.childPanels.length === 0) {
      panel.setModeSilent("views");
      panel.refreshLayoutDom();
      return panel.parent;
    }

    if (panel.childPanels.length > 1) {
      return panel.parent;
    }

    const onlyChild = panel.childPanels[0].panel;
    if (!panel.parent) {
      panel.absorbPanel(onlyChild);
      onlyChild.destroyShallow();
      panel.refreshLayoutDom();
      return panel;
    }

    const parent = panel.parent;
    parent.replaceChildPanelSilent(panel.id, onlyChild);
    panel.destroyShallow();
    parent.refreshLayoutDom();
    return parent;
  }

  private handleTabPointerMove(event: PointerEvent): void {
    const dragState = this.dragState;
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
    if (!dragState.dragging && distance < 6) {
      return;
    }

    if (!dragState.dragging) {
      dragState.dragging = true;
      dragState.sourceTabButton.classList.add("is-dragging");
      document.body.classList.add("workspace-tab-dragging");
    }

    this.updateDropTarget(event.clientX, event.clientY);
  }

  private handleTabPointerUp(event: PointerEvent): void {
    const dragState = this.dragState;
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    dragState.sourceTabButton.releasePointerCapture(event.pointerId);
    this.clearDropTargetClasses();

    if (!dragState.dragging) {
      this.clearDragState();
      return;
    }

    const moved = this.performDrop();
    this.clearDragState();
    if (moved) {
      this.onPanelMutated();
    }
  }

  private performDrop(): boolean {
    const dragState = this.dragState;
    if (!dragState || !dragState.targetPanel || !dragState.targetEdge) return false;

    const sourceIndex = dragState.sourcePanel.getViewIndexByTabId(dragState.tabId);
    const extracted = dragState.sourcePanel.extractDetachedView(dragState.tabId);
    if (!extracted) return false;

    if (
      dragState.targetEdge !== "center" &&
      dragState.targetPanel === dragState.sourcePanel &&
      dragState.targetPanel.views.length === 0
    ) {
      dragState.sourcePanel.insertDetachedView(extracted, 0, true);
      return false;
    }

    if (dragState.targetEdge === "center") {
      let targetIndex = dragState.targetInsertIndex ?? dragState.targetPanel.views.length;
      if (sourceIndex >= 0 && dragState.targetPanel === dragState.sourcePanel && targetIndex > sourceIndex) {
        targetIndex -= 1;
      }
      dragState.targetPanel.insertDetachedView(extracted, targetIndex, true);
      this.normalizeLayout(dragState.sourcePanel);
      return true;
    }

    this.splitPanelForDrop(dragState.targetPanel, dragState.targetEdge, extracted);
    this.normalizeLayout(dragState.sourcePanel);
    return true;
  }

  private updateDropTarget(clientX: number, clientY: number): void {
    const dragState = this.dragState;
    if (!dragState) return;

    const hit = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!hit) {
      this.setDropTarget(null, null, null, null);
      return;
    }

    const tabBar = hit.closest(".panel-tabs") as HTMLDivElement | null;
    if (tabBar) {
      const panelEl = tabBar.closest(".panel") as HTMLDivElement | null;
      const panel = panelEl ? this.findPanelById(panelEl.dataset.panelId ?? "") : null;
      if (panel && panel.getMode() === "views") {
        const tabButton = hit.closest(".panel-tab") as HTMLButtonElement | null;
        const insertIndex = panel.getInsertIndexForPointer( tabButton);
        this.setDropTarget(panel, "center", insertIndex, tabButton);
        return;
      }
    }

    const panelEl = hit.closest(".panel") as HTMLDivElement | null;
    const panel = panelEl ? this.findPanelById(panelEl.dataset.panelId ?? "") : null;
    if (!panel || panel.getMode() !== "views" || panel.views.length === 0) {
      this.setDropTarget(null, null, null, null);
      return;
    }

    const contentRect = panel.contentEl.getBoundingClientRect();
    if (contentRect.width <= 0 || contentRect.height <= 0) {
      this.setDropTarget(null, null, null, null);
      return;
    }
    const x = (clientX - contentRect.left) / contentRect.width;
    const y = (clientY - contentRect.top) / contentRect.height;
    const edgeThreshold = 0.24;
    let edge: PanelDropEdge = "center";
    if (x <= edgeThreshold) edge = "left";
    else if (x >= 1 - edgeThreshold) edge = "right";
    else if (y <= edgeThreshold) edge = "top";
    else if (y >= 1 - edgeThreshold) edge = "bottom";
    this.setDropTarget(panel, edge, panel.views.length, null);
  }

  private setDropTarget(
    panel: Panel | null,
    edge: PanelDropEdge | null,
    insertIndex: number | null,
    tabButton: HTMLButtonElement | null,
  ): void {
    const dragState = this.dragState;
    if (!dragState) return;

    if (
      dragState.targetPanel === panel &&
      dragState.targetEdge === edge &&
      dragState.targetInsertIndex === insertIndex &&
      dragState.targetTabButton === tabButton
    ) {
      return;
    }

    this.clearDropTargetClasses();
    dragState.targetPanel = panel;
    dragState.targetEdge = edge;
    dragState.targetInsertIndex = insertIndex;
    dragState.targetTabButton = tabButton;

    if (!panel || !edge) return;
    panel.containerEl.classList.add("is-drop-target", `drop-edge-${edge}`);
    if (tabButton) {
      tabButton.classList.add("is-drop-before");
    }
  }

  private clearDropTargetClasses(): void {
    const dragState = this.dragState;
    if (!dragState) return;
    dragState.targetPanel?.containerEl.classList.remove(
      "is-drop-target",
      "drop-edge-left",
      "drop-edge-right",
      "drop-edge-top",
      "drop-edge-bottom",
      "drop-edge-center",
    );
    dragState.targetTabButton?.classList.remove("is-drop-before");
  }

  private clearDragState(): void {
    const dragState = this.dragState;
    if (!dragState) return;
    this.clearDropTargetClasses();
    dragState.sourceTabButton.classList.remove("is-dragging");
    document.body.classList.remove("workspace-tab-dragging");
    document.removeEventListener("pointermove", this.onDocumentPointerMove);
    document.removeEventListener("pointerup", this.onDocumentPointerUp);
    this.dragState = null;
  }

  findPanelById(panelId: string): Panel | null {
    if (!panelId) return null;
    return this.rootPanel.findPanelById(panelId);
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
  private persistent = false;
  private addTabButton!: HTMLButtonElement;
  private resizeState: {
    pointerId: number;
    handleEl: HTMLDivElement;
    firstPanelId: string;
    secondPanelId: string;
    lastPrimary: number;
  } | null = null;

  private readonly onResizePointerMove = (event: PointerEvent) => {
    this.handleResizePointerMove(event);
  };

  private readonly onResizePointerUp = (event: PointerEvent) => {
    this.handleResizePointerUp(event);
  };

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
    this.containerEl.addEventListener(
      "pointerdown",
      e => (e.stopPropagation(), this.workspace.setActivePanel(this)),
    );
    this.addTabButton = document.createElement("button");
    this.addTabButton.type = "button";
    this.addTabButton.className = "panel-tab panel-tab-add";
    this.addTabButton.setAttribute("aria-label", "New tab");
    this.addTabButton.appendChild(createElement(Plus, { "stroke-width": 1.75 }));
    this.addTabButton.addEventListener("click", () => {
      this.workspace.openView("empty", this);
    });
    this.tabBarEl.appendChild(this.addTabButton);
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

  setPersistent(persistent: boolean): this {
    this.persistent = persistent;
    return this;
  }

  isPersistent(): boolean {
    return this.persistent;
  }

  setSplitDirection(splitDirection: SplitDirection): this {
    this.splitDirection = splitDirection;
    this.refreshLayoutDom();
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
    this.refreshLayoutDom();
    this.workspace.onPanelMutated();
    return this;
  }

  addPanelSilent(panel: Panel, size: number = 1): this {
    if (this.mode !== "panels") {
      throw new Error("Panel is in view mode and cannot accept child panels");
    }
    panel.parent = this;
    this.childPanels.push({ panel, size: Math.max(0.1, size) });
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
    child.panel.destroy();
    this.refreshLayoutDom();
    this.workspace.onPanelMutated();
    return this;
  }

  removePanelSilent(panelId: string, keepChildAlive: boolean = false): this {
    const index = this.childPanels.findIndex(entry => entry.panel.id === panelId);
    if (index < 0) return this;
    const [child] = this.childPanels.splice(index, 1);
    child.panel.parent = null;
    child.panel.containerEl.remove();
    if (!keepChildAlive) {
      child.panel.destroy();
    }
    this.layoutChildPanelSizes();
    return this;
  }

  replaceChildPanelSilent(panelId: string, replacement: Panel): this {
    const index = this.childPanels.findIndex(entry => entry.panel.id === panelId);
    if (index < 0) return this;
    const previous = this.childPanels[index];
    previous.panel.parent = null;
    previous.panel.containerEl.remove();
    replacement.parent = this;
    this.childPanels[index] = { panel: replacement, size: previous.size };
    this.layoutChildPanelSizes();
    return this;
  }

  addView(id: string, view: View, title: string = id, activate: boolean = true): this {
    if (this.mode !== "views") {
      throw new Error("Panel is in panel mode and cannot accept views");
    }
    if (this.childPanels.length > 0) {
      throw new Error("A panel cannot have views and child panels at the same time");
    }
    view.attach();
    view.initializeTitle(title);
    this.insertDetachedView({ id, title, icon: view.icon, view }, this.views.length, activate);
    this.workspace.onPanelMutated();
    return this;
  }

  reorderViewByTabId(tabId: string, targetIndex: number): this {
    const fromIndex = this.views.findIndex(panelView => panelView.tabId === tabId);
    if (fromIndex < 0 || fromIndex === targetIndex) return this;
    const clampedTarget = Math.max(0, Math.min(targetIndex, this.views.length - 1));
    const [panelView] = this.views.splice(fromIndex, 1);
    const adjustedTarget = fromIndex < clampedTarget ? clampedTarget - 1 : clampedTarget;
    this.views.splice(adjustedTarget, 0, panelView);
    this.renderViewOrder();
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
    this.ensureFallbackView();
    this.workspace.normalizeLayout(this);
    this.workspace.onPanelMutated();
    return this;
  }

  setActiveViewById(tabId: string | null): this {
    this.activeViewId = tabId;
    this.workspace.setActivePanel(this);
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

  setFocused(focused: boolean): this {
    this.containerEl.classList.toggle("is-active-panel", focused);
    return this;
  }

  getInsertIndexForPointer(hoveredTabButton: HTMLButtonElement | null): number {
    if (!hoveredTabButton) {
      return this.views.length;
    }
    const hoveredIndex = this.views.findIndex(panelView => panelView.tabButton === hoveredTabButton);
    if (hoveredIndex < 0) return this.views.length;
    return  hoveredIndex ;
  }

  getViewIndexByTabId(tabId: string): number {
    return this.views.findIndex(panelView => panelView.tabId === tabId);
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
        persistent: this.persistent || undefined,
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
      persistent: this.persistent || undefined,
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

  destroyShallow(): void {
    this.childPanels = [];
    this.views = [];
    this.contentEl.innerHTML = "";
    this.tabBarEl.innerHTML = "";
    this.activeViewId = null;
    this.parent = null;
  }

  private applyModeClasses() {
    this.containerComponent.setMode(this.mode);
    this.tabBarComponent.setHidden(this.mode !== "views");
    this.addTabButton.classList.toggle("is-hidden", this.mode !== "views");
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

  findPanelById(panelId: string): Panel | null {
    if (this.id === panelId) {
      return this;
    }
    for (const child of this.childPanels) {
      const found = child.panel.findPanelById(panelId);
      if (found) {
        return found;
      }
    }
    return null;
  }

  extractDetachedView(tabId: string): DetachedPanelView | null {
    const index = this.views.findIndex(panelView => panelView.tabId === tabId);
    if (index < 0) return null;
    const [panelView] = this.views.splice(index, 1);
    panelView.tabComponent.remove();
    panelView.view?.containerEl.remove();
    panelView.placeholderEl?.remove();

    if (this.activeViewId === tabId) {
      const next = this.views.at(Math.max(index - 1, 0)) ?? this.views[0];
      this.activeViewId = null;
      this.setActiveViewById(next?.tabId ?? null);
    }

    this.ensureFallbackView();

    return {
      id: panelView.id,
      title: panelView.title,
      icon: panelView.icon,
      view: panelView.view,
      placeholderEl: panelView.placeholderEl,
      placeholderComponent: panelView.placeholderComponent,
    };
  }

  insertDetachedView(detachedView: DetachedPanelView, targetIndex: number, activate: boolean): string {
    if (this.mode !== "views") {
      throw new Error("Panel is in panel mode and cannot accept views");
    }
    if (this.childPanels.length > 0) {
      throw new Error("A panel cannot have views and child panels at the same time");
    }

    const insertIndex = Math.max(0, Math.min(targetIndex, this.views.length));
    const tabId = this.createUniqueTabId(detachedView.id);
    const icon = detachedView.icon ?? detachedView.view?.icon ?? null;
    const tabComponent = new WorkspaceTabButton(
      tabId,
      detachedView.title,
      () => this.setActiveViewById(tabId),
      !detachedView.view,
      event => this.workspace.handleTabPointerDown(this, tabId, event),
      () => this.removeViewByTabId(tabId),
      icon,
    );
    const tabButton = tabComponent.element;

    const panelView: PanelView = {
      id: detachedView.id,
      tabId,
      title: detachedView.title,
      icon,
      view: detachedView.view,
      tabButton,
      tabComponent,
      placeholderEl: detachedView.placeholderEl,
      placeholderComponent: detachedView.placeholderComponent,
    };

    this.views.splice(insertIndex, 0, panelView);
    this.renderViewOrder();

    if (detachedView.view) {
      detachedView.view.panel = this;
      detachedView.view.initializeIcon(icon);
    }

    if (activate || !this.activeViewId) {
      this.setActiveViewById(tabId);
    } else {
      panelView.view?.containerEl.classList.remove("is-active");
      panelView.placeholderComponent?.setActive(false);
    }

    return tabId;
  }

  moveAllViewsTo(target: Panel): void {
    const movingViews = [...this.views];
    this.views = [];
    this.activeViewId = null;
    this.tabBarEl.innerHTML = "";
    this.contentEl.innerHTML = "";
    movingViews.forEach(panelView => {
      const detached = {
        id: panelView.id,
        title: panelView.title,
        icon: panelView.icon,
        view: panelView.view,
        placeholderEl: panelView.placeholderEl,
        placeholderComponent: panelView.placeholderComponent,
      };
      panelView.tabComponent.remove();
      target.insertDetachedView(detached, target.views.length, false);
    });
    target.setActiveViewById(target.views[0]?.tabId ?? null);
  }

  setModeSilent(mode: PanelMode): this {
    this.mode = mode;
    this.applyModeClasses();
    return this;
  }

  setSplitDirectionSilent(splitDirection: SplitDirection): this {
    this.splitDirection = splitDirection;
    this.applySplitDirection();
    return this;
  }

  refreshLayoutDom(): void {
    this.applyModeClasses();
    this.applySplitDirection();
    if (this.mode === "panels") {
      this.contentEl.innerHTML = "";
      this.childPanels.forEach(({ panel }, index) => {
        this.contentEl.appendChild(panel.containerEl);
        if (index < this.childPanels.length - 1) {
          this.contentEl.appendChild(this.createResizeHandle(index));
        }
      });
      this.layoutChildPanelSizes();
    }
    this.renderViewOrder();
  }

  absorbPanel(source: Panel): void {
    this.mode = source.mode;
    this.splitDirection = source.splitDirection;
    this.childPanels = source.childPanels;
    this.views = [];
    this.activeViewId = null;

    this.childPanels.forEach(child => {
      child.panel.parent = this;
    });

    const sourceViews = [...source.views];
    sourceViews.forEach(panelView => {
      panelView.tabComponent.remove();
      panelView.view?.containerEl.remove();
      panelView.placeholderEl?.remove();
      this.insertDetachedView(
        {
          id: panelView.id,
          title: panelView.title,
          icon: panelView.icon,
          view: panelView.view,
          placeholderEl: panelView.placeholderEl,
          placeholderComponent: panelView.placeholderComponent,
        },
        this.views.length,
        false,
      );
    });
    this.setActiveViewById(this.views[0]?.tabId ?? null);
  }

  private createUniqueTabId(id: string): string {
    const existing = new Set(this.views.map(view => view.tabId));
    let i = this.views.length + 1;
    let candidate = `${id}-${i}`;
    while (existing.has(candidate)) {
      i += 1;
      candidate = `${id}-${i}`;
    }
    return candidate;
  }

  private renderViewOrder(): void {
    if (this.mode !== "views") return;
    this.views.forEach(panelView => {
      this.tabBarEl.appendChild(panelView.tabButton);
      const contentEl = panelView.view?.containerEl ?? panelView.placeholderEl;
      if (contentEl) {
        contentEl.dataset.viewId = panelView.tabId;
        this.contentEl.appendChild(contentEl);
      }
    });
    this.tabBarEl.appendChild(this.addTabButton);
  }

  private createResizeHandle(index: number): HTMLDivElement {
    const handleEl = document.createElement("div");
    handleEl.className = "panel-resize-handle";
    handleEl.dataset.index = String(index);
    handleEl.dataset.direction = this.splitDirection;
    handleEl.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      const first = this.childPanels[index];
      const second = this.childPanels[index + 1];
      if (!first || !second) return;
      const lastPrimary = this.splitDirection === "horizontal" ? event.clientX : event.clientY;
      this.resizeState = {
        pointerId: event.pointerId,
        handleEl,
        firstPanelId: first.panel.id,
        secondPanelId: second.panel.id,
        lastPrimary,
      };
      handleEl.setPointerCapture(event.pointerId);
      document.addEventListener("pointermove", this.onResizePointerMove);
      document.addEventListener("pointerup", this.onResizePointerUp);
      document.body.classList.add("workspace-resizing");
      event.preventDefault();
    });
    return handleEl;
  }

  private handleResizePointerMove(event: PointerEvent): void {
    const resizeState = this.resizeState;
    if (!resizeState || event.pointerId !== resizeState.pointerId) return;
    const first = this.childPanels.find(entry => entry.panel.id === resizeState.firstPanelId);
    const second = this.childPanels.find(entry => entry.panel.id === resizeState.secondPanelId);
    if (!first || !second) return;

    const currentPrimary = this.splitDirection === "horizontal" ? event.clientX : event.clientY;
    const deltaPrimary = currentPrimary - resizeState.lastPrimary;
    if (deltaPrimary === 0) return;

    const firstBounds = first.panel.containerEl.getBoundingClientRect();
    const secondBounds = second.panel.containerEl.getBoundingClientRect();
    const pairPrimary =
      this.splitDirection === "horizontal"
        ? firstBounds.width + secondBounds.width
        : firstBounds.height + secondBounds.height;
    if (pairPrimary <= 0) return;

    const totalSize = first.size + second.size;
    const deltaRatio = (deltaPrimary / pairPrimary) * totalSize;
    const minSize = 0.1;
    const nextFirst = Math.max(minSize, Math.min(first.size + deltaRatio, totalSize - minSize));
    const nextSecond = Math.max(minSize, totalSize - nextFirst);

    first.size = nextFirst;
    second.size = nextSecond;
    resizeState.lastPrimary = currentPrimary;
    this.layoutChildPanelSizes();
    this.workspace.onPanelMutated();
  }

  private handleResizePointerUp(event: PointerEvent): void {
    const resizeState = this.resizeState;
    if (!resizeState || event.pointerId !== resizeState.pointerId) return;
    resizeState.handleEl.releasePointerCapture(event.pointerId);
    document.removeEventListener("pointermove", this.onResizePointerMove);
    document.removeEventListener("pointerup", this.onResizePointerUp);
    document.body.classList.remove("workspace-resizing");
    this.resizeState = null;
  }

  addUnresolvedView(id: string, title: string = id, activate: boolean = true): this {
    if (this.mode !== "views") {
      throw new Error("Panel is in panel mode and cannot accept views");
    }
    if (this.childPanels.length > 0) {
      throw new Error("A panel cannot have views and child panels at the same time");
    }

    const placeholderComponent = new WorkspacePlaceholder("");
    const placeholderEl = placeholderComponent.element;
    this.insertDetachedView(
      {
        id,
        title,
        icon: null,
        view: null,
        placeholderEl,
        placeholderComponent,
      },
      this.views.length,
      activate,
    );
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
          panelView.icon = view.icon;
          panelView.tabComponent.setTabIcon(panelView.icon);
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
    panelView.tabComponent.setTitle(title);
    this.workspace.onPanelMutated();
    return this;
  }

  updateViewIcon(view: View, icon: IconNode | null): this {
    const panelView = this.views.find(v => v.view === view);
    if (!panelView || panelView.icon === icon) return this;

    panelView.icon = icon;
    panelView.tabComponent.setTabIcon(icon);
    this.workspace.onPanelMutated();
    return this;
  }

  ensureFallbackView(): this {
    if (!this.persistent) return this;
    if (this.mode !== "views") return this;
    if (this.views.length > 0) return this;
    this.workspace.openView("empty", this, { activate: true, title: "empty" });
    return this;
  }
}

type PanelView = {
  id: string;
  tabId: string;
  title: string;
  icon: IconNode | null;
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
  private _icon: IconNode | null = null;
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

  get Isfocused(): boolean {
    return this.panel.workspace.activePanel === this.panel && this.panel.workspace.activeView === this;
  }

  get icon(): IconNode | null {
    return this._icon;
  }

  set icon(value: IconNode | null) {
    if (value === this._icon) return;
    this._icon = value;
    this.panel.updateViewIcon(this, value);
  }

  set title(value: string) {
    if (value === this._title) return;
    this._title = value;
    this.panel.updateViewTitle(this, value);
  }

  initializeTitle(title: string): void {
    this._title = title;
  }

  initializeIcon(icon: IconNode | null): void {
    this._icon = icon;
  }

  // Methods for rendering, updating content, etc.
}
