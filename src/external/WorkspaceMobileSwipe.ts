export class GlobalSwipeHandler {
  startPosition: Offset | null = null;
  currentPosition: Offset | null = null;
  screenWidth: number = 0;
  state: "leftopen" | "rightopen" | "none" = "none";
  constructor(private WorkspaceRoot: HTMLElement) {
    document.addEventListener("touchstart", this.handleTouchStart, false);
    document.addEventListener("touchmove", this.handleTouchMove, false);
    document.addEventListener("touchend", this.handleTouchEnd, false);
    document.addEventListener("mousedown", this.handleMouseDown, false);
    document.addEventListener("mousemove", this.handleMouseMove, false);
    document.addEventListener("mouseup", this.handleMouseUp, false);
  }
  handleTouchStart = (e: TouchEvent) => {
    this.startPosition = new Offset(e.touches[0].clientX, e.touches[0].clientY);
    this.screenWidth = window.innerWidth;
    // Handle touch start
  };
  handleTouchMove = (e: TouchEvent) => {
    if (!this.startPosition) return;
    this.currentPosition = new Offset(e.touches[0].clientX, e.touches[0].clientY);
    const delta = this.currentPosition.subtract(this.startPosition).scale(200 / this.screenWidth);
    if (this.state === "none") {
      if (delta.x > 20) {
        this.WorkspaceRoot.style.setProperty("--rightpanel-open", `${Math.min(0, -100 + delta.x)}%`);
      } else if (delta.x < -20) {
        this.WorkspaceRoot.style.setProperty("--leftpanel-open", `${Math.max(0, 100 + delta.x)}%`);
      } else {
        this.currentPosition = this.startPosition;
        this.WorkspaceRoot.style.setProperty("--rightpanel-open", `-100%`);
        this.WorkspaceRoot.style.setProperty("--leftpanel-open", `100%`);
      }
    } else if (this.state === "rightopen") {
      if (delta.x < -20) {
        this.WorkspaceRoot.style.setProperty("--rightpanel-open", `${Math.max(-100, delta.x)}%`);
      } else {
        this.WorkspaceRoot.style.setProperty("--rightpanel-open", `0%`);
      }
    } else if (this.state === "leftopen") {
      if (delta.x > 20) {
        this.WorkspaceRoot.style.setProperty("--leftpanel-open", `${Math.min(100, delta.x)}%`);
      } else {
        this.WorkspaceRoot.style.setProperty("--leftpanel-open", `0%`);
      }
    }

    // Handle touch move, e.g., determine swipe direction and distance
  };
  handleTouchEnd = () => {
    if (!this.startPosition) return;
    if (!this.currentPosition) return;
    const delta = this.currentPosition.subtract(this.startPosition).scale(200 / this.screenWidth);
    if (this.state === "none") {
      if (delta.x > 50) {
        this.WorkspaceRoot.style.setProperty("--rightpanel-open", `0%`);
        this.state = "rightopen";
      } else if (delta.x < -50) {
        this.WorkspaceRoot.style.setProperty("--leftpanel-open", `0%`);
        this.state = "leftopen";
      } else {
        this.WorkspaceRoot.style.setProperty("--rightpanel-open", `-100%`);
        this.WorkspaceRoot.style.setProperty("--leftpanel-open", `100%`);
        this.state = "none";
      }
    } else if (this.state === "rightopen") {
      if (delta.x < -50) {
        this.WorkspaceRoot.style.setProperty("--rightpanel-open", `-100%`);
        this.state = "none";
      } else {
        this.WorkspaceRoot.style.setProperty("--rightpanel-open", `0%`);
      }
    } else if (this.state === "leftopen") {
      if (delta.x > 50) {
        this.WorkspaceRoot.style.setProperty("--leftpanel-open", `100%`);
        this.state = "none";
      } else {
        this.WorkspaceRoot.style.setProperty("--leftpanel-open", `0%`);
      }
    }
    this.startPosition = null;
    this.currentPosition = null;
    // Handle touch end
  };
  handleMouseDown = (e: MouseEvent) => {
    this.startPosition = new Offset(e.clientX, e.clientY);
    this.screenWidth = window.innerWidth;

    // Handle mouse down
  };
  handleMouseMove = (e: MouseEvent) => {
    if (!this.startPosition) return;
    const currentPosition = new Offset(e.clientX, e.clientY);
    const delta = currentPosition.subtract(this.startPosition).scale(100 / this.screenWidth);
    // Handle mouse move, e.g., determine swipe direction and distance
  };
  handleMouseUp = (e: MouseEvent) => {
    // Handle mouse up
  };
}

class Offset {
  x: number;
  y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
  add(other: Offset) {
    return new Offset(this.x + other.x, this.y + other.y);
  }
  subtract(other: Offset) {
    return new Offset(this.x - other.x, this.y - other.y);
  }
  scale(factor: number) {
    return new Offset(this.x * factor, this.y * factor);
  }
  distanceTo(other: Offset) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
