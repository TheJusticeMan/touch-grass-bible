import van, { State } from "vanjs-core";
import {
  LayoutDirection,
  Panel,
  PanelContainer,
  PanelContainerSerialized,
  PanelSerialized,
  SplitIntent,
  stateMapping,
  ViewContainer,
} from "./Types";
import { IconNode } from "lucide";

const { div } = van.tags;

export class viewStateController<T extends Record<string, unknown>> {
  private _state: stateMapping<T>;
  public get state(): stateMapping<T> {
    return this._state;
  }
  private atoms: Set<State<unknown>> = new Set();
  history: { state: T; atomStates: Map<State<unknown>, unknown> }[] = [];

  constructor(initialState: T) {
    this._state = Object.fromEntries(
      Object.entries(initialState).map(([key, value]) => [key, van.state(value)]),
    ) as stateMapping<T>;
  }

  updateViewState(newState: Partial<T>, save = true): this {
    this.state = newState;
    if (save) this.saveState();
    return this;
  }

  public set state(newState: Partial<T>) {
    for (const key in newState) {
      const stateEntry = this._state[key];
      if (!stateEntry) continue;
      stateEntry.val = newState[key] as T[Extract<keyof T, string>];
    }
  }

  saveState() {
    const snapshot = {} as T;
    for (const key in this._state) {
      snapshot[key] = this._state[key].val;
    }
    const atomStates = new Map<State<unknown>, unknown>();
    this.atoms.forEach(atom => atomStates.set(atom, atom.val));
    this.history.push({ state: snapshot, atomStates });
    return this;
  }

  useState<V>(initialValue: V): State<V> {
    const atom = van.state(initialValue);
    this.atoms.add(atom);
    return atom;
  }

  getAtoms(): Set<State<unknown>> {
    return this.atoms;
  }

  copyAtomsFrom(other: viewStateController<Record<string, unknown>>): this {
    other.getAtoms().forEach(atom => this.atoms.add(atom));
    return this;
  }

  clearStateHistory(): this {
    this.history = [];
    return this;
  }

  undo(): boolean {
    this.history.pop(); // Discard current state
    const previousState = this.history.pop();
    if (!previousState) return false;
    for (const key in previousState.state) {
      this._state[key].val = previousState.state[key];
    }
    previousState.atomStates.forEach((value, atom) => {
      atom.val = value;
    });
    return true;
  }

  getState(): T {
    const currentState = {} as T;
    for (const key in this._state) {
      currentState[key] = this._state[key].val;
    }
    return currentState;
  }
  deserializeState?(str: string): T;
  serializeState?(state: T): string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export abstract class View<T extends Record<string, unknown> = {}> extends viewStateController<T> {
  public abstract readonly viewTypeId: string;
  /** When true, the workspace reuses one shared instance and prevents duplicate mounts. */
  public isSingleton = false;

  public isActive = van.state(false);
  public title: State<string>;
  public icon: State<IconNode | null>;
  public parent?: ViewContainer;
  private _el?: HTMLElement | undefined;

  public get el(): HTMLElement {
    return this._el || (this._el = this.create());
  }

  public get isCreated(): boolean {
    return !!this._el;
  }

  private cleanupCallbacks: (() => void)[] = [];

  constructor(initialTitle: string, initialState: T, initialIcon: IconNode | null = null) {
    super(initialState);
    this.title = van.state(initialTitle);
    this.icon = van.state(initialIcon);
  }

  abstract create(): HTMLElement;

  onMount?(): void;
  onUnmount?(): void;
  focus?(): void;
  handleKeyDown?(e: KeyboardEvent, meaning: string): void;

  detach(): void {
    this.onUnmount?.();
    this._el = undefined;
  }

  destroy(): void {
    this.detach();
    this.cleanupCallbacks.forEach(callback => callback());
    this.cleanupCallbacks = [];
  }

  onCleanup(callback: () => void): void {
    this.cleanupCallbacks.push(callback);
  }
}

type UnloadedViewState = {
  serializedState: string;
};

class UnloadedView extends View<UnloadedViewState> {
  constructor(public viewTypeId: string) {
    super(
      `Unloaded View ${viewTypeId
        .toLowerCase()
        .replace(/[_-]/g, " ")
        .replace(/\b\w/g, char => char.toUpperCase())}`,
      { serializedState: "" },
    );
  }

  serializeState(): string {
    return this.state.serializedState.val;
  }

  deserializeState(str: string): UnloadedViewState {
    return {
      serializedState: str,
    };
  }

  create() {
    return div(`This view type "${this.viewTypeId}" has not been registered.`);
  }
}

export class LayoutController {
  private viewRegistry: Map<string, () => View> = new Map();
  public readonly registeredViews: State<[string, () => View][]> = van.state([]);

  public readonly rootPanel: State<PanelContainer> = van.state({
    type: "panel",
    direction: "horizontal",
    children: van.state([]),
    activeIndex: van.state(0),
    size: van.state(1),
  });

  floatingViews: ViewContainer = {
    type: "view",
    children: van.state([]),
    activeIndex: van.state(0),
    size: van.state(1),
    parent: {} as PanelContainer,
  };
  activeView: State<View | null> = van.state(null);
  activePanel: State<ViewContainer | null> = van.state(null);

  constructor(defaultLayout: PanelContainerSerialized) {
    this.rootPanel.val = this.deserializePanel(defaultLayout) as PanelContainer;
    van.derive(
      () => (
        (this.activeView.val = this.computeActiveView()),
        (this.activePanel.val = this.computeActivePanel())
      ),
    );
    /* van.derive(() => console.log("Active view changed:", this.activeView.val)); */
  }

  serializePanel(panel: Panel): PanelSerialized {
    if (panel.type === "panel") {
      return {
        type: "panel",
        direction: panel.direction,
        activeIndex: panel.activeIndex.val,
        size: panel.size.val,
        isPersistent: panel.isPersistent,
        children: panel.children.val.map(child => this.serializePanel(child)),
      };
    } else {
      return {
        type: "view",
        activeIndex: panel.activeIndex.val,
        size: panel.size.val,
        isPersistent: panel.isPersistent,
        children: panel.children.val.map(viewState => ({
          viewType: viewState.val.viewTypeId,
          title: viewState.val.title.val,
          state: viewState.val.serializeState?.(viewState.val.state) || "",
        })),
      };
    }
  }

  deserializePanel(serialized: PanelSerialized, parent?: PanelContainer): Panel {
    if (serialized.type === "panel") {
      const panel: PanelContainer = {
        type: "panel",
        direction: serialized.direction,
        activeIndex: van.state(serialized.activeIndex),
        size: van.state(serialized.size),
        parent,
        isPersistent: serialized.isPersistent,
        children: van.state([]),
      };
      panel.children.val = (serialized.children || []).map(child => this.deserializePanel(child, panel));
      return panel;
    } else {
      if (!parent) {
        throw new Error("ViewContainer must have a parent PanelContainer");
      }
      const viewContainer: ViewContainer = {
        type: "view",
        activeIndex: van.state(serialized.activeIndex),
        size: van.state(serialized.size),
        parent,
        isPersistent: serialized.isPersistent,
        children: van.state([]),
      };
      viewContainer.children.val = (serialized.children || []).map(viewInfo => {
        const viewInstance = this.createView(viewInfo.viewType, viewContainer, viewInfo.state);
        viewInstance.title.val = viewInfo.title;
        return van.state(viewInstance);
      });
      return viewContainer;
    }
  }

  validateSerializedPanel(serialized: unknown): serialized is PanelSerialized {
    if (!serialized || typeof serialized !== "object") return false;

    const candidate = serialized as Partial<PanelSerialized>;
    if (candidate.type === "panel") {
      return (
        (candidate.direction === "horizontal" || candidate.direction === "vertical") &&
        typeof candidate.activeIndex === "number" &&
        Number.isFinite(candidate.activeIndex) &&
        candidate.activeIndex >= 0 &&
        typeof candidate.size === "number" &&
        Number.isFinite(candidate.size) &&
        (!("children" in candidate) ||
          candidate.children === undefined ||
          (Array.isArray(candidate.children) &&
            candidate.children.every(child => this.validateSerializedPanel(child))))
      );
    }

    if (candidate.type === "view") {
      return (
        typeof candidate.activeIndex === "number" &&
        Number.isFinite(candidate.activeIndex) &&
        candidate.activeIndex >= 0 &&
        typeof candidate.size === "number" &&
        Number.isFinite(candidate.size) &&
        (!("children" in candidate) ||
          candidate.children === undefined ||
          (Array.isArray(candidate.children) &&
            candidate.children.every(
              viewInfo =>
                viewInfo &&
                typeof viewInfo === "object" &&
                typeof viewInfo.viewType === "string" &&
                typeof viewInfo.title === "string" &&
                typeof viewInfo.state === "string",
            )))
      );
    }

    return false;
  }

  registerView(viewTypeId: string, viewFactory: () => View): void {
    this.viewRegistry.set(viewTypeId, viewFactory);
    this.registeredViews.val = Array.from(this.viewRegistry.entries());
    this.updateViewsByType(viewTypeId);
  }

  unregisterView(viewTypeId: string): void {
    this.viewRegistry.delete(viewTypeId);
    this.registeredViews.val = Array.from(this.viewRegistry.entries());
    this.updateViewsByType(viewTypeId);
  }

  private updateViewsByType(viewTypeId: string, panel: Panel = this.rootPanel.val): void {
    if (panel.type === "view") {
      panel.children.val.forEach(view => {
        if (view.val.viewTypeId === viewTypeId) {
          const previous = view.val;
          const parent = previous.parent;
          const serializedState = previous.serializeState?.(previous.state);
          const fallbackState = previous.getState();

          previous.destroy();

          const replacement = this.createView(
            viewTypeId,
            parent,
            serializedState && serializedState.length > 0 ? serializedState : fallbackState,
          );
          view.val = replacement;
        }
      });
    } else {
      panel.children.val.forEach(child => this.updateViewsByType(viewTypeId, child));
    }

    this.floatingViews.children.val.forEach((view, index) => {
      if (view.val.viewTypeId !== viewTypeId) return;
      const serializedState = view.val.serializeState?.(view.val.state);
      const fallbackState = view.val.getState();
      const replacement = this.createView(
        viewTypeId,
        view.val.parent,
        serializedState && serializedState.length > 0 ? serializedState : fallbackState,
      );
      view.val.destroy();
      this.floatingViews.children.val = this.floatingViews.children.val.map((existing, i) =>
        i === index ? van.state(replacement) : existing,
      );
    });
  }

  private createView(
    viewTypeId: string,
    parent?: ViewContainer,
    initialState?: string | Record<string, unknown>,
  ): View {
    const viewFactory = this.viewRegistry.get(viewTypeId);
    const viewInstance = viewFactory ? viewFactory() : new UnloadedView(viewTypeId);
    viewInstance.parent = parent || viewInstance.parent;
    this.initializeViewState(viewInstance, initialState);
    setTimeout(() => viewInstance.onMount?.(), 0);
    return viewInstance;
  }

  private addViewToContainer(view: View, container: ViewContainer): void {
    view.parent = container;
    container.children.val = [...container.children.val, van.state(view)];
    container.activeIndex.val = container.children.val.length - 1;
  }

  private addPanelToContainer(panel: Panel, container: PanelContainer): void {
    panel.parent = container;
    container.children.val = [...container.children.val, panel];
    container.activeIndex.val = container.children.val.length - 1;
  }

  private initializeViewState(viewInstance: View, initialState?: string | Record<string, unknown>): void {
    if (!initialState) return;

    if (typeof initialState === "string") {
      if (!viewInstance.deserializeState) return;
      viewInstance.updateViewState(viewInstance.deserializeState(initialState));
      return;
    }

    viewInstance.updateViewState(initialState);
  }

  private resolveTargetContainer(targetPanel: Panel): ViewContainer {
    if (targetPanel.type === "view") return targetPanel;

    const targetLeaf = this.computeActivePanel(targetPanel);
    if (targetLeaf) return targetLeaf;

    const newPanel: ViewContainer = {
      type: "view",
      children: van.state([]),
      activeIndex: van.state(0),
      size: van.state(1),
      parent: targetPanel,
    };
    this.addPanelToContainer(newPanel, targetPanel);
    return newPanel;
  }

  private removeViewReference(view: View): void {
    const floatingIndex = this.floatingViews.children.val.findIndex(v => v.val === view);
    if (floatingIndex >= 0) {
      this.floatingViews.children.val = this.floatingViews.children.val.filter((_, i) => i !== floatingIndex);
      this.floatingViews.activeIndex.val = Math.min(
        this.floatingViews.activeIndex.val,
        Math.max(0, this.floatingViews.children.val.length - 1),
      );
      return;
    }

    const existing = this.findView(view, this.rootPanel.val);
    if (!existing) return;
    existing.container.children.val = existing.container.children.val.filter((_, i) => i !== existing.index);
    existing.container.activeIndex.val = Math.min(
      existing.container.activeIndex.val,
      Math.max(0, existing.container.children.val.length - 1),
    );
  }

  private findViewByTypeAnywhere(viewTypeId: string): View | null {
    return (
      this.floatingViews.children.val.find(v => v.val.viewTypeId === viewTypeId)?.val ||
      this.findViewByType(viewTypeId, this.rootPanel.val)
    );
  }

  addViewToPanel(
    viewTypeId: string,
    targetPanel: Panel = this.rootPanel.val,
    initialState?: string | Record<string, unknown>,
  ): View {
    const existing = this.findViewByTypeAnywhere(viewTypeId);
    if (existing?.isSingleton) {
      this.initializeViewState(existing, initialState);
      const targetContainer = this.resolveTargetContainer(targetPanel);
      const location = this.findView(existing, this.rootPanel.val);
      if (location?.container === targetContainer) {
        targetContainer.activeIndex.val = location.index;
      } else {
        this.removeViewReference(existing);
        this.addViewToContainer(existing, targetContainer);
      }
      void this.focusActiveView();
      return existing;
    }

    const viewInstance = this.createView(viewTypeId, undefined, initialState);
    this.addViewToContainer(viewInstance, this.resolveTargetContainer(targetPanel));

    void this.focusActiveView();
    return viewInstance;
  }

  replaceViewInPanel(
    oldView: View,
    viewTypeId: string,
    initialState?: string | Record<string, unknown>,
  ): void {
    const { container, index } = this.findView(oldView, this.rootPanel.val) || {};
    if (!container || index === undefined) return;
    const existing = this.findViewByTypeAnywhere(viewTypeId);
    if (existing?.isSingleton) {
      this.initializeViewState(existing, initialState);
      if (existing === oldView) {
        container.activeIndex.val = index;
        void this.focusActiveView();
        return;
      }
      const slot = container.children.val[index];
      this.removeViewReference(existing);
      const slotIndex = container.children.val.indexOf(slot);
      if (slotIndex < 0) return;
      oldView.destroy();
      existing.parent = container;
      slot.val = existing;
      container.activeIndex.val = slotIndex;
      void this.focusActiveView();
      return;
    }

    const viewInstance = this.createView(viewTypeId, container, initialState);
    oldView.destroy();
    viewInstance.parent = container;
    container.children.val[index].val = viewInstance;
  }

  findView(
    view: View,
    panel: Panel = this.rootPanel.val,
  ): { container: ViewContainer; index: number } | null {
    if (panel.type === "view") {
      const index = panel.children.val.findIndex(v => v.val === view);
      if (index >= 0) {
        return { container: panel, index };
      }
    } else {
      return panel.children.val.reduce<{ container: ViewContainer; index: number } | null>(
        (result, child) => {
          if (result) return result;
          return this.findView(view, child);
        },
        null,
      );
    }
    return null;
  }

  findOrCreateViewById(viewTypeId: string, initialState?: string | Record<string, unknown>): View {
    const existing =
      this.floatingViews.children.val.find(v => v.val.viewTypeId === viewTypeId)?.val ||
      this.findViewByType(viewTypeId) ||
      this.addViewToPanel(viewTypeId, undefined, initialState);
    void this.focusView(existing);
    return existing;
  }

  findViewByType(viewTypeId: string, panel: Panel = this.rootPanel.val): View | null {
    return panel.type === "view"
      ? panel.children.val.find(v => v.val.viewTypeId === viewTypeId)?.val || null
      : panel.children.val.reduce<View | null>((result, child) => {
          if (result) return result;
          return this.findViewByType(viewTypeId, child);
        }, null);
  }

  focusView(view: View, panel: Panel = this.rootPanel.val): boolean {
    if (panel.type === "view") {
      const index = panel.children.val.findIndex(v => v.val === view);
      if (index >= 0) {
        panel.activeIndex.val = index;
        return true;
      }
    } else {
      for (const child of panel.children.val) {
        if (this.focusView(view, child)) {
          panel.activeIndex.val = panel.children.val.indexOf(child);
          return true;
        }
      }
    }
    return false;
  }

  addFloatingView(viewTypeId: string, initialState?: string | Record<string, unknown>): void {
    const existing = this.findViewByTypeAnywhere(viewTypeId);
    if (existing?.isSingleton) {
      this.initializeViewState(existing, initialState);
      this.removeViewReference(existing);
      existing.parent = this.floatingViews;
      this.floatingViews.children.val = [...this.floatingViews.children.val, van.state(existing)];
      void this.focusActiveView();
      return;
    }

    const viewInstance = this.createView(viewTypeId, undefined, initialState);
    this.floatingViews.children.val = [...this.floatingViews.children.val, van.state(viewInstance)];
    viewInstance.onCleanup(
      () =>
        (this.floatingViews.children.val = this.floatingViews.children.val.filter(
          v => v.val !== viewInstance,
        )),
    );

    void this.focusActiveView();
  }

  removeViewInstance(viewInstance: View): void {
    const teardownView = (): void => {
      if (viewInstance.isSingleton) {
        viewInstance.detach();
      } else {
        viewInstance.destroy();
      }
    };

    if (this.floatingViews.children.val.some(v => v.val === viewInstance)) {
      this.floatingViews.children.val = this.floatingViews.children.val.filter(v => v.val !== viewInstance);
      setTimeout(teardownView, 0);
      void this.focusActiveView();
    } else {
      const { container, index } = this.findView(viewInstance, this.rootPanel.val) || {};
      if (!container || index === undefined) return;
      container.children.val = container.children.val.filter((_, i) => i !== index);
      setTimeout(teardownView, 0);
      container.activeIndex.val = Math.min(
        container.activeIndex.val,
        Math.max(0, container.children.val.length - 1),
      );
      void this.focusActiveView();
    }
  }

  private computeActivePanel(panel: Panel = this.rootPanel.val): ViewContainer | null {
    if (panel.type === "view") {
      return panel;
    }
    const activeChild = panel.children.val[panel.activeIndex.val];
    if (!activeChild) return null;
    return this.computeActivePanel(activeChild);
  }

  private computeActiveView(panel: Panel = this.rootPanel.val): View | null {
    const floatingView = this.floatingViews.children.val.at(-1); // Give priority to the most recently added floating view if it exists.
    if (floatingView) return floatingView.val;

    const activePanel = this.computeActivePanel(panel);
    return activePanel?.children.val[activePanel.activeIndex.val]?.val || null;
  }

  async focusActiveView(): Promise<void> {
    const view = this.activeView.val;
    if (!view) return;
    if (!view.el.isConnected) return;
    if (!view.el.contains(document.activeElement))
      if (view.focus) view.focus();
      else view.el.focus();
  }

  async moveView(
    view: State<View>,
    source: ViewContainer,
    target: ViewContainer,
    targetIndex: number,
    splitIntent: SplitIntent | null,
  ): Promise<void> {
    const updatedSourceChildren = source.children.val.filter(v => v !== view);
    source.children.val = updatedSourceChildren;

    if (source.activeIndex.val >= updatedSourceChildren.length) {
      source.activeIndex.val = Math.max(0, updatedSourceChildren.length - 1);
    }

    if (splitIntent) {
      await this.splitPanel(target, splitIntent.direction, splitIntent.before, view);
    } else {
      const updatedTargetChildren = [...target.children.val];
      updatedTargetChildren.splice(targetIndex, 0, view);
      view.val.parent = target;
      target.children.val = updatedTargetChildren;
      target.activeIndex.val = targetIndex;
    }

    await this.sanitizePanel();
    await this.focusActiveView();
  }

  async sanitizePanel(panel: Panel = this.rootPanel.val): Promise<void> {
    // First remove empty panels/views recursively.
    if (panel.type === "panel") {
      await Promise.all(panel.children.val.map(child => this.sanitizePanel(child)));

      panel.children.val = panel.children.val.filter(child => {
        const isEmpty = child.children.val.length === 0;
        if (!isEmpty) return true;
        return Boolean(child.isPersistent);
      });

      panel.activeIndex.val = Math.min(panel.activeIndex.val, Math.max(0, panel.children.val.length - 1));
    } else {
      panel.children.val = panel.children.val.filter(view => view.val !== null);

      if (panel.children.val.length === 0 && panel.isPersistent) {
        panel.children.val = [van.state(this.createView("empty-view", panel))];
      }

      panel.activeIndex.val = Math.min(panel.activeIndex.val, Math.max(0, panel.children.val.length - 1));
    }

    // Then flatten any panel that has only one child panel.
    if (panel.type === "panel" && panel.children.val.length === 1 && panel.parent) {
      const childPanel = panel.children.val[0];

      childPanel.size.val = panel.size.val;
      childPanel.isPersistent = Boolean(childPanel.isPersistent || panel.isPersistent);
      childPanel.parent = panel.parent;
      const index = panel.parent.children.val.findIndex(p => p === panel);
      panel.parent.children.val = panel.parent.children.val.filter(p => p !== panel);
      await new Promise(resolve => setTimeout(resolve, 0)); // Wait for the DOM to update before modifying the parent's children to insure the element has been removed to avoid issues with vanJS's reactivity when moving the panel between parents.
      if (index >= 0) {
        const updatedSiblings = [...panel.parent.children.val];
        updatedSiblings.splice(index, 0, childPanel);
        panel.parent.children.val = updatedSiblings;
        panel.parent.activeIndex.val = Math.min(
          panel.parent.activeIndex.val,
          Math.max(0, panel.parent.children.val.length - 1),
        );
      }
    }
  }

  private async splitPanel(
    panel: ViewContainer,
    direction: LayoutDirection,
    before: boolean = false,
    viewToMove: State<View>,
  ) {
    const oldParent = panel.parent;
    const splitSize = panel.size.val;
    const splitPersistent = panel.isPersistent;
    const index = oldParent.children.val.findIndex(child => child === panel);
    panel.children.val = panel.children.val.filter(v => v !== viewToMove);

    oldParent.children.val = oldParent.children.val.filter(v => v !== panel);

    if (index < 0) {
      throw new Error("splitPanel: target panel not found in parent children");
    }

    await new Promise(resolve => setTimeout(resolve, 0)); // Wait for the DOM to update before modifying the parent's children to insure the element has been removed to avoid issues with vanJS's reactivity when moving the panel between parents.

    const panelContainer: PanelContainer = {
      type: "panel",
      direction,
      children: van.state([]),
      activeIndex: van.state(before ? 0 : 1),
      parent: oldParent,
      size: van.state(splitSize),
      isPersistent: splitPersistent,
    };

    panel.parent = panelContainer;
    panel.size.val = 1;
    panel.isPersistent = false;

    const newPanel: ViewContainer = {
      type: "view",
      children: van.state([viewToMove]),
      activeIndex: van.state(0),
      parent: panelContainer,
      size: van.state(1),
    };
    viewToMove.val.parent = newPanel;

    panelContainer.children.val = before ? [newPanel, panel] : [panel, newPanel];

    const updatedParentChildren = [...oldParent.children.val];
    updatedParentChildren.splice(index, 0, panelContainer);
    oldParent.children.val = updatedParentChildren;
    oldParent.activeIndex.val = index;
  }
}
