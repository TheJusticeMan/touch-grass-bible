// Workspace.ts

import { ChevronDown, IconNode, Maximize2, Minimize2, Plus, X } from "lucide";
import { Files } from "../App";
import { ETarget } from "../Event";
import { Button, IconButton, UIComponent } from "../UIComponents";
import "./Workspace.css";
import {
  WorkspaceDialogLayer,
  WorkspacePanelContainer,
  WorkspacePanelContent,
  WorkspacePanelTabs,
  WorkspacePlaceholder,
  WorkspaceRootHost,
  WorkspaceTabButton,
} from "./WorkspaceDom";
import { DragDropController, type PanelDropEdge } from "./WorkspaceDragDrop";
import { WorkspaceDialog, WorkspaceDialogManager, type WorkspaceDialogOptions } from "./WorkspaceDialog";
import { WorkspaceLayoutModel } from "./WorkspaceLayoutModel";
import { GlobalSwipeHandler } from "./WorkspaceMobileSwipe";
import { monkeypatchAllWorkspaceMethods } from "./WorkspaceTrace";

const WORKSPACE_CONFIG_NAME = "workspace";
const AUTO_SAVE_DELAY_MS = 500;

export type SplitAxis = "row" | "column";
export type NodeType = "TabGroup" | "SplitGroup";

export type WorkspaceLayout = {
  version: 2;
  rootPanel: SerializedPanel;
  activeViewPanelPath?: number[];
  activeViewIndex?: number;
};

export type SerializedPanel = {
  id: string;
  splitAxis: SplitAxis;
  mode: NodeType;
  visibleViewIndex?: number;
  views?: SerializedPanelView[];
  children?: SerializedPanelChild[];
  persistent?: boolean;
};

type SerializedPanelView = {
  viewType: string;
  title: string;
  state?: unknown;
};

type SerializedPanelChild = {
  size: number;
  panel: SerializedPanel;
};

type DetachedTab = {
  viewType: string;
  title: string;
  icon: IconNode | null;
  view: View | null;
  state?: unknown;
  placeholderEl?: HTMLDivElement;
  placeholderComponent?: WorkspacePlaceholder;
};

export type DropIntent =
  | {
      kind: "reorder";
      sourcePanelId: string;
      sourceTabId: string;
      targetPanelId: string;
      targetIndex: number;
    }
  | {
      kind: "split";
      sourcePanelId: string;
      sourceTabId: string;
      targetPanelId: string;
      edge: Exclude<PanelDropEdge, "center">;
    };

type ViewFactory = (panel: LayoutNode) => View;

type RestoreLayoutFromStringOptions = {
  onInvalidJSON?: (error: unknown) => void;
  onRejectedLayout?: () => void;
};

export type WorkspaceHost = {
  contentEl: HTMLElement;
  files: Files;
  getDefaultWorkspaceLayout(): WorkspaceLayout;
  onWorkspaceLayoutInvalid(error: unknown): void;
  onWorkspaceLayoutRejected(): void;
};

function createDefaultWorkspaceHost(): WorkspaceHost {
  return {
    contentEl: document.body,
    files: {
      loadConfig: async () => "",
      saveConfig: async () => {},
    } as unknown as Files,
    getDefaultWorkspaceLayout: () => ({
      version: 2,
      rootPanel: {
        id: "root",
        splitAxis: "row",
        mode: "SplitGroup",
        children: [],
      },
    }),
    onWorkspaceLayoutInvalid: () => {},
    onWorkspaceLayoutRejected: () => {},
  };
}

type WorkspaceEvents = {
  "layout-change": void;
  "dialog-open": { id: string };
  "dialog-close": { id: string };
  keydown: { key: string; event: KeyboardEvent };
  historypop: object;
  draggingX: { deltaX: number };
  draggingY: { deltaY: number };
  dragX: { deltaX: number };
  dragY: { deltaY: number };
  dragCancel: { deltaX: number; deltaY: number };
  dragXcancel: { deltaX: number; deltaY: number };
  dragYcancel: { deltaX: number; deltaY: number };
  [key: string]: unknown;
};

type WorkspaceElectronBridge = {
  windowMinimize?: () => Promise<void>;
  windowMaximize?: () => Promise<void>;
  windowClose?: () => Promise<void>;
  windowIsMaximized?: () => Promise<boolean>;
  onWindowMaximizedChange?: (callback: (isMaximized: boolean) => void) => () => void;
};

type ViewEvents = {
  attach: void;
  detach: void;
  activate: void;
  deactivate: void;
  open: void;
  close: void;
};

class LayoutTreeService {
  constructor(private workspace: Workspace) {}

  applyDropIntent(intent: DropIntent): boolean {
    const sourcePanel = this.workspace.findPanelById(intent.sourcePanelId);
    const targetPanel = this.workspace.findPanelById(intent.targetPanelId);
    if (!sourcePanel || !targetPanel) {
      return false;
    }

    const sourceIndex = sourcePanel.getViewIndexByTabId(intent.sourceTabId);
    const extracted = sourcePanel.extractDetachedView(intent.sourceTabId);
    if (!extracted) {
      return false;
    }

    if (intent.kind === "reorder") {
      let targetIndex = intent.targetIndex;
      if (sourceIndex >= 0 && targetPanel === sourcePanel && targetIndex > sourceIndex) {
        targetIndex -= 1;
      }
      targetPanel.insertDetachedView(extracted, targetIndex, true);
      if (targetPanel !== sourcePanel) {
        this.normalizeLayout(sourcePanel);
      }
      return true;
    }

    if (targetPanel === sourcePanel && sourcePanel.views.length === 0) {
      sourcePanel.insertDetachedView(extracted, 0, true);
      return false;
    }

    this.splitPanelForDrop(targetPanel, intent.edge, extracted);
    this.normalizeLayout(sourcePanel);
    return true;
  }

  splitPanelForDrop(
    target: LayoutNode,
    edge: Exclude<PanelDropEdge, "center">,
    incoming: DetachedTab,
  ): LayoutNode {
    const splitAxis: SplitAxis = edge === "left" || edge === "right" ? "row" : "column";
    const existingPanel = this.workspace.createPanel("TabGroup", splitAxis, undefined, target);
    target.moveAllViewsTo(existingPanel);

    const incomingPanel = this.workspace.createPanel("TabGroup", splitAxis, undefined, target);
    incomingPanel.insertDetachedView(incoming, 0, true);

    target.setMode("SplitGroup", false);
    target.setSplitAxis(splitAxis, false);
    if (edge === "left" || edge === "top") {
      target.addPanel(incomingPanel, 1, false);
      target.addPanel(existingPanel, 1, false);
    } else {
      target.addPanel(existingPanel, 1, false);
      target.addPanel(incomingPanel, 1, false);
    }
    target.refreshLayoutDom();
    this.normalizeLayout(target);
    this.workspace.onPanelMutated();
    return incomingPanel;
  }

  normalizeLayout(startPanel: LayoutNode): void {
    let current: LayoutNode | null = startPanel;
    while (current) {
      current = this.normalizeOne(current);
    }
    this.workspace.setActiveView(this.workspace.rootPanel.findActiveView());
  }

  private normalizeOne(panel: LayoutNode): LayoutNode | null {
    if (panel.getMode() === "TabGroup") {
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
      parent.removePanel(panel.id, { keepChildAlive: true, notify: false });
      parent.refreshLayoutDom();
      return parent;
    }

    if (panel.childPanels.length === 0) {
      panel.setMode("TabGroup", false);
      panel.refreshLayoutDom();
      return panel.parent;
    }

    if (panel.childPanels.length > 1) {
      return panel.parent;
    }

    const onlyChild = panel.childPanels[0].panel;
    if (panel.isPersistent()) {
      onlyChild.setPersistent(true);
    }

    if (!panel.parent) {
      panel.absorbPanel(onlyChild);
      onlyChild.destroyShallow();
      panel.refreshLayoutDom();
      return panel;
    }

    const parent = panel.parent;
    parent.replaceChildPanel(panel.id, onlyChild);
    panel.destroyShallow();
    parent.refreshLayoutDom();
    return parent;
  }
}

/**
 * A singleton managing the workspace, including open views and active state.
 * It handles layout arrangement, resizing, and inter-view interactions
 * such as communication and drag-and-drop.
 *
 * This is not specific to my bible app, but a general workspace manager for any application with multiple views.
 * It provides a flexible and extensible framework for managing complex UI layouts and interactions.
 *
 * Ideas from modern workspace management, adapted for a general use case.
 */
export class Workspace extends ETarget<WorkspaceEvents> {
  private RegisteredViews: Map<string, ViewFactory> = new Map();
  rootPanel: LayoutNode;
  private mutator: LayoutTreeService;
  private _activeView: View | null = null;
  private _activePanel: LayoutNode | null = null;
  private _lastActiveViewByType: Map<string, View> = new Map();
  private panelCounter = 0;
  private suppressLayoutEvents = false;
  private dragDrop: DragDropController;
  private initialized = false;
  private initializingPromise: Promise<boolean> | null = null;
  private hostEl: HTMLDivElement | null = null;
  private dialogLayerEl: HTMLDivElement | null = null;
  private autoSaveBound = false;
  private saveTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private globalSwipeHandler: GlobalSwipeHandler | null = null;
  private windowControlsOwner: LayoutNode | null = null;
  private _isElectronRenderer: boolean | null = null;
  private dialogManager: WorkspaceDialogManager;
  private keyboardBound = false;

  constructor(public app: WorkspaceHost = createDefaultWorkspaceHost()) {
    super();
    this.rootPanel = this.createPanel("SplitGroup", "row", "root");
    this.mutator = new LayoutTreeService(this);
    this.dragDrop = new DragDropController(this);
    this.dialogManager = new WorkspaceDialogManager(this);
    this.registerView("empty", panel => new EmptyView(panel));
  }

  private ensureHost(): HTMLDivElement {
    if (this.hostEl) {
      return this.hostEl;
    }
    this.hostEl = new WorkspaceRootHost().mount(this.app.contentEl).element;
    this.dialogLayerEl = new WorkspaceDialogLayer().mount(this.app.contentEl).element;
    this.globalSwipeHandler = new GlobalSwipeHandler(this.hostEl, this);
    return this.hostEl;
  }

  ensureDialogLayer(): HTMLDivElement {
    this.ensureHost();
    if (this.dialogLayerEl) {
      return this.dialogLayerEl;
    }
    this.dialogLayerEl = new WorkspaceDialogLayer().mount(this.app.contentEl).element;
    return this.dialogLayerEl;
  }

  mountRoot() {
    const host = this.ensureHost();
    host.empty();
    host.appendChild(this.rootPanel.containerEl);
  }

  private composeKey(event: KeyboardEvent): string {
    return (
      (event.metaKey ? "Meta+" : "") +
      (event.ctrlKey ? "Ctrl+" : "") +
      (event.altKey ? "Alt+" : "") +
      (event.shiftKey ? "Shift+" : "") +
      event.key
    );
  }

  private readonly onDocumentKeyDown = (event: KeyboardEvent): void => {
    const key = this.composeKey(event);
    if (key === "Escape" && this.dialogManager.handleEscape(event)) {
      return;
    }

    const payload = { key, event };
    this.emit("keydown", payload);
    this.emit(`${key}KeyDown`, payload);
  };

  private bindKeyboard(): void {
    if (this.keyboardBound) {
      return;
    }
    document.addEventListener("keydown", this.onDocumentKeyDown);
    this.keyboardBound = true;
  }

  private unbindKeyboard(): void {
    if (!this.keyboardBound) {
      return;
    }
    document.removeEventListener("keydown", this.onDocumentKeyDown);
    this.keyboardBound = false;
  }

  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }
    if (this.initializingPromise) {
      return this.initializingPromise;
    }

    this.initializingPromise = (async () => {
      const rawLayout = await this.app.files.loadConfig(WORKSPACE_CONFIG_NAME);
      const restored = this.restoreLayoutFromString(rawLayout, this.app.getDefaultWorkspaceLayout(), {
        onInvalidJSON: error => this.app.onWorkspaceLayoutInvalid(error),
        onRejectedLayout: () => this.app.onWorkspaceLayoutRejected(),
      });
      this.mountRoot();
      this.enableAutoSave();
      this.bindKeyboard();
      this.initialized = true;
      return restored;
    })().finally(() => (this.initializingPromise = null));

    return this.initializingPromise;
  }

  async saveLayout(): Promise<void> {
    const serializedLayout = this.serializeLayout();
    await this.app.files.saveConfig(WORKSPACE_CONFIG_NAME, JSON.stringify(serializedLayout));
  }

  saveAfterDelay(delay: number = AUTO_SAVE_DELAY_MS) {
    if (this.saveTimeoutId !== null) {
      clearTimeout(this.saveTimeoutId);
      this.saveTimeoutId = null;
    }
    this.saveTimeoutId = setTimeout(() => {
      void this.saveLayout();
      this.saveTimeoutId = null;
    }, delay);
  }

  enableAutoSave(delay: number = AUTO_SAVE_DELAY_MS) {
    if (this.autoSaveBound) {
      return;
    }
    this.autoSaveBound = true;
    this.on("layout-change", () => this.saveAfterDelay(delay));
  }

  shutdown() {
    if (this.saveTimeoutId !== null) {
      clearTimeout(this.saveTimeoutId);
      this.saveTimeoutId = null;
    }
    void this.saveLayout();
    this.dragDrop.destroy();
    this.dialogManager.closeAll();
    this.unbindKeyboard();
    this.globalSwipeHandler?.destroy();
    this.globalSwipeHandler = null;
  }

  openDialog(options: WorkspaceDialogOptions = {}): WorkspaceDialog {
    return this.dialogManager.open(options);
  }

  closeDialog(id: string): boolean {
    return this.dialogManager.close(id);
  }

  closeTopDialog(): boolean {
    return this.dialogManager.closeTop();
  }

  closeAllDialogs(): void {
    this.dialogManager.closeAll();
  }

  isDialogOpen(id: string): boolean {
    return this.dialogManager.isOpen(id);
  }

  listOpenDialogs(): string[] {
    return this.dialogManager.listOpenDialogIds();
  }

  get activeView(): View | null {
    return this._activeView;
  }

  get activePanel(): LayoutNode | null {
    return this._activePanel;
  }

  /**
   * Get the last active view of a specific type.
   * Returns null if no view of that type has been activated yet.
   */
  getActiveViewOfType(viewType: string): View | null {
    const view = this._lastActiveViewByType.get(viewType);
    // Verify the tracked view still exists and is valid
    if (view && this.rootPanel.containsView(view)) {
      return view;
    }
    // Clean up stale reference
    this._lastActiveViewByType.delete(viewType);
    return null;
  }

  createPanel(
    mode: NodeType = "TabGroup",
    splitAxis: SplitAxis = "row",
    id?: string,
    parent?: LayoutNode | null,
  ): LayoutNode {
    const panelId = id ?? `panel-${++this.panelCounter}`;
    return new LayoutNode(this, panelId, mode, splitAxis, parent);
  }

  private isElectronRenderer(): boolean {
    if (this._isElectronRenderer === null) {
      this._isElectronRenderer =
        typeof window !== "undefined" &&
        !!(window as { touchGrassElectronPlatform?: object }).touchGrassElectronPlatform;
    }
    return this._isElectronRenderer;
  }

  draggablePanels: LayoutNode[] = [];

  private resolveWindowControlsOwner(): LayoutNode | null {
    if (!this.isElectronRenderer()) {
      return null;
    }

    const getPanel = (panel: LayoutNode): LayoutNode | null => {
      if (panel.getMode() === "TabGroup") {
        return panel;
      } else if (panel.childPanels.length > 0) {
        if (panel.getSplitAxis() === "row") {
          return getPanel(panel.childPanels[panel.childPanels.length - 1].panel);
        } else {
          return getPanel(panel.childPanels[0].panel);
        }
      } else {
        return null;
      }
    };

    const candidate = getPanel(this.rootPanel);

    const getDraggablePanels = (panel: LayoutNode): LayoutNode[] => {
      if (panel.getMode() === "TabGroup") {
        return [panel];
      } else if (panel.childPanels.length > 0) {
        if (panel.getSplitAxis() === "row") {
          return panel.childPanels.map(child => getDraggablePanels(child.panel)).flat();
        } else {
          return getDraggablePanels(panel.childPanels[0].panel);
        }
      } else {
        return [];
      }
    };

    const newDraggablePanels: LayoutNode[] = getDraggablePanels(this.rootPanel);

    for (const panel of [...this.draggablePanels, ...newDraggablePanels]) {
      panel.makeDraggable(newDraggablePanels.includes(panel));
    }

    this.draggablePanels = newDraggablePanels;

    return candidate;
  }

  shouldShowWindowControls(panel: LayoutNode): boolean {
    return this.windowControlsOwner === panel;
  }

  refreshWindowControls(): void {
    const previousOwner = this.windowControlsOwner;
    const nextOwner = this.resolveWindowControlsOwner();
    this.windowControlsOwner = nextOwner;

    if (previousOwner && previousOwner !== nextOwner) {
      previousOwner.syncWindowControls();
    }
    if (nextOwner) {
      nextOwner.syncWindowControls();
    }
  }

  private markLayoutChanged() {
    if (!this.suppressLayoutEvents) {
      this.emit("layout-change", undefined);
    }
  }

  setActiveView(view: View | null) {
    if (this._activeView === view) {
      if (view) {
        this.setActivePanel(view.panel);
      }
      return;
    }
    this._activeView = view;
    if (view) {
      this.setActivePanel(view.panel);
      // Track this view as the last active view of its type
      if (view.viewTypeId) {
        this._lastActiveViewByType.set(view.viewTypeId, view);
      }
    }
    this.markLayoutChanged();
  }

  setActivePanel(panel: LayoutNode | null) {
    if (this._activePanel === panel) return;
    this._activePanel?.setFocused(false);
    this._activePanel = panel;
    this._activePanel?.setFocused(true);
  }

  registerView(viewType: string, view: ViewFactory) {
    const previousActive = this._activeView;
    this.RegisteredViews.set(viewType, view);
    this.rootPanel.hydrateViewsByType(viewType, view);
    if (previousActive) {
      this.setActiveView(previousActive);
      return;
    }
    this.setActiveView(this.rootPanel.findActiveView());
  }

  unregisterView(viewType: string) {
    const previousActive = this._activeView;
    this.RegisteredViews.delete(viewType);
    this.rootPanel.unloadViewsByType(viewType);
    if (previousActive && previousActive.viewTypeId !== viewType) {
      this.setActiveView(previousActive);
      return;
    }
    this.setActiveView(this.rootPanel.findActiveView());
  }

  listRegisteredViews(): string[] {
    return Array.from(this.RegisteredViews.keys());
  }

  openView(
    viewType: string,
    panel: LayoutNode,
    options: { title?: string; activate?: boolean; state?: unknown } = {},
  ): View | null {
    const viewFactory = this.RegisteredViews.get(viewType);
    if (!viewFactory) {
      panel.addUnresolvedView(viewType, options.title ?? viewType, options.activate ?? true, options.state);
      return null;
    }
    const view = viewFactory(panel);
    panel.addView(viewType, view, options.title ?? viewType, options.activate ?? true, options.state);
    return view;
  }

  serializeLayout(): WorkspaceLayout {
    const activeLocation = this.getActiveViewLocation();
    return {
      version: 2,
      rootPanel: this.rootPanel.serialize(),
      activeViewPanelPath: activeLocation?.panelPath,
      activeViewIndex: activeLocation?.viewIndex,
    };
  }

  restoreLayout(layout: WorkspaceLayout): boolean {
    if (!this.isValidLayout(layout)) {
      return false;
    }

    this.suppressLayoutEvents = true;
    try {
      this.windowControlsOwner = null;
      this.rootPanel.destroy();
      this.rootPanel = this.deserializePanel(layout.rootPanel);
      if (
        Array.isArray(layout.activeViewPanelPath) &&
        layout.activeViewPanelPath.every(index => Number.isInteger(index) && index >= 0) &&
        typeof layout.activeViewIndex === "number"
      ) {
        const restored = this.activateViewByIndex(layout.activeViewPanelPath, layout.activeViewIndex);
        if (!restored) {
          this.setActiveView(this.rootPanel.findActiveView());
        }
      } else {
        this.setActiveView(this.rootPanel.findActiveView());
      }
      this.refreshWindowControls();
    } catch (error) {
      console.warn("Failed to restore workspace layout", error);
      this.rootPanel = this.createPanel("SplitGroup", "row", "root");
      this.windowControlsOwner = null;
      this.setActiveView(null);
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

  hasViewInLayout(viewType: string, panel: LayoutNode = this.rootPanel): boolean {
    if (panel === this.rootPanel) {
      return WorkspaceLayoutModel.hasView(this.serializeLayout(), viewType);
    }

    if (panel.getMode() === "TabGroup") {
      return panel.getViews().some(view => view.viewType === viewType);
    }

    return panel.childPanels.some(child => this.hasViewInLayout(viewType, child.panel));
  }

  ensureViewInLayout(viewType: string, fallbackLayout: WorkspaceLayout): boolean {
    if (this.hasViewInLayout(viewType)) {
      return true;
    }
    this.restoreLayout(fallbackLayout);
    return false;
  }

  private deserializePanel(serialized: SerializedPanel, parent?: LayoutNode | null): LayoutNode {
    const panel = this.createPanel(serialized.mode, serialized.splitAxis, serialized.id, parent);
    panel.setPersistent(!!serialized.persistent);
    if (serialized.mode === "TabGroup") {
      panel.setMode("TabGroup");
      serialized.views?.forEach(savedView => {
        this.openView(savedView.viewType, panel, {
          title: savedView.title,
          activate: false,
          state: savedView.state,
        });
      });
      if (typeof serialized.visibleViewIndex === "number") {
        panel.showViewByIndex(serialized.visibleViewIndex, false);
      }
    } else {
      panel.setMode("SplitGroup");
      serialized.children?.forEach(({ size, panel: childPanel }) => {
        const child = this.deserializePanel(childPanel, panel);
        panel.addPanel(child, size);
      });
    }
    return panel;
  }

  private isValidLayout(layout: WorkspaceLayout): boolean {
    return WorkspaceLayoutModel.isValidLayout(layout);
  }

  onPanelMutated() {
    if (!this.suppressLayoutEvents) {
      this.refreshWindowControls();
    }
    this.markLayoutChanged();
  }

  onViewStateMutated() {
    this.markLayoutChanged();
  }

  activateView(viewType: string): boolean {
    return this.rootPanel.activateViewByViewType(viewType);
  }

  private getActiveViewLocation(): { panelPath: number[]; viewIndex: number } | null {
    if (!this._activeView) {
      return null;
    }
    const viewIndex = this._activeView.panel.views.findIndex(v => v.view === this._activeView);
    if (viewIndex < 0) {
      return null;
    }
    const panelPath = this.findPanelPath(this._activeView.panel);
    if (!panelPath) {
      return null;
    }
    return { panelPath, viewIndex };
  }

  private findPanelPath(targetPanel: LayoutNode): number[] | null {
    const walk = (panel: LayoutNode, path: number[]): number[] | null => {
      if (panel === targetPanel) {
        return path;
      }
      for (let i = 0; i < panel.childPanels.length; i += 1) {
        const found = walk(panel.childPanels[i].panel, [...path, i]);
        if (found) {
          return found;
        }
      }
      return null;
    };

    return walk(this.rootPanel, []);
  }

  private getPanelByPath(path: number[]): LayoutNode | null {
    let panel: LayoutNode = this.rootPanel;
    for (const index of path) {
      const next = panel.childPanels[index]?.panel;
      if (!next) {
        return null;
      }
      panel = next;
    }
    return panel;
  }

  private activateViewByIndex(panelPath: number[], viewIndex: number): boolean {
    const panel = this.getPanelByPath(panelPath);
    if (!panel || panel.getMode() !== "TabGroup") {
      return false;
    }
    return panel.setActiveViewByIndex(viewIndex);
  }

  handleTabPointerDown(panel: LayoutNode, tabId: string, event: PointerEvent): void {
    this.dragDrop.handleTabPointerDown(panel, tabId, event);
  }

  splitPanelForDrop(
    target: LayoutNode,
    edge: Exclude<PanelDropEdge, "center">,
    incoming: DetachedTab,
  ): LayoutNode {
    return this.mutator.splitPanelForDrop(target, edge, incoming);
  }

  normalizeLayout(startPanel: LayoutNode): void {
    this.mutator.normalizeLayout(startPanel);
  }

  applyDropIntent(intent: DropIntent): boolean {
    const moved = this.mutator.applyDropIntent(intent);
    if (moved) {
      this.onPanelMutated();
    }
    return moved;
  }

  findPanelById(panelId: string): LayoutNode | null {
    if (!panelId) return null;
    return this.rootPanel.findPanelById(panelId);
  }
}

class SplitterController {
  private resizeHandleComponents: UIComponent<"div">[] = [];
  private resizeState: {
    pointerId: number;
    handleEl: HTMLDivElement;
    firstPanelId: string;
    secondPanelId: string;
    lastPrimary: number;
  } | null = null;

  private readonly onResizePointerMove = (event: PointerEvent) => this.handleResizePointerMove(event);

  private readonly onResizePointerUp = (event: PointerEvent) => this.handleResizePointerUp(event);

  constructor(private panel: LayoutNode) {}

  createHandle(index: number): HTMLDivElement {
    const handleComponent = UIComponent.detached("div")
      .addClass("panel-resize-handle")
      .setData({
        index: String(index),
        splitAxis: this.panel.getSplitAxis(),
      })
      .listen("pointerdown", event => {
        if (event.button !== 0) return;
        const first = this.panel.childPanels[index];
        const second = this.panel.childPanels[index + 1];
        if (!first || !second) return;
        const lastPrimary = this.panel.getSplitAxis() === "row" ? event.clientX : event.clientY;
        this.resizeState = {
          pointerId: event.pointerId,
          handleEl: event.currentTarget as HTMLDivElement,
          firstPanelId: first.panel.id,
          secondPanelId: second.panel.id,
          lastPrimary,
        };
        (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
        document.addEventListener("pointermove", this.onResizePointerMove);
        document.addEventListener("pointerup", this.onResizePointerUp);
        document.body.classList.add("workspace-resizing");
        event.preventDefault();
      });
    this.resizeHandleComponents.push(handleComponent);
    return handleComponent.element;
  }

  clearHandles(): void {
    this.resizeHandleComponents.forEach(handle => handle.remove());
    this.resizeHandleComponents = [];
  }

  destroy(): void {
    this.clearHandles();
    if (this.resizeState) {
      document.removeEventListener("pointermove", this.onResizePointerMove);
      document.removeEventListener("pointerup", this.onResizePointerUp);
      document.body.classList.remove("workspace-resizing");
      this.resizeState = null;
    }
  }

  private handleResizePointerMove(event: PointerEvent): void {
    const resizeState = this.resizeState;
    if (!resizeState || event.pointerId !== resizeState.pointerId) return;
    const first = this.panel.childPanels.find(entry => entry.panel.id === resizeState.firstPanelId);
    const second = this.panel.childPanels.find(entry => entry.panel.id === resizeState.secondPanelId);
    if (!first || !second) return;

    const currentPrimary = this.panel.getSplitAxis() === "row" ? event.clientX : event.clientY;
    const deltaPrimary = currentPrimary - resizeState.lastPrimary;
    if (deltaPrimary === 0) return;

    const firstBounds = first.panel.containerEl.getBoundingClientRect();
    const secondBounds = second.panel.containerEl.getBoundingClientRect();
    const pairPrimary =
      this.panel.getSplitAxis() === "row"
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
    this.panel.layoutChildPanelSizes();
    this.panel.workspace.onPanelMutated();
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
}

type PanelView = {
  viewType: string;
  tabId: string;
  title: string;
  icon: IconNode | null;
  view: View | null;
  state?: unknown;
  tabButton: HTMLButtonElement;
  tabComponent: WorkspaceTabButton;
  placeholderEl?: HTMLDivElement;
  placeholderComponent?: WorkspacePlaceholder;
};

export class LayoutNode {
  private containerComponent: WorkspacePanelContainer;
  private tabBarComponent: WorkspacePanelTabs;
  private contentComponent: WorkspacePanelContent;
  containerEl: HTMLDivElement;
  tabBarEl: HTMLDivElement;
  contentEl: HTMLDivElement;
  childPanels: Array<{ panel: LayoutNode; size: number }> = [];
  views: PanelView[] = [];
  activeViewId: string | null = null;
  parent: LayoutNode | null = null;
  private persistent = false;
  private addTabButton!: UIComponent<"button">;
  private windowControlsEl: HTMLDivElement | null = null;
  private windowControlsComponent: UIComponent<"div"> | null = null;
  private windowMaximizeButton: IconButton | null = null;
  private isWindowMaximized = false;
  private stopWindowStateSync: (() => void) | null = null;
  private splitterController: SplitterController;

  constructor(
    public workspace: Workspace,
    readonly id: string,
    private mode: NodeType = "TabGroup",
    private splitAxis: SplitAxis = "row",
    parent?: LayoutNode | null,
  ) {
    this.parent = parent ?? null;
    this.containerComponent = new WorkspacePanelContainer(id);
    this.tabBarComponent = new WorkspacePanelTabs();
    this.contentComponent = new WorkspacePanelContent();
    this.containerEl = this.containerComponent.element;
    this.tabBarEl = this.tabBarComponent.element;
    this.contentEl = this.contentComponent.element;
    this.splitterController = new SplitterController(this);
    this.containerEl.append(this.tabBarEl, this.contentEl);
    this.containerComponent.listen("pointerdown", e => {
      e.stopPropagation();
      this.workspace.setActivePanel(this);
    });
    const addTabButtonComponent = UIComponent.detached("button")
      .setAttr("type", "button")
      .addClass("panel-tab", "panel-tab-add")
      .setAria({ label: "New tab" })
      .setIcon(Plus)
      .listen("click", () => this.workspace.openView("empty", this));
    this.addTabButton = addTabButtonComponent.mount(this.tabBarEl);
    this.applyModeClasses();
    this.applySplitAxis();
  }

  getMode(): NodeType {
    return this.mode;
  }

  getSplitAxis(): SplitAxis {
    return this.splitAxis;
  }

  setMode(mode: NodeType, notify: boolean = true): this {
    if (mode === this.mode) return this;
    if (mode === "TabGroup" && this.childPanels.length > 0) {
      throw new Error("Cannot switch panel to view mode while it has child panels");
    }
    if (mode === "SplitGroup" && this.views.length > 0) {
      throw new Error("Cannot switch panel to panel mode while it has views");
    }
    this.mode = mode;
    this.applyModeClasses();
    if (notify) {
      this.workspace.onPanelMutated();
    }
    return this;
  }

  setPersistent(persistent: boolean): this {
    this.persistent = persistent;
    return this;
  }

  isPersistent(): boolean {
    return this.persistent;
  }

  setSplitAxis(setAxis: SplitAxis, notify: boolean = true): this {
    this.splitAxis = setAxis;
    this.refreshLayoutDom();
    if (notify) {
      this.workspace.onPanelMutated();
    }
    return this;
  }

  addPanel(panel: LayoutNode, size: number = 1, notify: boolean = true): this {
    if (this.mode !== "SplitGroup") {
      throw new Error("Panel is in view mode and cannot accept child panels");
    }
    if (this.views.length > 0) {
      throw new Error("A panel cannot have child panels and views at the same time");
    }
    panel.parent = this;
    this.childPanels.push({ panel, size: Math.max(0.1, size) });
    if (notify) {
      this.refreshLayoutDom();
      this.workspace.onPanelMutated();
    }
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

  removePanel(
    panelId: string,
    { keepChildAlive = false, notify = true }: { keepChildAlive?: boolean; notify?: boolean } = {},
  ): this {
    const index = this.childPanels.findIndex(entry => entry.panel.id === panelId);
    if (index < 0) return this;
    const [child] = this.childPanels.splice(index, 1);
    child.panel.parent = null;
    child.panel.containerEl.remove();
    if (!keepChildAlive) {
      child.panel.destroy();
    }
    if (notify) {
      this.refreshLayoutDom();
      this.workspace.onPanelMutated();
    } else {
      this.layoutChildPanelSizes();
    }
    return this;
  }

  replaceChildPanel(panelId: string, replacement: LayoutNode): this {
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

  addView(
    viewType: string,
    view: View,
    title: string = viewType,
    activate: boolean = true,
    state?: unknown,
  ): this {
    if (this.mode !== "TabGroup") {
      throw new Error("Panel is in panel mode and cannot accept views");
    }
    if (this.childPanels.length > 0) {
      throw new Error("A panel cannot have views and child panels at the same time");
    }
    if (activate && viewType !== "empty") {
      this.closeActiveEmptyView();
    }
    view.initializeTitle(title);
    view.setViewTypeId(viewType);
    view.initializeState(state);
    view.attach();
    this.insertDetachedView({ viewType, title, icon: view.icon, view, state }, this.views.length, activate);
    // When activate=true, insertDetachedView → setActiveViewById → setActiveView already called
    // markLayoutChanged, so only refresh window controls here to avoid a duplicate save schedule.
    if (activate) {
      this.workspace.refreshWindowControls();
    } else {
      this.workspace.onPanelMutated();
    }
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

  /**
   * Make a tab visible within this panel without updating the workspace's global focus.
   * Use this when restoring layout so each panel's visible tab can be set independently.
   * For normal user interactions that should also transfer global focus, use setActiveViewById.
   */
  showViewById(tabId: string | null, notifyViewLifecycle: boolean = true): this {
    this.activeViewId = tabId;
    let activeTabButton: HTMLButtonElement | null = null;
    this.views.forEach(panelView => {
      const isActive = panelView.tabId === tabId;
      panelView.tabComponent.setActive(isActive);
      panelView.view?.containerEl.classList.toggle("is-active", isActive);
      panelView.placeholderComponent?.setActive(isActive);
      if (isActive && panelView.view) {
        if (notifyViewLifecycle) {
          panelView.view.activate();
        }
        activeTabButton = panelView.tabButton;
      } else if (notifyViewLifecycle) {
        panelView.view?.deactivate();
      }
    });
    if (activeTabButton) {
      (activeTabButton as HTMLElement).scrollIntoView({
        behavior: "smooth",
        inline: "nearest",
        block: "nearest",
      });
    }
    return this;
  }

  /** Show a tab and transfer global workspace focus to it. */
  setActiveViewById(tabId: string | null): this {
    this.showViewById(tabId);
    const activeView = tabId ? (this.views.find(pv => pv.tabId === tabId)?.view ?? null) : null;
    this.workspace.setActivePanel(this);
    this.workspace.setActiveView(activeView);
    return this;
  }

  showViewByIndex(index: number, notifyViewLifecycle: boolean = true): boolean {
    const clampedIndex = Math.max(0, Math.min(index, this.views.length - 1));
    const tabId = this.views[clampedIndex]?.tabId;
    if (!tabId) {
      return false;
    }
    this.showViewById(tabId, notifyViewLifecycle);
    return true;
  }

  setActiveViewByIndex(index: number): boolean {
    const clampedIndex = Math.max(0, Math.min(index, this.views.length - 1));
    const tabId = this.views[clampedIndex]?.tabId;
    if (!tabId) {
      return false;
    }
    this.setActiveViewById(tabId);
    return true;
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
    return hoveredIndex;
  }

  getViewIndexByTabId(tabId: string): number {
    return this.views.findIndex(panelView => panelView.tabId === tabId);
  }

  activateViewByViewType(viewType: string): boolean {
    if (this.mode === "TabGroup") {
      const found = this.views.find(view => view.viewType === viewType);
      if (!found) return false;
      this.setActiveViewById(found.tabId);
      return true;
    }
    for (const child of this.childPanels) {
      if (child.panel.activateViewByViewType(viewType)) return true;
    }
    return false;
  }

  /**
   * Show a view by its type ID within this panel tree without updating global focus.
   * Used during layout restore to set each panel's visible tab independently.
   */
  showViewByViewId(viewType: string, notifyViewLifecycle: boolean = true): boolean {
    if (this.mode === "TabGroup") {
      const found = this.views.find(view => view.viewType === viewType);
      if (!found) return false;
      this.showViewById(found.tabId, notifyViewLifecycle);
      return true;
    }
    for (const child of this.childPanels) {
      if (child.panel.showViewByViewId(viewType, notifyViewLifecycle)) return true;
    }
    return false;
  }

  getViews(): Array<{ viewType: string; tabId: string; title: string; view: View }> {
    return this.views
      .filter(panelView => !!panelView.view)
      .map(panelView => ({
        viewType: panelView.viewType,
        tabId: panelView.tabId,
        title: panelView.title,
        view: panelView.view as View,
      }));
  }

  findActiveView(): View | null {
    if (this.mode === "TabGroup") {
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
    if (this.mode === "TabGroup") {
      const activeIndex = this.views.findIndex(view => view.tabId === this.activeViewId);
      return {
        id: this.id,
        splitAxis: this.splitAxis,
        mode: "TabGroup",
        persistent: this.persistent || undefined,
        visibleViewIndex: activeIndex >= 0 ? activeIndex : undefined,
        views: this.views.map(panelView => ({
          viewType: panelView.viewType,
          title: panelView.title,
          state: panelView.view?.getViewState() ?? panelView.state,
        })),
      };
    }
    return {
      id: this.id,
      splitAxis: this.splitAxis,
      mode: "SplitGroup",
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
    this.splitterController.destroy();
    this.clearWindowControls();
    this.views.forEach(panelView => {
      panelView.view?.detach();
      panelView.view?.containerEl.remove();
      panelView.placeholderEl?.remove();
      panelView.tabButton.remove();
    });
    this.views = [];
    this.contentEl.empty();
    this.tabBarEl.empty();
    this.activeViewId = null;
    this.containerEl.remove();
  }

  destroyShallow(): void {
    this.childPanels = [];
    this.views = [];
    this.splitterController.destroy();
    this.clearWindowControls();
    this.contentEl.empty();
    this.tabBarEl.empty();
    this.activeViewId = null;
    this.parent = null;
  }

  private applyModeClasses() {
    this.containerComponent.setMode(this.mode);
    this.tabBarComponent.setHidden(this.mode !== "TabGroup");
    this.addTabButton.toggleClass("is-hidden", this.mode !== "TabGroup");
  }

  private applySplitAxis() {
    this.contentComponent.setSplitAxis(this.splitAxis);
    this.layoutChildPanelSizes();
  }

  layoutChildPanelSizes() {
    if (this.mode !== "SplitGroup") return;
    this.childPanels.forEach(({ panel, size }) => {
      panel.containerEl.style.flexGrow = String(size);
      panel.containerEl.style.flexBasis = "0";
      panel.containerEl.style.minWidth = "0";
      panel.containerEl.style.minHeight = "0";
    });
  }

  findPanelById(panelId: string): LayoutNode | null {
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

  extractDetachedView(tabId: string): DetachedTab | null {
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
      viewType: panelView.viewType,
      title: panelView.title,
      icon: panelView.icon,
      view: panelView.view,
      state: panelView.view?.getViewState() ?? panelView.state,
      placeholderEl: panelView.placeholderEl,
      placeholderComponent: panelView.placeholderComponent,
    };
  }

  insertDetachedView(detachedView: DetachedTab, targetIndex: number, activate: boolean): string {
    if (this.mode !== "TabGroup") {
      throw new Error("Panel is in panel mode and cannot accept views");
    }
    if (this.childPanels.length > 0) {
      throw new Error("A panel cannot have views and child panels at the same time");
    }

    const insertIndex = Math.max(0, Math.min(targetIndex, this.views.length));
    const tabId = this.createUniqueTabId(detachedView.viewType);
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
      viewType: detachedView.viewType,
      tabId,
      title: detachedView.title,
      icon,
      view: detachedView.view,
      tabButton,
      tabComponent,
      placeholderEl: detachedView.placeholderEl,
      placeholderComponent: detachedView.placeholderComponent,
      state: detachedView.state,
    };

    this.views.splice(insertIndex, 0, panelView);
    this.renderViewOrder();

    if (detachedView.view) {
      detachedView.view.panel = this;
      detachedView.view.initializeIcon(icon);
      detachedView.view.initializeState(detachedView.state);
    }

    if (activate) {
      this.setActiveViewById(tabId);
    } else {
      panelView.view?.containerEl.classList.remove("is-active");
      panelView.placeholderComponent?.setActive(false);
    }

    return tabId;
  }

  moveAllViewsTo(target: LayoutNode): void {
    const movingViews = [...this.views];
    this.views = [];
    this.activeViewId = null;
    this.tabBarEl.empty();
    this.contentEl.empty();
    movingViews.forEach(panelView => {
      const detached = {
        viewType: panelView.viewType,
        title: panelView.title,
        icon: panelView.icon,
        view: panelView.view,
        state: panelView.view?.getViewState() ?? panelView.state,
        placeholderEl: panelView.placeholderEl,
        placeholderComponent: panelView.placeholderComponent,
      };
      panelView.tabComponent.remove();
      target.insertDetachedView(detached, target.views.length, false);
    });
    target.setActiveViewById(target.views[0]?.tabId ?? null);
  }

  refreshLayoutDom(): void {
    this.applyModeClasses();
    this.applySplitAxis();
    this.splitterController.clearHandles();
    if (this.mode === "SplitGroup") {
      this.contentEl.empty();
      this.childPanels.forEach(({ panel }, index) => {
        panel.parent = this;
        this.contentEl.appendChild(panel.containerEl);
        if (index < this.childPanels.length - 1) {
          this.contentEl.appendChild(this.splitterController.createHandle(index));
        }
      });
    }
    this.renderViewOrder();
  }

  absorbPanel(source: LayoutNode): void {
    this.persistent = this.persistent || source.isPersistent();
    this.mode = source.mode;
    this.splitAxis = source.splitAxis;
    this.childPanels = source.childPanels;
    this.views = [];
    this.activeViewId = null;

    this.childPanels.forEach(child => (child.panel.parent = this));

    const sourceViews = [...source.views];
    sourceViews.forEach(panelView => {
      panelView.tabComponent.remove();
      panelView.view?.containerEl.remove();
      panelView.placeholderEl?.remove();
      this.insertDetachedView(
        {
          viewType: panelView.viewType,
          title: panelView.title,
          icon: panelView.icon,
          view: panelView.view,
          state: panelView.view?.getViewState() ?? panelView.state,
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

  private closeActiveEmptyView(): void {
    if (!this.activeViewId) {
      return;
    }

    const activeIndex = this.views.findIndex(
      panelView => panelView.tabId === this.activeViewId && panelView.viewType === "empty",
    );
    if (activeIndex < 0) {
      return;
    }

    const [panelView] = this.views.splice(activeIndex, 1);
    panelView.view?.detach();
    panelView.view?.containerEl.remove();
    panelView.placeholderComponent?.remove();
    panelView.placeholderEl?.remove();
    panelView.tabComponent.remove();
    this.activeViewId = null;
    if (this.workspace.activeView === panelView.view) {
      this.workspace.setActiveView(null);
    }
  }

  private renderViewOrder(): void {
    if (this.mode !== "TabGroup") return;
    this.views.forEach(panelView => {
      this.tabBarEl.appendChild(panelView.tabButton);
      const contentEl = panelView.view?.containerEl ?? panelView.placeholderEl;
      if (contentEl) {
        contentEl.dataset.viewId = panelView.tabId;
        this.contentEl.appendChild(contentEl);
      }
    });
    this.tabBarEl.appendChild(this.addTabButton.element);
    if (this.windowControlsEl) {
      this.tabBarEl.appendChild(this.windowControlsEl);
    }
  }

  private ensureWindowControls(): void {
    const shouldShow = this.mode === "TabGroup" && this.workspace.shouldShowWindowControls(this);
    if (!this.windowControlsEl && shouldShow) {
      const controlsComponent = UIComponent.detached("div")
        .addClass("panel-window-controls", "is-hidden")
        .mount(this.tabBarEl);
      const controls = controlsComponent.element;

      const makeControl = (
        icon: IconNode,
        tooltip: string,
        className: string,
        onClick: () => void,
      ): IconButton =>
        new IconButton(controls)
          .setAttr("type", "button")
          .addClass("panel-window-control", className)
          .toggleClass("icon-button", false)
          .setIcon(icon)
          .setTooltip(tooltip)
          .on("click", onClick);

      makeControl(
        ChevronDown,
        "Minimize window",
        "control-minimize",
        () => void this.getWindowControlsBridge()?.windowMinimize?.(),
      );

      this.windowMaximizeButton = makeControl(Maximize2, "Maximize window", "control-maximize", () => {
        const bridge = this.getWindowControlsBridge();
        void (async () => {
          await bridge?.windowMaximize?.();
          if (bridge?.windowIsMaximized) {
            await this.refreshWindowMaximizeState();
            return;
          }
          this.isWindowMaximized = !this.isWindowMaximized;
          this.applyWindowControlsState();
        })();
      });

      makeControl(
        X,
        "Close window",
        "control-close",
        () => void this.getWindowControlsBridge()?.windowClose?.(),
      );

      this.windowControlsComponent = controlsComponent;
      this.windowControlsEl = controls;
      this.applyWindowControlsState();
      this.bindWindowStateSync();
    }

    this.windowControlsEl?.classList.toggle("is-hidden", !shouldShow);
    if (shouldShow) {
      void this.refreshWindowMaximizeState();
    }
    this.makeDraggable(shouldShow);
  }

  private getWindowControlsBridge(): WorkspaceElectronBridge | null {
    return (
      (window as { touchGrassElectronPlatform?: WorkspaceElectronBridge }).touchGrassElectronPlatform ?? null
    );
  }

  private bindWindowStateSync(): void {
    if (this.stopWindowStateSync) {
      return;
    }

    const bridge = this.getWindowControlsBridge();
    if (!bridge?.onWindowMaximizedChange) {
      return;
    }

    this.stopWindowStateSync = bridge.onWindowMaximizedChange(isMaximized => {
      this.isWindowMaximized = isMaximized;
      this.applyWindowControlsState();
    });
  }

  private applyWindowControlsState(): void {
    this.windowControlsEl?.classList.toggle("is-window-maximized", this.isWindowMaximized);
    this.windowMaximizeButton?.toggleClass("is-window-maximized", this.isWindowMaximized);
    this.windowMaximizeButton?.setIcon(this.isWindowMaximized ? Minimize2 : Maximize2);
    this.windowMaximizeButton?.setTooltip(this.isWindowMaximized ? "Restore window" : "Maximize window");
  }

  private async refreshWindowMaximizeState(): Promise<void> {
    const bridge = this.getWindowControlsBridge();
    if (!bridge?.windowIsMaximized) {
      return;
    }

    this.isWindowMaximized = await bridge.windowIsMaximized();
    this.applyWindowControlsState();
  }

  syncWindowControls(): void {
    console.log("Syncing window controls for panel", this.id);
    this.ensureWindowControls();
  }

  makeDraggable(draggable: boolean): void {
    this.tabBarEl.classList.toggle("electron-window-draggable", draggable);
  }

  private clearWindowControls(): void {
    this.stopWindowStateSync?.();
    this.stopWindowStateSync = null;
    this.windowMaximizeButton = null;
    this.windowControlsComponent?.remove();
    this.windowControlsComponent = null;
    this.windowControlsEl = null;
    this.tabBarEl.classList.remove("electron-window-draggable");
  }

  addUnresolvedView(
    viewType: string,
    title: string = viewType,
    activate: boolean = true,
    state?: unknown,
  ): this {
    if (this.mode !== "TabGroup") {
      throw new Error("Panel is in panel mode and cannot accept views");
    }
    if (this.childPanels.length > 0) {
      throw new Error("A panel cannot have views and child panels at the same time");
    }

    const placeholderComponent = new WorkspacePlaceholder("");
    const placeholderEl = placeholderComponent.element;
    this.insertDetachedView(
      {
        viewType,
        title,
        icon: null,
        view: null,
        state,
        placeholderEl,
        placeholderComponent,
      },
      this.views.length,
      activate,
    );
    this.workspace.onPanelMutated();
    return this;
  }

  hydrateViewsByType(viewType: string, factory: (panel: LayoutNode) => View): this {
    if (this.mode === "TabGroup") {
      this.views
        .filter(panelView => panelView.viewType === viewType && !panelView.view)
        .forEach(panelView => {
          const view = factory(this);
          view.initializeTitle(panelView.title);
          view.setViewTypeId(panelView.viewType);
          view.initializeState(panelView.state);
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
    this.childPanels.forEach(({ panel }) => panel.hydrateViewsByType(viewType, factory));
    return this;
  }

  unloadViewsByType(viewType: string): this {
    if (this.mode === "TabGroup") {
      this.views
        .filter(panelView => panelView.viewType === viewType && !!panelView.view)
        .forEach(panelView => {
          const unresolvedComponent = new WorkspacePlaceholder(panelView.tabId);
          const unresolvedEl = unresolvedComponent.element;
          panelView.view?.deactivate();
          panelView.state = panelView.view?.getViewState() ?? panelView.state;
          panelView.view?.detach();
          panelView.view?.containerEl.replaceWith(unresolvedEl);
          panelView.view = null;
          panelView.placeholderEl = unresolvedEl;
          panelView.placeholderComponent = unresolvedComponent;
          panelView.tabComponent.setUnresolved(true);
        });
      return this;
    }
    this.childPanels.forEach(({ panel }) => panel.unloadViewsByType(viewType));
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

  markViewStateDirty(view: View): this {
    const panelView = this.views.find(v => v.view === view);
    if (!panelView) return this;
    panelView.state = view.getViewState();
    this.workspace.onViewStateMutated();
    return this;
  }

  ensureFallbackView(): this {
    if (!this.persistent) return this;
    if (this.mode !== "TabGroup") return this;
    if (this.views.length > 0) return this;
    this.workspace.openView("empty", this, { activate: true, title: "empty" });
    return this;
  }

  /**
   * Check if a view is contained within this panel or its children.
   */
  containsView(view: View): boolean {
    // Check direct views in this panel
    if (this.views.some(pv => pv.view === view)) {
      return true;
    }
    // Check child panels recursively
    return this.childPanels.some(cp => cp.panel.containsView(view));
  }
}

/**
 * Represents a view within a panel container.
 * Manages the DOM element and rendering for a specific view section.
 */
export class View extends ETarget<ViewEvents> {
  private attached = false;
  private _title = "";
  private _icon: IconNode | null = null;
  private _viewTypeId: string = "";
  containerEl: HTMLDivElement;

  constructor(public panel: LayoutNode) {
    super();
    this.containerEl = UIComponent.detached("div").addClass("view").element;
  }

  /**
   * Get the view type ID (e.g., "VerseScreen", "notes-panel").
   * Set internally when the view is added to a panel.
   */
  get viewTypeId(): string {
    return this._viewTypeId;
  }

  /**
   * Set the view type ID (internal use only).
   */
  setViewTypeId(typeId: string): void {
    this._viewTypeId = typeId;
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

  getViewState(): unknown {
    return undefined;
  }

  setViewState(state: unknown): void {
    void state;
  }

  initializeState(state: unknown): void {
    if (state === undefined) return;
    this.setViewState(state);
  }

  protected requestStateSave(): void {
    this.panel.markViewStateDirty(this);
  }

  // Methods for rendering, updating content, etc.
}

class EmptyView extends View {
  onActivate(): void {
    this.containerEl.empty();
    const content = this.containerEl.createEl("div", { cls: "empty-view" });
    content.style.display = "flex";
    content.style.flexDirection = "column";
    content.style.gap = "1em";
    content.style.padding = "1em";
    this.panel.workspace.listRegisteredViews().forEach(viewType => {
      if (viewType !== "empty") {
        new Button(content)
          .setButtonText(`Open ${viewType}`)
          .on("click", () => this.panel.workspace.openView(viewType, this.panel, { activate: true }));
      }
    });
  }
}

monkeypatchAllWorkspaceMethods([
  /* ["WorkspaceTabButton", WorkspaceTabButton],
  ["WorkspacePlaceholder", WorkspacePlaceholder],
  ["WorkspacePanelContainer", WorkspacePanelContainer],
  ["WorkspacePanelTabs", WorkspacePanelTabs],
  ["WorkspacePanelContent", WorkspacePanelContent],
  ["Workspace", Workspace],
  ["Panel", LayoutNode],
  ["View", View],
  ["EmptyView", EmptyView], */
]);
