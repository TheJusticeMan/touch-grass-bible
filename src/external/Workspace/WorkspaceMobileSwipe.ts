import { Offset } from "../Offset";

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
  state: SwipeState = "none";

  constructor(private WorkspaceRoot: HTMLElement) {
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
        this.setRightPanel(PANEL_OPEN);
        this.state = "rightopen";
      } else if (deltaX < -SNAP_THRESHOLD) {
        this.setLeftPanel(PANEL_OPEN);
        this.state = "leftopen";
      } else {
        this.closeBothPanels();
        this.state = "none";
      }
    } else if (this.state === "rightopen") {
      if (deltaX < -SNAP_THRESHOLD) {
        this.setRightPanel(RIGHT_PANEL_CLOSED);
        this.state = "none";
      } else {
        this.setRightPanel(PANEL_OPEN);
      }
    } else if (deltaX > SNAP_THRESHOLD) {
      this.setLeftPanel(LEFT_PANEL_CLOSED);
      this.state = "none";
    } else {
      this.setLeftPanel(PANEL_OPEN);
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
      if (this.state === "none") {
        this.closeBothPanels();
      } else if (this.state === "rightopen") {
        this.setRightPanel(PANEL_OPEN);
      } else {
        this.setLeftPanel(PANEL_OPEN);
      }
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
