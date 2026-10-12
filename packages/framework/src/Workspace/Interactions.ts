import van, { State } from "vanjs-core";
import { View, LayoutController } from "./State";
import { ViewContainer, SplitIntent, PanelContainer, ViewContainerElement } from "./Types";
import { Platform } from "../Platform";

export class WorkspaceDragController {
  public sourcePanel: ViewContainer | null = null;
  public targetPanel: ViewContainer | null = null;
  public targetIndex = 0;
  public splitIntent: SplitIntent | null = null;
  public indicatorStyle = van.state("display: none;");

  private dragSession: {
    pointerId: number;
    view: State<View>;
    sourcePanel: ViewContainer;
    originX: number;
    originY: number;
    started: boolean;
    captureEl: HTMLElement;
    abortController: AbortController;
  } | null = null;

  private resizeSession: {
    pointerId: number;
    panel: PanelContainer;
    dividerIndex: number;
    origin: number;
    containerSize: number;
    totalFlex: number;
    startSizes: [number, number];
    direction: "horizontal" | "vertical";
    captureEl: HTMLElement;
    abortController: AbortController;
  } | null = null;

  private readonly minPanelFlex = 0.2;

  private readonly splitZoneRatio = 0.25;

  private clearDropTarget(): void {
    this.targetPanel = null;
    this.splitIntent = null;
    this.indicatorStyle.val = "display: none;";
  }

  private bindPointerSession({
    pointerId,
    captureEl,
    onMove,
    onEnd,
  }: {
    pointerId: number;
    captureEl: HTMLElement;
    onMove: (event: PointerEvent) => void;
    onEnd: (event: PointerEvent) => void;
  }): AbortController {
    const abortController = new AbortController();
    const { signal } = abortController;

    const handleMove = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return;
      onMove(event);
    };

    const handleEnd = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return;
      abortController.abort();
      if (captureEl.hasPointerCapture(pointerId)) captureEl.releasePointerCapture(pointerId);
      onEnd(event);
    };

    window.addEventListener("pointermove", handleMove, { signal });
    window.addEventListener("pointerup", handleEnd, { signal });
    window.addEventListener("pointercancel", handleEnd, { signal });

    return abortController;
  }

  private applySplitIndicator(direction: "horizontal" | "vertical", before: boolean, rect: DOMRect): void {
    this.splitIntent = { direction, before };

    const zone = this.splitZoneRatio;
    const top = direction === "vertical" && !before ? rect.top + rect.height * (1 - zone) : rect.top;
    const left = direction === "horizontal" && !before ? rect.left + rect.width * (1 - zone) : rect.left;
    const height = direction === "horizontal" ? rect.height : rect.height * zone;
    const width = direction === "horizontal" ? rect.width * zone : rect.width;

    this.indicatorStyle.val = `top: ${top}px; left: ${left}px; height: ${height}px; width: ${width}px;`;
  }

  constructor(private readonly workspace: LayoutController) {}

  startTabDrag(view: State<View>, sourcePanel: ViewContainer, e: PointerEvent): void {
    if (this.resizeSession || this.dragSession) return;

    const captureEl = e.currentTarget;
    if (!(captureEl instanceof HTMLElement)) return;

    e.preventDefault();
    captureEl.setPointerCapture(e.pointerId);

    const pointerId = e.pointerId;
    const originX = e.clientX;
    const originY = e.clientY;

    this.dragSession = {
      pointerId,
      view,
      sourcePanel,
      originX,
      originY,
      started: false,
      captureEl,
      abortController: this.bindPointerSession({
        pointerId,
        captureEl,
        onMove: moveEvent => {
          const dragSession = this.dragSession;
          if (!dragSession) return;

          if (!dragSession.started) {
            const moved = this.mouseMovedBeyondThreshold(
              moveEvent.clientX,
              moveEvent.clientY,
              dragSession.originX,
              dragSession.originY,
            );
            if (!moved) return;
            dragSession.started = true;
          }

          this.updateDragTarget(moveEvent);
        },
        onEnd: () => {
          const dragSession = this.dragSession;
          if (!dragSession) return;

          if (dragSession.started && this.targetPanel) {
            this.workspace.moveView(
              dragSession.view,
              dragSession.sourcePanel,
              this.targetPanel,
              this.targetIndex,
              this.splitIntent,
            );
          }

          this.resetDragSession();
        },
      }),
    };

    this.sourcePanel = sourcePanel;
    this.targetPanel = sourcePanel;
    this.targetIndex = sourcePanel.activeIndex.val;
    this.splitIntent = null;
    this.indicatorStyle.val = "display: none;";
  }

  private updateDragTarget(e: PointerEvent): void {
    const hitContainer = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest(".view-container") as ViewContainerElement | null;

    if (!hitContainer || !hitContainer.__workspacePanel) {
      this.clearDropTarget();
      return;
    }

    this.targetPanel = hitContainer.__workspacePanel;

    const rect = hitContainer.querySelector(".views")?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) / rect.width; // Normalize X to panel width to allow for easier dragging when panels are small.
    const y = (e.clientY - rect.top) / rect.height; // Normalize Y to panel height to allow for easier dragging when panels are small.

    const closestEdge = [
      {
        // left edge
        distance: x,
        fn: () => this.applySplitIndicator("horizontal", true, rect),
      },
      {
        // right edge
        distance: 1 - x,
        fn: () => this.applySplitIndicator("horizontal", false, rect),
      },
      {
        // top edge
        distance: y,
        fn: () => this.applySplitIndicator("vertical", true, rect),
      },
      {
        // bottom edge
        distance: 1 - y,
        fn: () => this.applySplitIndicator("vertical", false, rect),
      },
    ].reduce((closest, current) => (current.distance < closest.distance ? current : closest));

    if (closestEdge.distance < 0) {
      // Default: User is dragging within the tabs zone, trigger default tab reordering
      this.splitIntent = null;

      const tabsRow = hitContainer.querySelector(".tabs");
      if (!tabsRow) return;
      const rowRect = tabsRow.getBoundingClientRect();

      const tabs = Array.from(tabsRow.querySelectorAll(".tab[data-tab-index]"));
      let dropIndex = tabs.length;
      let indicatorLeft = rowRect.left;

      for (let i = 0; i < tabs.length; i++) {
        const tabRect = tabs[i].getBoundingClientRect();
        const midpoint = tabRect.left + tabRect.width / 2;
        if (e.clientX < midpoint) {
          dropIndex = i;
          indicatorLeft = tabRect.left;
          break;
        }
        if (i === tabs.length - 1) {
          indicatorLeft = tabRect.right;
        }
      }

      this.targetIndex = dropIndex;
      this.indicatorStyle.val = `top: ${rowRect.top}px; left: ${indicatorLeft - 2}px; height: ${rowRect.height}px; width: 4px;`;
    } else if (closestEdge.distance < 0.5) {
      // Define edge tracking sensitivity (50% boundary zone width)
      closestEdge.fn();
    } else {
      this.clearDropTarget();
    }
  }

  private mouseMovedBeyondThreshold(
    clientX: number,
    clientY: number,
    originX: number,
    originY: number,
  ): boolean {
    return Math.max(Math.abs(clientX - originX), Math.abs(clientY - originY)) > 5;
  }

  private resetDragSession(): void {
    this.dragSession = null;
    this.sourcePanel = null;
    this.targetPanel = null;
    this.splitIntent = null;
    this.indicatorStyle.val = "display: none;";
  }

  startDragResize(panel: PanelContainer, dividerIndex: number, e: PointerEvent): boolean {
    if (this.dragSession || this.resizeSession || panel.children.val.length < 2) return false;
    const captureEl = e.currentTarget;
    if (!(captureEl instanceof HTMLElement)) return false;

    const first = panel.children.val[dividerIndex];
    const second = panel.children.val[dividerIndex + 1];
    if (!first || !second) return false;

    const containerEl = captureEl.parentElement as HTMLElement | null;
    if (!containerEl) return false;

    e.preventDefault();
    e.stopPropagation();
    captureEl.setPointerCapture(e.pointerId);

    const pointerId = e.pointerId;
    const direction = panel.direction;
    const origin = direction === "horizontal" ? e.clientX : e.clientY;
    const totalFlex = panel.children.val.reduce((sum, child) => sum + child.size.val, 0) || 1;

    const containerRect = containerEl.getBoundingClientRect();
    const containerMainSize = direction === "horizontal" ? containerRect.width : containerRect.height;

    const computed = getComputedStyle(containerEl);
    const gap = Number.parseFloat(computed.gap || "0") || 0;
    const containerSize = Math.max(1, containerMainSize - gap * Math.max(panel.children.val.length - 1, 0));

    this.resizeSession = {
      pointerId,
      panel,
      dividerIndex,
      origin,
      containerSize,
      totalFlex,
      startSizes: [first.size.val, second.size.val],
      direction,
      captureEl,
      abortController: this.bindPointerSession({
        pointerId,
        captureEl,
        onMove: moveEvent => this.updateResize(moveEvent),
        onEnd: () => this.resetResizeSession(),
      }),
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
    return true;
  }

  private updateResize(e: PointerEvent): void {
    const resizeSession = this.resizeSession;
    if (!resizeSession) return;

    const current = resizeSession.direction === "horizontal" ? e.clientX : e.clientY;
    const deltaPx = current - resizeSession.origin;
    const deltaFlex = (deltaPx / resizeSession.containerSize) * resizeSession.totalFlex;

    const [startA, startB] = resizeSession.startSizes;
    let nextA = startA + deltaFlex;
    let nextB = startB - deltaFlex;

    if (nextA < this.minPanelFlex) {
      nextB -= this.minPanelFlex - nextA;
      nextA = this.minPanelFlex;
    }
    if (nextB < this.minPanelFlex) {
      nextA -= this.minPanelFlex - nextB;
      nextB = this.minPanelFlex;
    }

    nextA = Math.max(this.minPanelFlex, nextA);
    nextB = Math.max(this.minPanelFlex, nextB);

    const first = resizeSession.panel.children.val[resizeSession.dividerIndex];
    const second = resizeSession.panel.children.val[resizeSession.dividerIndex + 1];
    if (!first || !second) return;

    first.size.val = nextA;
    second.size.val = nextB;
  }

  private resetResizeSession(): void {
    this.resizeSession = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }

  reset(): void {
    const dragSession = this.dragSession;
    if (dragSession) {
      dragSession.abortController.abort();
      if (dragSession.captureEl.hasPointerCapture(dragSession.pointerId)) {
        dragSession.captureEl.releasePointerCapture(dragSession.pointerId);
      }
    }

    const resizeSession = this.resizeSession;
    if (resizeSession) {
      resizeSession.abortController.abort();
      if (resizeSession.captureEl.hasPointerCapture(resizeSession.pointerId)) {
        resizeSession.captureEl.releasePointerCapture(resizeSession.pointerId);
      }
    }

    this.resetDragSession();
    this.resetResizeSession();
  }

  destroy(): void {
    this.reset();
  }
}

export function mobileDragController({
  onSettle,
}: {
  onSettle?: (offset: number) => void;
} = {}) {
  const offset = van.state(0);
  let startPointer: PointerEvent | null = null;
  let intent: (() => void) | null = null;
  let startingOffset = 0;

  const setStartingOffset = () =>
    (offset.val = startingOffset = Math.min(Math.max(-1, Math.round(offset.val)), 1));

  const reset = (): void => {
    startPointer = null;
    setStartingOffset();
    intent = null;
  };

  const cancel = (): void => {
    offset.val = startingOffset;
    reset();
  };

  const executeIntent = (): void => {
    if (!startPointer) return;

    intent?.();
    reset();
    onSettle?.(offset.val);
  };

  return {
    onpointerdown: (e: PointerEvent): void => {
      if (Platform.isWideScreen.val) return cancel();

      startPointer = e;
      setStartingOffset();
    },
    onpointermove: (e: PointerEvent): void => {
      if (!startPointer || Platform.isWideScreen.val) return cancel();

      const deltaX = e.clientX - startPointer.clientX;
      const deltaY = e.clientY - startPointer.clientY;

      const threshold = 0.2;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        offset.val = startingOffset + (deltaX / window.innerWidth) * 3;
        if (startingOffset === 0) {
          if (offset.val < -threshold) {
            intent = () => (offset.val = -1);
          } else if (offset.val > threshold) {
            intent = () => (offset.val = 1);
          } else {
            intent = null;
          }
        } else if (Math.abs(offset.val) < 1 - threshold) {
          intent = () => (offset.val = 0);
        } else {
          intent = null;
        }
      } else {
        offset.val = startingOffset;
        intent = null;
      }
    },
    onpointerup: executeIntent,
    onpointercancel: executeIntent,
    onpointerleave: (e: PointerEvent) => {
      if (e.relatedTarget !== null) return;
      executeIntent();
    },
    style: () =>
      `--first-pane-offset: ${Math.min(0, Math.max(-1, -1 + offset.val)) * 100}%; --last-pane-offset: ${Math.max(0, Math.min(1, 1 + offset.val)) * 100}%;`,
  };
}
