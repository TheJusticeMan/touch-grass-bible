import type { DropIntent, LayoutNode, Workspace } from "./Workspace";

export type PanelDropEdge = "left" | "right" | "top" | "bottom" | "center";

type DragDropState = {
  sourcePanel: LayoutNode;
  tabId: string;
  pointerId: number;
  startX: number;
  startY: number;
  dragging: boolean;
  sourceTabButton: HTMLButtonElement;
  targetPanel: LayoutNode | null;
  targetEdge: PanelDropEdge | null;
  targetInsertIndex: number | null;
  targetTabButton: HTMLButtonElement | null;
};

export class DragDropController {
  private dragState: DragDropState | null = null;

  private readonly onDocumentPointerMove = (event: PointerEvent) => this.handlePointerMove(event);

  private readonly onDocumentPointerUp = (event: PointerEvent) => this.handlePointerUp(event);

  constructor(private workspace: Workspace) {}

  destroy(): void {
    const dragState = this.dragState;
    if (dragState?.sourceTabButton.hasPointerCapture(dragState.pointerId)) {
      dragState.sourceTabButton.releasePointerCapture(dragState.pointerId);
    }
    this.clearDragState();
  }

  handleTabPointerDown(panel: LayoutNode, tabId: string, event: PointerEvent): void {
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

  handlePointerMove(event: PointerEvent): void {
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

  handlePointerUp(event: PointerEvent): void {
    const dragState = this.dragState;
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    dragState.sourceTabButton.releasePointerCapture(event.pointerId);
    this.clearDropTargetClasses();

    if (!dragState.dragging) {
      this.clearDragState();
      return;
    }

    this.performDrop();
    this.clearDragState();
  }

  private performDrop(): boolean {
    const dragState = this.dragState;
    if (!dragState || !dragState.targetPanel || !dragState.targetEdge) return false;

    let intent: DropIntent;
    if (dragState.targetEdge === "center") {
      intent = {
        kind: "reorder",
        sourcePanelId: dragState.sourcePanel.id,
        sourceTabId: dragState.tabId,
        targetPanelId: dragState.targetPanel.id,
        targetIndex: dragState.targetInsertIndex ?? dragState.targetPanel.views.length,
      };
    } else {
      intent = {
        kind: "split",
        sourcePanelId: dragState.sourcePanel.id,
        sourceTabId: dragState.tabId,
        targetPanelId: dragState.targetPanel.id,
        edge: dragState.targetEdge,
      };
    }

    return this.workspace.applyDropIntent(intent);
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
      const panel = panelEl ? this.workspace.findPanelById(panelEl.dataset.panelId ?? "") : null;
      if (panel && panel.getMode() === "TabGroup") {
        const tabButton = hit.closest(".panel-tab") as HTMLButtonElement | null;
        const insertIndex = panel.getInsertIndexForPointer(tabButton);
        this.setDropTarget(panel, "center", insertIndex, tabButton);
        return;
      }
    }

    const panelEl = hit.closest(".panel") as HTMLDivElement | null;
    const panel = panelEl ? this.workspace.findPanelById(panelEl.dataset.panelId ?? "") : null;
    if (!panel || panel.getMode() !== "TabGroup" || panel.views.length === 0) {
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
    panel: LayoutNode | null,
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
}
