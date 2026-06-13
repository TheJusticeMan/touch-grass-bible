import van, { State } from "vanjs-core";
import { View, LayoutController } from "./State";
import { ViewContainer, SplitIntent, PanelContainer, ViewContainerElement } from "./Types";

export class WorkspaceDragController {
  public isDragging = van.state(false);
  public isMouseDown = van.state(false);
  public mouseOrigin: PointerEvent | null = null;
  public view: State<View> | null = null;
  public sourcePanel: ViewContainer | null = null;
  public targetPanel: ViewContainer | null = null;
  public targetIndex = 0;
  public splitIntent: SplitIntent | null = null;
  public indicatorStyle = van.state("display: none;");

  private isResizing = false;
  private resizePanel: PanelContainer | null = null;
  private resizeDividerIndex = -1;
  private resizeOrigin = 0;
  private resizeContainerSize = 1;
  private resizeTotalFlex = 1;
  private resizeStartSizes: [number, number] = [1, 1];
  private readonly minPanelFlex = 0.2;
  private activePointerId: number | null = null;

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;

    if (this.isResizing) {
      this.reset();
      return;
    }

    if (!this.isDragging.val) return void (this.isMouseDown.val = false);

    const view = this.view;
    const source = this.sourcePanel;
    const target = this.targetPanel;
    const targetIdx = this.targetIndex;
    const splitIntent = this.splitIntent;

    if (view && source && target) {
      this.workspace.moveView(view, source, target, targetIdx, splitIntent);
    }

    this.reset();
  };

  constructor(private readonly workspace: LayoutController) {
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
  }

  startTabDrag(view: State<View>, sourcePanel: ViewContainer, e: PointerEvent): void {
    e.preventDefault();

    this.activePointerId = e.pointerId;

    this.isDragging.val = false; // Will become true on mouse move to prevent accidental drags
    this.isMouseDown.val = true;
    this.mouseOrigin = e;
    this.view = view;
    this.sourcePanel = sourcePanel;
    this.targetPanel = sourcePanel;
    this.targetIndex = sourcePanel.activeIndex.val;
    this.splitIntent = null;
  }

  handlePanelPointerMove(panel: ViewContainer, e: PointerEvent): void {
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;

    if (e.pointerType !== "mouse" && (this.isMouseDown.val || this.isDragging.val || this.isResizing)) {
      e.preventDefault();
    }

    if (this.isResizing) return;

    if (!this.isDragging.val)
      if (this.isMouseDown.val)
        if (this.mouseMovedBeyondThreshold(e, this.mouseOrigin || e)) this.isDragging.val = true;
        else return void (this.isDragging.val = false);
      else return this.reset();

    let targetPanel = panel;
    let targetContainerEl = e.currentTarget as HTMLElement | null;

    // Touch pointers keep implicit capture on the original element; live hit-test instead.
    if (e.pointerType !== "mouse") {
      const hitContainer = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest(".view-container") as HTMLElement | null;

      if (!hitContainer) {
        this.targetPanel = null;
        this.splitIntent = null;
        this.indicatorStyle.val += "transform: scale(0); opacity: 0;";
        return;
      }

      targetContainerEl = hitContainer;
      const hitPanel = (hitContainer as ViewContainerElement).__workspacePanel;
      if (hitPanel) targetPanel = hitPanel;
    }

    this.targetPanel = targetPanel;

    const rect = targetContainerEl?.querySelector(".views")?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width; // Normalize X to panel width to allow for easier dragging when panels are small.
    const y = (e.clientY - rect.top) / rect.height; // Normalize Y to panel height to allow for easier dragging when panels are small.

    const closestEdge = [
      {
        // left edge
        distance: x,
        fn: () => (
          (this.splitIntent = { direction: "horizontal", before: true }),
          (this.indicatorStyle.val = `top: ${rect.top}px; left: ${rect.left}px; height: ${rect.height}px; width: ${rect.width / 4}px;`)
        ),
      },
      {
        // right edge
        distance: 1 - x,
        fn: () => (
          (this.splitIntent = { direction: "horizontal", before: false }),
          (this.indicatorStyle.val = `top: ${rect.top}px; left: ${rect.left + rect.width * 0.75}px; height: ${rect.height}px; width: ${rect.width / 4}px;`)
        ),
      },
      {
        // top edge
        distance: y,
        fn: () => (
          (this.splitIntent = { direction: "vertical", before: true }),
          (this.indicatorStyle.val = `top: ${rect.top}px; left: ${rect.left}px; height: ${rect.height / 4}px; width: ${rect.width}px;`)
        ),
      },
      {
        // bottom edge
        distance: 1 - y,
        fn: () => (
          (this.splitIntent = { direction: "vertical", before: false }),
          (this.indicatorStyle.val = `top: ${rect.top + rect.height * 0.75}px; left: ${rect.left}px; height: ${rect.height / 4}px; width: ${rect.width}px;`)
        ),
      },
    ].reduce((closest, current) => (current.distance < closest.distance ? current : closest));

    if (closestEdge.distance < 0) {
      // Default: User is dragging within the tabs zone, trigger default tab reordering
      this.splitIntent = null;

      const tabsRow = targetContainerEl?.querySelector(".tabs");
      if (!tabsRow) return;

      const tabs = Array.from(tabsRow.querySelectorAll(".tab:not(.dragging)"));
      let dropIndex = tabs.length;
      let indicatorLeft = tabsRow.getBoundingClientRect().left;

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
      const rowRect = tabsRow.getBoundingClientRect();

      this.indicatorStyle.val = `top: ${rowRect.top}px; left: ${indicatorLeft - 2}px; height: ${rowRect.height}px; width: 4px;`;
    } else if (closestEdge.distance < 0.5) {
      // Define edge tracking sensitivity (50% boundary zone width)
      closestEdge.fn();
    }
  }

  mouseMovedBeyondThreshold(e: PointerEvent, Origin: PointerEvent) {
    return Math.max(Math.abs(e.clientX - Origin.clientX), Math.abs(e.clientY - Origin.clientY)) > 5;
  }

  handlePanelPointerLeave(panel: ViewContainer, e: PointerEvent): void {
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;

    if (e.pointerType !== "mouse" && this.isDragging.val) return;

    if (this.isResizing) return;

    if (this.targetPanel === panel) {
      this.targetPanel = null;
      this.splitIntent = null;
      this.indicatorStyle.val += "transform: scale(0); opacity: 0;";
    }
  }

  startDragResize(panel: PanelContainer, e: PointerEvent): boolean {
    // Ignore resize start while a tab drag gesture is in progress.
    if (this.isDragging.val || this.isMouseDown.val || panel.children.val.length < 2) return false;

    const containerEl = e.currentTarget as HTMLElement;
    const childEls = Array.from(containerEl.children) as HTMLElement[];
    if (childEls.length < 2) return false;

    const pointer = panel.direction === "horizontal" ? e.clientX : e.clientY;

    let closestDivider = -1;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < childEls.length - 1; i++) {
      const a = childEls[i].getBoundingClientRect();
      const b = childEls[i + 1].getBoundingClientRect();
      const divider = panel.direction === "horizontal" ? (a.right + b.left) / 2 : (a.bottom + b.top) / 2;
      const distance = Math.abs(pointer - divider);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestDivider = i;
      }
    }

    const hitThreshold = 12;
    if (closestDivider < 0 || closestDistance > hitThreshold) return false;

    this.activePointerId = e.pointerId;
    this.isMouseDown.val = false;

    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    if (e.pointerType !== "mouse") {
      // Claim touch/pen gestures only after a real divider hit to preserve panel swipe gestures.
      e.preventDefault();
      e.stopPropagation();
    }

    const first = panel.children.val[closestDivider];
    const second = panel.children.val[closestDivider + 1];
    const firstSize = first.size.val;
    const secondSize = second.size.val;

    this.isResizing = true;
    this.resizePanel = panel;
    this.resizeDividerIndex = closestDivider;
    this.resizeOrigin = pointer;
    this.resizeStartSizes = [firstSize, secondSize];
    this.resizeTotalFlex = panel.children.val.reduce((sum, child) => sum + child.size.val, 0) || 1;

    const containerRect = containerEl.getBoundingClientRect();
    const containerMainSize = panel.direction === "horizontal" ? containerRect.width : containerRect.height;

    const computed = getComputedStyle(containerEl);
    const gap = Number.parseFloat(computed.gap || "0") || 0;
    this.resizeContainerSize = Math.max(
      1,
      containerMainSize - gap * Math.max(panel.children.val.length - 1, 0),
    );

    document.body.style.userSelect = "none";
    document.body.style.cursor = panel.direction === "horizontal" ? "col-resize" : "row-resize";
    return true;
  }

  handlePanelResize(panel: PanelContainer, e: PointerEvent) {
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;

    if (!this.isResizing || this.resizePanel !== panel || this.resizeDividerIndex < 0) return;

    const current = panel.direction === "horizontal" ? e.clientX : e.clientY;
    const deltaPx = current - this.resizeOrigin;
    const deltaFlex = (deltaPx / this.resizeContainerSize) * this.resizeTotalFlex;

    const [startA, startB] = this.resizeStartSizes;
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

    const first = panel.children.val[this.resizeDividerIndex];
    const second = panel.children.val[this.resizeDividerIndex + 1];
    if (!first || !second) return;

    first.size.val = nextA;
    second.size.val = nextB;
  }

  reset(): void {
    this.isDragging.val = false;
    this.isMouseDown.val = false;
    this.isResizing = false;
    this.resizePanel = null;
    this.resizeDividerIndex = -1;
    this.activePointerId = null;
    this.view = null;
    this.sourcePanel = null;
    this.targetPanel = null;
    this.splitIntent = null;
    this.indicatorStyle.val = "display: none;";
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
  }

  destroy(): void {
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this.reset();
  }
}

export function mobileDragController({
  onSettle,
}: {
  onSettle?: (offset: number) => void;
} = {}) {
  const MOBILE_BREAKPOINT_MEDIA_QUERY = "(max-width: 700px)";
  const mobileBreakpointMql = window.matchMedia(MOBILE_BREAKPOINT_MEDIA_QUERY);

  const isMobileDragging = van.state(false);
  const offset = van.state(0);
  let startPointer: PointerEvent | null = null;
  let intent: (() => void) | null = null;
  let startingOffset = 0;

  const setStartingOffset = (value: number): void => {
    startingOffset = Math.min(Math.max(-1, Math.round(value)), 1);
    offset.val = startingOffset;
  };

  const reset = (): void => {
    isMobileDragging.val = false;
    startPointer = null;
    setStartingOffset(offset.val);
    intent = null;
  };

  const cancel = (): void => {
    offset.val = startingOffset;
    reset();
  };

  mobileBreakpointMql.addEventListener("change", () => {
    isMobileDragging.val = false;
  });

  const onpointerdown = (e: PointerEvent): void => {
    isMobileDragging.val = mobileBreakpointMql.matches;
    if (!isMobileDragging.val) return cancel();

    startPointer = e;
    setStartingOffset(offset.val);
  };

  const onpointermove = (e: PointerEvent): void => {
    if (!isMobileDragging.val || !startPointer || !mobileBreakpointMql.matches) return cancel();

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
  };

  const onpointerup = (): void => {
    intent?.();
    reset();
    onSettle?.(offset.val);
  };

  return {
    onpointerdown,
    onpointermove,
    onpointerup,
    onpointercancel: onpointerup,
    onpointerleave: onpointerup,
    style: () =>
      `--first-pane-offset: ${Math.min(0, Math.max(-1, -1 + offset.val)) * 100}%; --last-pane-offset: ${Math.max(0, Math.min(1, 1 + offset.val)) * 100}%;`,
  };
}
