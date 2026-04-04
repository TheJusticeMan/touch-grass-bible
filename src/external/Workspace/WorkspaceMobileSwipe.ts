import { Offset } from "../Offset";
import { Workspace } from "./Workspace";

type SwipeState = "leftopen" | "rightopen" | "none";

const DEADZONE_THRESHOLD = 20;
const SNAP_THRESHOLD = 25;
const TOUCH_SCALE_FACTOR = 200;
const MOUSE_SCALE_FACTOR = 100;
const MIN_HORIZONTAL_RATIO = 2; // Ignore swipes that are more vertical than horizontal

const RIGHT_PANEL_CLOSED = -100;
const LEFT_PANEL_CLOSED = 100;
const PANEL_OPEN = 0;

export class GlobalSwipeHandler {
  startPosition: Offset | null = null;
  currentPosition: Offset | null = null;
  screenWidth: number = 0;
  private _state: SwipeState = "none";

  public get state(): SwipeState {
    return this._state;
  }

  public set state(value: SwipeState) {
    this._state = value;

    if (value === "rightopen") {
      this.setRightPanel(PANEL_OPEN);
      this.setLeftPanel(LEFT_PANEL_CLOSED);
    } else if (value === "leftopen") {
      this.setLeftPanel(PANEL_OPEN);
      this.setRightPanel(RIGHT_PANEL_CLOSED);
    } else {
      this.closeBothPanels();
    }

    const panels = this.workspace?.rootPanel.childPanels;
    if (!panels?.length) return;
    if (value === "rightopen") {
      this.workspace!.setActivePanel(panels[0]?.panel ?? null);
    } else if (value === "leftopen") {
      this.workspace!.setActivePanel(panels[panels.length - 1]?.panel ?? null);
    } else {
      this.workspace!.setActivePanel(panels[Math.floor((panels.length - 1) / 2)]?.panel ?? null);
    }
  }

  constructor(
    private WorkspaceRoot: HTMLElement,
    private workspace?: Workspace,
  ) {
    document.addEventListener("touchstart", this.handleTouchStart, false);
    document.addEventListener("touchmove", this.handleTouchMove, false);
    document.addEventListener("touchend", this.handleTouchEnd, false);
    document.addEventListener("mousedown", this.handleMouseDown, false);
    document.addEventListener("mousemove", this.handleMouseMove, false);
    document.addEventListener("mouseup", this.handleMouseUp, false);
  }

  destroy() {
    document.removeEventListener("touchstart", this.handleTouchStart, false);
    document.removeEventListener("touchmove", this.handleTouchMove, false);
    document.removeEventListener("touchend", this.handleTouchEnd, false);
    document.removeEventListener("mousedown", this.handleMouseDown, false);
    document.removeEventListener("mousemove", this.handleMouseMove, false);
    document.removeEventListener("mouseup", this.handleMouseUp, false);
  }

  private setRightPanel(value: number) {
    this.WorkspaceRoot.style.setProperty("--rightpanel-open", `${value}%`);
  }

  private setLeftPanel(value: number) {
    this.WorkspaceRoot.style.setProperty("--leftpanel-open", `${value}%`);
  }

  private closeBothPanels() {
    this.setRightPanel(RIGHT_PANEL_CLOSED);
    this.setLeftPanel(LEFT_PANEL_CLOSED);
  }

  private beginGesture(x: number, y: number) {
    this.startPosition = new Offset(x, y);
    this.currentPosition = null;
    this.screenWidth = window.innerWidth;
  }

  private getDelta(scaleFactor: number): Offset | null {
    if (!this.startPosition || !this.currentPosition) return null;
    const width = Math.max(1, this.screenWidth);
    return this.currentPosition.subtract(this.startPosition).scale(scaleFactor / width);
  }

  private isHorizontalGesture(delta: Offset): boolean {
    return delta.ratio > MIN_HORIZONTAL_RATIO;
  }

  private applyMoveState(deltaX: number) {
    if (this.state === "none") {
      if (deltaX > DEADZONE_THRESHOLD) {
        this.setRightPanel(Math.min(PANEL_OPEN, RIGHT_PANEL_CLOSED + deltaX));
      } else if (deltaX < -DEADZONE_THRESHOLD) {
        this.setLeftPanel(Math.max(PANEL_OPEN, LEFT_PANEL_CLOSED + deltaX));
      } else {
        this.currentPosition = this.startPosition;
        this.closeBothPanels();
      }
      return;
    }

    if (this.state === "rightopen") {
      if (deltaX < -DEADZONE_THRESHOLD) {
        this.setRightPanel(Math.max(RIGHT_PANEL_CLOSED, deltaX));
      } else {
        this.setRightPanel(PANEL_OPEN);
      }
      return;
    }

    if (deltaX > DEADZONE_THRESHOLD) {
      this.setLeftPanel(Math.min(LEFT_PANEL_CLOSED, deltaX));
    } else {
      this.setLeftPanel(PANEL_OPEN);
    }
  }

  private applyEndState(deltaX: number) {
    if (this.state === "none") {
      if (deltaX > SNAP_THRESHOLD) {
        this.state = "rightopen";
      } else if (deltaX < -SNAP_THRESHOLD) {
        this.state = "leftopen";
      } else {
        this.state = "none";
      }
    } else if (this.state === "rightopen") {
      this.state = deltaX < -SNAP_THRESHOLD ? "none" : "rightopen";
    } else {
      this.state = deltaX > SNAP_THRESHOLD ? "none" : "leftopen";
    }
  }

  private updateGesture(x: number, y: number, scaleFactor: number) {
    if (!this.startPosition) return;
    this.currentPosition = new Offset(x, y);
    const delta = this.getDelta(scaleFactor);
    if (!delta || !this.isHorizontalGesture(delta)) return;
    this.applyMoveState(delta.x);
  }

  private endGesture(scaleFactor: number) {
    if (!this.startPosition) return;
    const delta = this.getDelta(scaleFactor);
    if (!delta || !this.isHorizontalGesture(delta)) {
      // Ignore clicks/vertical movement and preserve current open state.
      this.state = this._state;
      this.startPosition = null;
      this.currentPosition = null;
      return;
    }

    this.applyEndState(delta.x);
    this.startPosition = null;
    this.currentPosition = null;
  }

  handleTouchStart = (e: TouchEvent) => {
    this.beginGesture(e.touches[0].clientX, e.touches[0].clientY);
    // Handle touch start
  };

  handleTouchMove = (e: TouchEvent) => {
    this.updateGesture(e.touches[0].clientX, e.touches[0].clientY, TOUCH_SCALE_FACTOR);

    // Handle touch move, e.g., determine swipe direction and distance
  };

  handleTouchEnd = () => {
    this.endGesture(TOUCH_SCALE_FACTOR);
    // Handle touch end
  };

  handleMouseDown = (e: MouseEvent) => {
    this.beginGesture(e.clientX, e.clientY);

    // Handle mouse down
  };

  handleMouseMove = (e: MouseEvent) => {
    this.updateGesture(e.clientX, e.clientY, MOUSE_SCALE_FACTOR);
    // Handle mouse move, e.g., determine swipe direction and distance
  };

  handleMouseUp = (e: MouseEvent) => {
    this.currentPosition = new Offset(e.clientX, e.clientY);
    this.endGesture(MOUSE_SCALE_FACTOR);
    // Handle mouse up
  };
}
