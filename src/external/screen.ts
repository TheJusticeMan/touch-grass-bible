import { App, Openable } from "./App";
import { ETarget, touchDragger } from "./Event";
import "./screen.css";

export abstract class ScreenView<T extends App> extends ETarget<{
  menuclick: MouseEvent;
  titleclick: MouseEvent;
  [key: string]: any;
}> {
  protected header: HTMLElement;
  content: HTMLElement;
  protected titleEl: HTMLElement;
  constructor(element: HTMLElement, protected app: T) {
    super();
    // Create the main navbar container
    this.header = element.createEl("div", { cls: "navbar" }, el => {
      this.titleEl = el.createEl("div", { cls: "navBarTitle", text: app.title });
      el.addEventListener("contextmenu", e => this.emit("menuclick", e), true);
      el.addEventListener("click", e => this.emit("titleclick", e));
    });

    // Create main content area
    this.content = element.createEl("div", { cls: "content" });
  }

  abstract onload(): void;

  sptitle(cb: (frag: DocumentFragment) => DocumentFragment): void {
    const value = cb(document.createDocumentFragment());
    this.titleEl.empty(); // Clear existing title content
    this.titleEl.appendChild(value);
  }

  // Getter and setter for the title, synchronized with the app
  get title(): string {
    return this.app.title;
  }

  set title(value: string) {
    this.app.title = value;
    this.titleEl.textContent = value;
  }

  // Getter and setter for the current verse
  update(): void {
    this.content.empty();
  }
  waitFullUpdate(cb: () => void): void {
    // Wait for the next full update cycle before executing the callback
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => cb()));
  }
}

/**
 * Scrollpast
 *
 * A utility class for detecting and handling "scroll past" behavior at the top or bottom of an element.
 * Emits custom events ("scrollpasttop", "scrollpastbottom") when the user pulls past the scroll boundaries via touch.
 * Designed to be extendable for custom visual feedback on swipe.
 *
 * @extends ETarget
 */
export class Scrollpast extends ETarget<{
  scrollpasttop: number;
  scrollpastbottom: number;
  [key: string]: any;
}> {
  /**
   * Y-coordinate where the touch started.
   * @private
   */
  private startY: number = 0;

  /**
   * The latest Y-coordinate during touch interaction.
   * @private
   */
  private currentY: number = 0;

  /**
   * Minimum distance in pixels required to trigger a "scroll past".
   * @private
   */
  private threshold: number = 100;

  /**
   * Adjustment buffer for browsers that do not allow scrolling all the way to the bottom.
   * @private
   */
  private buffer: number = 60;

  /**
   * Constructs a Scrollpast handler for an element.
   *
   * @param element - The scrollable HTML element to attach handlers to.
   * @param parent - (Optional) A parent ETarget to propagate "scroll past" events to.
   */
  constructor(private element: HTMLElement, private parent?: ETarget) {
    super();
    element.addEventListener("touchstart", this.touchStart, { passive: true });
    element.addEventListener("touchmove", this.touchMove, { passive: true });
    element.addEventListener("touchend", this.touchEnd, { passive: true });
  }

  /**
   * Indicates if the scroll position is at the very top of the element.
   *
   * @returns Whether the element is scrolled to (or above) the top.
   * @private
   */
  private get isAtTop(): boolean {
    return this.element.scrollTop <= 0;
  }

  /**
   * Indicates if the scroll position is at (or near) the very bottom of the element,
   * accounting for the {@link buffer} fudge factor.
   *
   * @returns Whether the element is scrolled to the bottom.
   * @private
   */
  private get isAtBottom(): boolean {
    return this.element.scrollTop + this.element.offsetHeight >= this.element.scrollHeight - this.buffer;
  }

  /**
   * Resets internal state values and any applied element styles.
   * Used to clean up after canceled or completed touches.
   * @private
   */
  private resetValues(): void {
    this.startY = 0;
    this.currentY = 0;
    this.element.style.transition = "";
    this.element.style.transform = "none";
  }

  /**
   * Handler for the 'touchstart' event.
   * Initializes tracking if the touch is single-finger and at a scroll boundary.
   *
   * @param event - The originating TouchEvent.
   * @private
   */
  private touchStart = (event: TouchEvent): void => {
    if (event.touches.length > 1) return this.resetValues();
    if (!this.isAtBottom && !this.isAtTop) return this.resetValues();
    this.startY = event.touches[0].pageY;
    this.currentY = this.startY;
  };

  /**
   * Handler for the 'touchmove' event.
   * Applies visual feedback if a user pulls past the appropriate scroll bounds.
   *
   * @param event - The originating TouchEvent.
   * @private
   */
  private touchMove = (event: TouchEvent): void => {
    if (event.touches.length > 1) return this.resetValues();
    if (!this.isAtBottom && !this.isAtTop) return this.resetValues();

    const { scrollTop, offsetHeight, scrollHeight } = this.element;

    // If touchMove happens before touchStart (e.g., interrupted sequence), re-initialize
    if (this.startY === 0) this.touchStart(event);

    this.currentY = event.touches[0].pageY;
    const distance = this.currentY - this.startY;

    // At the top, pulling down (distance > 0); at bottom, pulling up (distance < 0)
    if ((this.isAtTop && distance > 0) || (this.isAtBottom && distance < 0)) {
      // Non-linear visual stretch
      this.element.style.transition = "";
      this.element.style.transformOrigin = this.isAtBottom && distance < 0 ? "top" : "bottom";
      const farness = 1 - Math.exp(-Math.abs(distance) / 200);
      this.element.style.transform = `scale(1,${1 - farness * 0.1}) `;
    }
  };

  /**
   * Handler for the 'touchend' event.
   * Determines if a scroll-past event should be fired and calls visual feedback.
   * Otherwise, resets state.
   *
   * @private
   */
  private touchEnd = (): void => {
    this.element.style.transition = "transform 0.3s ease-out";
    this.element.style.transform = "none";
    const distance = this.currentY - this.startY;

    if (distance > this.threshold && this.isAtTop) {
      this.emit("scrollpasttop", distance);
      this.parent?.emit("scrollpasttop", distance);
      this.animateSwipe("down");
    } else if (distance < -this.threshold && this.isAtBottom) {
      this.emit("scrollpastbottom", distance);
      this.parent?.emit("scrollpastbottom", distance);
      this.animateSwipe("up");
    } else this.resetValues();
  };

  /**
   * Optionally override to implement custom animation for swipe-past feedback.
   * Default implementation does nothing.
   *
   * @param direction - 'up' for swipe past bottom, 'down' for swipe past top.
   * @protected
   */
  protected animateSwipe(direction: "up" | "down"): void {
    // Optionally implement visual feedback for swipe, e.g. flicker, bounce, confetti, guilt...
  }
}

export class sidePanel<T extends App> extends Openable<
  T,
  {
    open: void;
    close: void;
    [key: string]: any;
  }
> {
  private element: HTMLElement;
  content: HTMLDivElement;

  constructor(public app: T, parent: HTMLElement, private direction: "left" | "right" = "right") {
    super(app);
    this.direction = direction;
    this.element = parent.createEl("div", { cls: "sidepanel" });
    this.element.classList.add(direction);
    this.element.style.transform = `translateX(${direction === "left" ? "-100%" : "100%"})`;
    this.content = this.element.createEl("div", { cls: "sidepanel-content" });
    this.on("draggingX", e => {
      const deltaX = e.deltaX;
      if (this.isOpen) {
        if (deltaX < 0 && this.direction === "right") return; // Prevent dragging left if only right is allowed
        if (deltaX > 0 && this.direction === "left") return; // Prevent dragging right if only left is allowed
        this.setTransform(`${deltaX}px`, false);
      } else {
        this.setTransform(`calc(${deltaX}px + ${this.direction === "left" ? "-100%" : "100%"})`, false);
      }
    });
    this.on("dragX", e => {
      if (this.direction === (e.deltaX < 0 ? "left" : "right")) this.close(); // Close panel
      else this.setTransform("0", true); // Reset position
    });
    this.app.on("dragX", e => {
      if (this.direction === (e.deltaX > 0 ? "left" : "right")) this.open(); // Open panel
      else this.setTransform(this.direction === "left" ? "-100%" : "100%", true); // Reset position
    });
    this.on("dragXcancel", () => this.setTransform("0", true));
    this.app.on("dragXcancel", () => this.setTransform(this.direction === "left" ? "-100%" : "100%", true));
  }

  // Helper to set transform with optional animation
  private setTransform(translateX: string, final: boolean) {
    this.element.style.display = "block"; // Ensure the element is visible during animation
    this.waitFullUpdate(() => {
      this.element.style.transition = final ? "transform 0.3s ease" : "none";
      this.element.style.transform = `translateX(${translateX})`;
    });
    if (!this.isOpen && final) window.setTimeout(() => (this.element.style.display = "none"), 300); // Hide after transition if closed
  }

  waitFullUpdate(cb: () => void): void {
    // Wait for the next full update cycle before executing the callback
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => cb()));
  }

  getFullUpdate(): Promise<void> {
    // Returns a promise that resolves after the next full update cycle
    return new Promise(resolve => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
  }

  onopen(): void {
    this.setTransform("0", true); // Open panel to visible position
    this.emit("open");
  }
  onclose(): void {
    this.setTransform(this.direction === "left" ? "-100%" : "100%", true); // Reset position when closed
    this.emit("close");
  }

  _toggle(): void {
    if (this.isOpen) this.app.popTarget(); // Remove from target stack
    else this.app.pushTarget(this); // Add to target stack
    if (this.isOpen) this.emit("open");
    else this.emit("close");
    this.setTransform(this.isOpen ? "0" : this.direction === "left" ? "-100%" : "100%", true);
  }
}
