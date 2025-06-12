type HandlerInfo = {
  eventName: string;
  handler: (e: any) => void;
};

export class Chainable {
  next(callback: (a: this) => void): this {
    callback(this); // Use setTimeout to ensure the callback is executed in the next event loop cycle
    return this;
  }
}

/**
 * Abstract base class providing a simple event handling system.
 *
 * `ETarget` allows attaching, detaching, and emitting event handlers for named events.
 * It supports method chaining for handler management and provides a mechanism to
 * automatically unsubscribe handlers when specific events occur.
 *
 * @template HandlerInfo - The type describing information about the last registered handler.
 *
 * @example
 * class MyEmitter extends ETarget {}
 * const emitter = new MyEmitter();
 * emitter.on('foo', (e) => console.log(e)).emit('foo', { data: 123 });
 */
export abstract class ETarget extends Chainable {
  private handlers: {
    [eventName: string]: Array<(e: any) => void>;
  } = {};
  lastHandler: HandlerInfo;

  /**
   * Registers an event handler for the specified event name.
   *
   * @param eventName - The name of the event to listen for.
   * @param handler - The callback function to invoke when the event is emitted.
   * @returns The current instance for method chaining.
   */
  on(eventName: string, handler: (e: any) => void): this {
    if (!this.handlers[eventName]) this.handlers[eventName] = [];
    this.handlers[eventName].push(handler);
    this.lastHandler = { eventName, handler };
    return this;
  }

  /**
   * Removes a previously registered event handler for the specified event.
   *
   * @param eventName - The name of the event to remove the handler from.
   * @param handler - The event handler function to remove.
   * @returns The current instance for method chaining.
   */
  off(eventName: string, handler: (e: any) => void): this {
    if (!this.handlers[eventName]) return this;
    this.handlers[eventName] = this.handlers[eventName].filter(h => h !== handler);
    return this;
  }

  /**
   * Removes event handlers.
   *
   * If an `eventName` is provided, removes all handlers associated with that event.
   * If no `eventName` is specified, removes all handlers for all events.
   *
   * @param eventName - (Optional) The name of the event whose handlers should be removed.
   * @returns The current instance for method chaining.
   */
  clear(eventName?: string): this {
    if (eventName) delete this.handlers[eventName];
    else this.handlers = {};
    return this;
  }

  /**
   * Emits an event with the specified name, invoking all registered handlers for that event.
   *
   * @param eventName - The name of the event to emit.
   * @param e - Optional event data to pass to each handler. Defaults to `null`.
   * @returns The current instance for method chaining.
   */
  emit(eventName: string, e: any = null) {
    this.handlers[eventName]?.forEach(handler => handler(e));
    return this;
  }

  /**
   * Registers a handler to automatically unsubscribe from a specific event when another event occurs.
   *
   * @param unsubscribeOn - The name of the event that will trigger the unsubscription.
   * @param event - The event object containing the handler to be unsubscribed.
   * @returns The current instance for method chaining.
   */
  cancelOn(unsubscribeOn: string, event: ETarget) {
    const theHandler = event.lastHandler;
    this.on(unsubscribeOn, () => event.off(theHandler.eventName, theHandler.handler));
    return this;
  }
}

/**
 * A class that handles touch-based drag gestures on a given HTMLElement.
 *
 * `touchDragger` emits custom events during the drag lifecycle:
 * - `"draggingX"`: Emitted during horizontal dragging with the current `deltaX`.
 * - `"draggingY"`: Emitted during vertical dragging with the current `deltaY`.
 * - `"dragX"`: Emitted when a horizontal drag gesture passes the threshold.
 * - `"dragY"`: Emitted when a vertical drag gesture passes the threshold.
 * - `"dragCancel"`: Emitted when the drag gesture does not pass any threshold.
 * - `"dragXcancel"`: Emitted when a vertical drag is detected or drag is cancelled.
 * - `"dragYcancel"`: Emitted when a horizontal drag is detected or drag is cancelled.
 *
 * The drag direction is determined by comparing the absolute values of `deltaX` and `deltaY`.
 * Only single-finger touches are handled.
 *
 * @extends ETarget
 *
 * @example
 * ```typescript
 * const dragger = new touchDragger(element);
 * dragger.setThreshold(100);
 * dragger.on("dragX", ({ deltaX }) => { /* handle horizontal drag *\/ });
 * dragger.on("dragY", ({ deltaY }) => { /* handle vertical drag *\/ });
 * ```
 *
 * @param element The HTMLElement to attach touch event listeners to.
 *
 * @method setThreshold Sets the minimum distance (in pixels) required to trigger a drag event.
 */
export class touchDragger extends ETarget {
  private startX: number = 0;
  private startY: number = 0;
  private currentX: number = 0;
  private currentY: number = 0;
  private threshold: number = 50;

  constructor(element: HTMLElement) {
    super();
    element.addEventListener("touchstart", this.onTouchStart, { passive: true });
    element.addEventListener("touchmove", this.onTouchMove, { passive: true });
    element.addEventListener("touchend", this.onTouchEnd, { passive: true });
  }

  private onTouchStart = (event: TouchEvent): void => {
    if (event.touches.length > 1) return; // Only handle single-finger touches
    this.startX = event.touches[0].pageX;
    this.startY = event.touches[0].pageY;
    this.currentX = this.startX;
    this.currentY = this.startY;
  };

  private onTouchMove = (event: TouchEvent): void => {
    if (event.touches.length > 1) return; // Only handle single-finger touches
    this.currentX = event.touches[0].pageX;
    this.currentY = event.touches[0].pageY;

    const deltaX = this.currentX - this.startX;
    const deltaY = this.currentY - this.startY;

    // Apply translation to the element
    if (Math.abs(deltaY) < Math.abs(deltaX)) {
      this.emit("draggingX", { deltaX });
    } else {
      this.emit("draggingY", { deltaY });
    }
  };

  private onTouchEnd = (): void => {
    // Reset the element's position after dragging
    const deltaX = this.currentX - this.startX;
    const deltaY = this.currentY - this.startY;

    if (Math.abs(deltaX) > this.threshold && Math.abs(deltaY) < Math.abs(deltaX)) {
      this.emit("dragX", { deltaX });
      this.emit("dragYcancel", { deltaX: 0, deltaY: 0 });
    } else if (Math.abs(deltaY) > this.threshold) {
      this.emit("dragY", { deltaY });
      this.emit("dragXcancel", { deltaX: 0, deltaY: 0 });
    } else {
      this.emit("dragCancel", { deltaX: 0, deltaY: 0 });
      this.emit("dragXcancel", { deltaX: 0, deltaY: 0 });
      this.emit("dragYcancel", { deltaX: 0, deltaY: 0 });
    }
  };

  /**
   * Sets the threshold value for the current instance.
   *
   * @param value - The new threshold value to be set.
   * @returns The current instance for method chaining.
   */
  setThreshold(value: number): this {
    this.threshold = value;
    return this;
  }
}
